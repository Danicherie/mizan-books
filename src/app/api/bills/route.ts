import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, nextSequenceNumber, postJournalEntry, type JournalLineInput } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

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
      JOIN vendors v ON v.id = b.vendor_id
      LEFT JOIN accounts a ON a.id = b.expense_account_id
      WHERE b.company_id = ?
      ORDER BY b.issue_date DESC, b.id DESC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  const linesStmt = db.prepare("SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY id ASC");
  const hydrated = bills.map((b) => ({
    ...b,
    lines: linesStmt.all(b.id as number),
  }));

  return NextResponse.json({ bills: hydrated });
}

export async function POST(request: Request) {
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
    const company = getCompanyRecord(companyId);
    if (!body.vendor_id || !body.expense_account_id || !body.lines?.length) {
      return NextResponse.json({ error: "Vendor, expense account, and lines are required" }, { status: 400 });
    }

    const db = getDb();
    const vendor = db.prepare("SELECT * FROM vendors WHERE id = ? AND company_id = ?").get(body.vendor_id, companyId) as { name: string } | undefined;
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const currencyCode = body.currency_code || company.base_currency;
    let exchangeRate = Number(body.exchange_rate || 0);
    if (!exchangeRate || currencyCode === company.base_currency) {
      const rateRow = db
        .prepare("SELECT rate_to_base FROM exchange_rates WHERE company_id = ? AND currency_code = ?")
        .get(companyId, currencyCode) as { rate_to_base: number } | undefined;
      exchangeRate = currencyCode === company.base_currency ? 1 : rateRow?.rate_to_base ?? 1;
    }

    const subtotal = Number(body.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0).toFixed(2));
    const vatRate = Number(body.vat_rate ?? company.default_vat_rate);
    const whtRate = Number(body.wht_rate ?? company.default_wht_rate);
    const vatAmount = Number(((subtotal * vatRate) / 100).toFixed(2));
    const whtAmount = Number(((subtotal * whtRate) / 100).toFixed(2));
    const netPayable = Number((subtotal + vatAmount - whtAmount).toFixed(2));

    const baseSub = Number((subtotal * exchangeRate).toFixed(2));
    const baseVat = Number((vatAmount * exchangeRate).toFixed(2));
    const baseWht = Number((whtAmount * exchangeRate).toFixed(2));
    const baseNet = Number((baseSub + baseVat - baseWht).toFixed(2));

    const billNumber = nextSequenceNumber(companyId, "bills", "bill_number", "BILL");
    const apAcct = getAccountByCode(companyId, "2000");
    const vatInputAcct = getAccountByCode(companyId, "1300");
    const whtPayAcct = getAccountByCode(companyId, "2110");

    const jeLines: JournalLineInput[] = [
      { account_id: Number(body.expense_account_id), description: `Bill ${billNumber} - ${vendor.name}`, debit: baseSub, credit: 0 },
      { account_id: apAcct.id, description: `AP - ${vendor.name} (${billNumber})`, debit: 0, credit: baseNet },
    ];
    if (baseVat > 0) {
      jeLines.push({ account_id: vatInputAcct.id, description: `Input VAT ${vatRate}% (${billNumber})`, debit: baseVat, credit: 0 });
    }
    if (baseWht > 0) {
      jeLines.push({ account_id: whtPayAcct.id, description: `WHT Payable ${whtRate}% (${billNumber})`, debit: 0, credit: baseWht });
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
        subtotal,
        vatRate,
        vatAmount,
        whtRate,
        whtAmount,
        netPayable,
        body.notes || "",
        jeId
      );

    const billId = Number(billRes.lastInsertRowid);
    const insLine = db.prepare(`
      INSERT INTO bill_lines (bill_id, item_id, description, quantity, unit_cost, line_total)
      VALUES (?, NULL, ?, ?, ?, ?)
    `);
    for (const l of body.lines) {
      insLine.run(billId, l.description, Number(l.quantity), Number(l.unit_cost), Number((Number(l.quantity) * Number(l.unit_cost)).toFixed(2)));
    }

    logAudit(companyId, auth.user.id, "CREATE_BILL", "BILL", billId, `Recorded ${billNumber} from ${vendor.name} (${currencyCode} ${netPayable})`);
    return NextResponse.json({ id: billId, bill_number: billNumber, journal_entry_id: jeId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
