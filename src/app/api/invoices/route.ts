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

  const invoices = db
    .prepare(`
      SELECT i.*, c.name AS customer_name, c.tin_number AS customer_tin, c.address AS customer_address, c.email AS customer_email
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ?
      ORDER BY i.issue_date DESC, i.id DESC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  const linesStmt = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id ASC");
  const hydrated = invoices.map((inv) => ({
    ...inv,
    lines: linesStmt.all(inv.id as number),
  }));

  return NextResponse.json({ invoices: hydrated });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      customer_id: number;
      issue_date: string;
      due_date: string;
      currency_code?: string;
      exchange_rate?: number;
      vat_rate?: number;
      wht_rate?: number;
      notes?: string;
      lines: Array<{ item_id?: number | null; description: string; quantity: number; unit_price: number }>;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const company = getCompanyRecord(companyId);
    if (!body.customer_id || !body.lines?.length) {
      return NextResponse.json({ error: "Customer and at least one line item are required" }, { status: 400 });
    }

    const db = getDb();
    const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND company_id = ?").get(body.customer_id, companyId) as { name: string } | undefined;
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const currencyCode = body.currency_code || company.base_currency;
    let exchangeRate = Number(body.exchange_rate || 0);
    if (!exchangeRate || currencyCode === company.base_currency) {
      const rateRow = db
        .prepare("SELECT rate_to_base FROM exchange_rates WHERE company_id = ? AND currency_code = ?")
        .get(companyId, currencyCode) as { rate_to_base: number } | undefined;
      exchangeRate = currencyCode === company.base_currency ? 1 : rateRow?.rate_to_base ?? 1;
    }

    const subtotal = Number(
      body.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0).toFixed(2)
    );
    const vatRate = Number(body.vat_rate ?? company.default_vat_rate);
    const whtRate = Number(body.wht_rate ?? company.default_wht_rate);
    const vatAmount = Number(((subtotal * vatRate) / 100).toFixed(2));
    const whtAmount = Number(((subtotal * whtRate) / 100).toFixed(2));
    const netTotal = Number((subtotal + vatAmount - whtAmount).toFixed(2));

    // Convert to base currency for General Ledger posting
    const baseSub = Number((subtotal * exchangeRate).toFixed(2));
    const baseVat = Number((vatAmount * exchangeRate).toFixed(2));
    const baseWht = Number((whtAmount * exchangeRate).toFixed(2));
    const baseNet = Number((baseSub + baseVat - baseWht).toFixed(2));

    const invNumber = nextSequenceNumber(companyId, "invoices", "invoice_number", "INV");

    const arAcct = getAccountByCode(companyId, "1100");
    const revAcct = getAccountByCode(companyId, "4000");
    const vatAcct = getAccountByCode(companyId, "2100");
    const whtRecAcct = getAccountByCode(companyId, "1310");
    const cogsAcct = getAccountByCode(companyId, "5000");
    const invAssetAcct = getAccountByCode(companyId, "1200");

    const jeLines: JournalLineInput[] = [
      { account_id: arAcct.id, description: `AR - ${customer.name} (${invNumber})`, debit: baseNet, credit: 0 },
      { account_id: revAcct.id, description: `Sales Revenue (${invNumber})`, debit: 0, credit: baseSub },
    ];
    if (baseVat > 0) {
      jeLines.push({ account_id: vatAcct.id, description: `Output VAT ${vatRate}% (${invNumber})`, debit: 0, credit: baseVat });
    }
    if (baseWht > 0) {
      jeLines.push({ account_id: whtRecAcct.id, description: `WHT Credit ${whtRate}% (${invNumber})`, debit: baseWht, credit: 0 });
    }

    // Deduct inventory & add COGS lines if inventory products were selected
    let totalCogs = 0;
    const itemLookup = db.prepare("SELECT * FROM inventory_items WHERE id = ? AND company_id = ?");
    const updateStock = db.prepare("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?");

    for (const line of body.lines) {
      if (line.item_id) {
        const item = itemLookup.get(line.item_id, companyId) as { id: number; item_type: string; unit_cost: number } | undefined;
        if (item && item.item_type === "PRODUCT") {
          const lineCogs = Number((Number(line.quantity) * Number(item.unit_cost)).toFixed(2));
          totalCogs += lineCogs;
          updateStock.run(Number(line.quantity), item.id);
        }
      }
    }
    if (totalCogs > 0) {
      jeLines.push({ account_id: cogsAcct.id, description: `COGS (${invNumber})`, debit: totalCogs, credit: 0 });
      jeLines.push({ account_id: invAssetAcct.id, description: `Inventory issued (${invNumber})`, debit: 0, credit: totalCogs });
    }

    const jeId = postJournalEntry({
      company_id: companyId,
      entry_date: body.issue_date,
      reference: invNumber,
      description: `Sales Invoice ${invNumber} - ${customer.name}`,
      source_type: "INVOICE",
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: jeLines,
    });

    const invRes = db
      .prepare(`
        INSERT INTO invoices (company_id, invoice_number, customer_id, issue_date, due_date, currency_code, exchange_rate, subtotal, vat_rate, vat_amount, wht_rate, wht_amount, total, amount_paid, status, notes, journal_entry_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'SENT', ?, ?)
      `)
      .run(
        companyId,
        invNumber,
        body.customer_id,
        body.issue_date,
        body.due_date,
        currencyCode,
        exchangeRate,
        subtotal,
        vatRate,
        vatAmount,
        whtRate,
        whtAmount,
        netTotal,
        body.notes || "",
        jeId
      );

    const invoiceId = Number(invRes.lastInsertRowid);
    const insLine = db.prepare(`
      INSERT INTO invoice_lines (invoice_id, item_id, description, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const l of body.lines) {
      insLine.run(
        invoiceId,
        l.item_id ?? null,
        l.description,
        Number(l.quantity),
        Number(l.unit_price),
        Number((Number(l.quantity) * Number(l.unit_price)).toFixed(2))
      );
    }

    logAudit(companyId, auth.user.id, "CREATE_INVOICE", "INVOICE", invoiceId, `Issued ${invNumber} for ${customer.name} (${currencyCode} ${netTotal})`);
    return NextResponse.json({ id: invoiceId, invoice_number: invNumber, journal_entry_id: jeId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
