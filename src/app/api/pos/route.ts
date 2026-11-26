import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry, type JournalLineInput } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { getTodayIso } from "@/lib/calendar";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const items = db
    .prepare("SELECT * FROM inventory_items WHERE company_id = ? AND active = 1 ORDER BY name ASC")
    .all(companyId);

  const sales = db
    .prepare("SELECT * FROM pos_sales WHERE company_id = ? ORDER BY id DESC LIMIT 30")
    .all(companyId) as Array<Record<string, unknown>>;

  const lineStmt = db.prepare("SELECT * FROM pos_sale_lines WHERE pos_sale_id = ?");
  const hydrated = sales.map((s) => ({ ...s, lines: lineStmt.all(s.id as number) }));

  return NextResponse.json({ items, sales: hydrated });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      customer_name?: string;
      payment_method: "CASH" | "CARD" | "MOBILE_MONEY" | "BANK";
      vat_rate?: number;
      lines: Array<{ item_id?: number | null; description: string; quantity: number; unit_price: number }>;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const company = getCompanyRecord(companyId);
    const db = getDb();

    if (!body.lines?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const subtotal = Number(
      body.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0).toFixed(2)
    );
    const vatRate = Number(body.vat_rate ?? company.default_vat_rate);
    const vatAmount = Number(((subtotal * vatRate) / 100).toFixed(2));
    const total = Number((subtotal + vatAmount).toFixed(2));

    const count = (db.prepare("SELECT COUNT(*) as c FROM pos_sales WHERE company_id = ?").get(companyId) as { c: number }).c;
    const receiptNo = `POS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    const today = getTodayIso();

    const depositAcct = getAccountByCode(companyId, body.payment_method === "CASH" ? "1000" : "1010");
    const revAcct = getAccountByCode(companyId, "4000");
    const vatAcct = getAccountByCode(companyId, "2100");
    const cogsAcct = getAccountByCode(companyId, "5000");
    const invAcct = getAccountByCode(companyId, "1200");

    const jeLines: JournalLineInput[] = [
      { account_id: depositAcct.id, description: `POS ${receiptNo} (${body.payment_method})`, debit: total, credit: 0 },
      { account_id: revAcct.id, description: `POS Sales ${receiptNo}`, debit: 0, credit: subtotal },
    ];
    if (vatAmount > 0) {
      jeLines.push({ account_id: vatAcct.id, description: `POS Output VAT ${vatRate}%`, debit: 0, credit: vatAmount });
    }

    let totalCogs = 0;
    const findItem = db.prepare("SELECT * FROM inventory_items WHERE id = ? AND company_id = ?");
    const decStock = db.prepare("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?");

    for (const l of body.lines) {
      if (l.item_id) {
        const it = findItem.get(l.item_id, companyId) as { id: number; item_type: string; unit_cost: number } | undefined;
        if (it && it.item_type === "PRODUCT") {
          totalCogs += Number((Number(l.quantity) * Number(it.unit_cost)).toFixed(2));
          decStock.run(Number(l.quantity), it.id);
        }
      }
    }
    if (totalCogs > 0) {
      jeLines.push({ account_id: cogsAcct.id, description: `POS COGS ${receiptNo}`, debit: totalCogs, credit: 0 });
      jeLines.push({ account_id: invAcct.id, description: `POS Inventory out ${receiptNo}`, debit: 0, credit: totalCogs });
    }

    const jeId = postJournalEntry({
      company_id: companyId,
      entry_date: today,
      reference: receiptNo,
      description: `POS Sale ${receiptNo} - ${body.customer_name || "Walk-in Customer"}`,
      source_type: "INVOICE",
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: jeLines,
    });

    const res = db
      .prepare(`
        INSERT INTO pos_sales (company_id, receipt_number, sale_date, customer_name, payment_method, subtotal, vat_rate, vat_amount, total, journal_entry_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        companyId,
        receiptNo,
        today,
        body.customer_name || "Walk-in Customer",
        body.payment_method || "CASH",
        subtotal,
        vatRate,
        vatAmount,
        total,
        jeId,
        auth.user.id
      );

    const saleId = Number(res.lastInsertRowid);
    const insLine = db.prepare(`
      INSERT INTO pos_sale_lines (pos_sale_id, item_id, description, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const l of body.lines) {
      insLine.run(saleId, l.item_id ?? null, l.description, Number(l.quantity), Number(l.unit_price), Number((Number(l.quantity) * Number(l.unit_price)).toFixed(2)));
    }

    logAudit(companyId, auth.user.id, "POS_SALE", "POS", saleId, `Completed ${receiptNo} (${company.base_currency} ${total} via ${body.payment_method})`);
    const sale = db.prepare("SELECT * FROM pos_sales WHERE id = ?").get(saleId) as Record<string, unknown>;
    const savedLines = db.prepare("SELECT * FROM pos_sale_lines WHERE pos_sale_id = ?").all(saleId);
    return NextResponse.json({ sale: { ...sale, lines: savedLines } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
