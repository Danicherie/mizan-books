import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, nextSequenceNumber, postJournalEntry, type JournalLineInput } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { getTodayIso } from "@/lib/calendar";
import { resolveDocumentRate } from "@/lib/fx";
import { assertMutationOrigin } from "@/lib/origin";
import { agedPayables } from "@/lib/payables";
import {
  BILL_LINE_MONEY_FIELDS,
  fromMinor,
  INVOICE_MONEY_FIELDS,
  minorFromSql,
  mulMinor,
  percentOfMinor,
  toMinor,
  withMajorMoney,
} from "@/lib/money";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const bills = db
    .prepare(`
      SELECT b.*, v.name AS vendor_name, v.tin_number AS vendor_tin, a.code AS expense_account_code, a.name AS expense_account_name
      FROM bills b
      JOIN vendors v ON v.id = b.vendor_id AND v.company_id = b.company_id
      LEFT JOIN accounts a ON a.id = b.expense_account_id AND a.company_id = b.company_id
      WHERE b.company_id = ?
      ORDER BY b.issue_date DESC, b.id DESC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  const linesStmt = db.prepare("SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY id ASC");
  const hydrated = bills.map((b) => ({
    ...withMajorMoney(b, INVOICE_MONEY_FIELDS),
    lines: (linesStmt.all(b.id as number) as Array<Record<string, unknown>>).map((line) =>
      withMajorMoney(line, BILL_LINE_MONEY_FIELDS)
    ),
  }));

  const today = getTodayIso();
  const agingMinor = agedPayables(
    bills.map((bill) => ({
      due_date: String(bill.due_date),
      total: minorFromSql(bill.total),
      amount_paid: minorFromSql(bill.amount_paid),
      exchange_rate: Number(bill.exchange_rate ?? 1),
    })),
    today
  );
  const aging = {
    current: fromMinor(agingMinor.current),
    d1_30: fromMinor(agingMinor.d1_30),
    d31_60: fromMinor(agingMinor.d31_60),
    d61_90: fromMinor(agingMinor.d61_90),
    d90: fromMinor(agingMinor.d90),
  };

  return NextResponse.json({ bills: hydrated, aging });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      vendor_id: number;
      issue_date: string;
      due_date: string;
      expense_account_id: number;
      currency_code?: string;
      exchange_rate?: number;
      vat_rate?: number;
      wht_rate?: number;
      notes?: string;
      lines: Array<{ description: string; quantity: number; unit_cost: number }>;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    const company = getCompanyRecord(companyId);
    if (!body.vendor_id || !body.expense_account_id || !body.lines?.length || body.lines.length > 200) {
      return NextResponse.json({ error: "Vendor, expense account, and lines are required" }, { status: 400 });
    }

    const db = getDb();
    const vendor = db.prepare("SELECT * FROM vendors WHERE id = ? AND company_id = ?").get(body.vendor_id, companyId) as { name: string } | undefined;
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const currencyCode = (body.currency_code || company.base_currency).toUpperCase();
    const exchangeRate = resolveDocumentRate(companyId, company.base_currency, currencyCode, body.issue_date, body.exchange_rate);

    let subtotalMinor = 0;
    const pricedLines = body.lines.map((line) => {
      const quantity = Number(line.quantity);
      const unitMinor = toMinor(line.unit_cost);
      const lineMinor = mulMinor(unitMinor, quantity);
      subtotalMinor += lineMinor;
      return { ...line, quantity, unitMinor, lineMinor };
    });
    const vatRate = Number(body.vat_rate ?? company.default_vat_rate);
    const whtRate = Number(body.wht_rate ?? company.default_wht_rate);
    const vatMinor = percentOfMinor(subtotalMinor, vatRate);
    const whtMinor = percentOfMinor(subtotalMinor, whtRate);
    const netMinor = subtotalMinor + vatMinor - whtMinor;

    const baseSub = mulMinor(subtotalMinor, exchangeRate);
    const baseVat = mulMinor(vatMinor, exchangeRate);
    const baseWht = mulMinor(whtMinor, exchangeRate);
    const baseNet = baseSub + baseVat - baseWht;

    const billNumber = nextSequenceNumber(companyId, "bills", "bill_number", "BILL");
    const apAcct = getAccountByCode(companyId, "2000");
    const vatInputAcct = getAccountByCode(companyId, "1300");
    const whtPayAcct = getAccountByCode(companyId, "2110");

    const jeLines: JournalLineInput[] = [
      { account_id: Number(body.expense_account_id), description: `Bill ${billNumber} - ${vendor.name}`, debit: fromMinor(baseSub), credit: 0 },
      { account_id: apAcct.id, description: `AP - ${vendor.name} (${billNumber})`, debit: 0, credit: fromMinor(baseNet) },
    ];
    if (baseVat > 0) {
      jeLines.push({ account_id: vatInputAcct.id, description: `Input VAT ${vatRate}% (${billNumber})`, debit: fromMinor(baseVat), credit: 0 });
    }
    if (baseWht > 0) {
      jeLines.push({ account_id: whtPayAcct.id, description: `WHT Payable ${whtRate}% (${billNumber})`, debit: 0, credit: fromMinor(baseWht) });
    }

    const jeId = postJournalEntry({
      company_id: companyId,
      entry_date: body.issue_date,
      reference: billNumber,
      description: `Vendor Bill ${billNumber} - ${vendor.name}`,
      source_type: "BILL",
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: jeLines,
    });

    const billRes = db
      .prepare(`
        INSERT INTO bills (company_id, bill_number, vendor_id, issue_date, due_date, currency_code, exchange_rate, expense_account_id, subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total, amount_paid, status, notes, journal_entry_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'OPEN', ?, ?)
      `)
      .run(
        companyId,
        billNumber,
        body.vendor_id,
        body.issue_date,
        body.due_date,
        currencyCode,
        exchangeRate,
        body.expense_account_id,
        subtotalMinor,
        vatRate,
        vatMinor,
        whtRate,
        whtMinor,
        netMinor,
        body.notes || "",
        jeId
      );

    const billId = Number(billRes.lastInsertRowid);
    const insLine = db.prepare(`
      INSERT INTO bill_lines (bill_id, item_id, description, quantity, unit_cost, line_total)
      VALUES (?, NULL, ?, ?, ?, ?)
    `);
    for (const l of pricedLines) {
      insLine.run(billId, l.description, l.quantity, l.unitMinor, l.lineMinor);
    }

    logAudit(companyId, auth.user.id, "CREATE_BILL", "BILL", billId, `Recorded ${billNumber} from ${vendor.name} (${currencyCode} ${fromMinor(netMinor)})`);
    return NextResponse.json({ id: billId, bill_number: billNumber, journal_entry_id: jeId }, { status: 201 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
