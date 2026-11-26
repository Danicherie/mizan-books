import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry, type JournalLineInput } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { getTodayIso } from "@/lib/calendar";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { fromMinor, INVENTORY_MONEY_FIELDS, minorFromSql, mulMinor, percentOfMinor, toMinor, withMajorMoney } from "@/lib/money";

const POS_SALE_MONEY_FIELDS = ["subtotal", "vat_amount", "total"] as const;
const POS_LINE_MONEY_FIELDS = ["unit_price", "line_total"] as const;
const PAYMENT_METHODS = new Set(["CASH", "CARD", "MOBILE_MONEY", "BANK"]);

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const items = (
    db
      .prepare("SELECT * FROM inventory_items WHERE company_id = ? AND active = 1 ORDER BY name ASC")
      .all(companyId) as Array<Record<string, unknown>>
  ).map((item) => withMajorMoney(item, INVENTORY_MONEY_FIELDS));

  const sales = db
    .prepare("SELECT * FROM pos_sales WHERE company_id = ? ORDER BY id DESC LIMIT 30")
    .all(companyId) as Array<Record<string, unknown>>;

  const lineStmt = db.prepare("SELECT * FROM pos_sale_lines WHERE pos_sale_id = ?");
  const hydrated = sales.map((s) => ({
    ...withMajorMoney(s, POS_SALE_MONEY_FIELDS),
    lines: (lineStmt.all(s.id as number) as Array<Record<string, unknown>>).map((l) => withMajorMoney(l, POS_LINE_MONEY_FIELDS)),
  }));

  return NextResponse.json({ items, sales: hydrated });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
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
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    const company = getCompanyRecord(companyId);
    const db = getDb();

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }
    if (body.lines.length > 100) {
      return NextResponse.json({ error: "A sale can have at most 100 lines." }, { status: 400 });
    }
    const paymentMethod = PAYMENT_METHODS.has(String(body.payment_method)) ? body.payment_method : "CASH";
    const customerName = String(body.customer_name || "Walk-in Customer").trim().slice(0, 100) || "Walk-in Customer";
    const vatRate = Number(body.vat_rate ?? company.default_vat_rate);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      return NextResponse.json({ error: "VAT rate must be between 0 and 100." }, { status: 400 });
    }

    const findItem = db.prepare("SELECT * FROM inventory_items WHERE id = ? AND company_id = ?");
    let subtotalMinor = 0;
    let totalCogs = 0;
    const priced = body.lines.map((l) => {
      const quantity = Number(l.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
        throw new Error("Quantity must be more than 0.");
      }
      const unitMinor = toMinor(l.unit_price);
      if (unitMinor < 0) throw new Error("Prices cannot be negative.");
      const lineMinor = mulMinor(unitMinor, quantity);
      subtotalMinor += lineMinor;
      const description = String(l.description || "").trim().slice(0, 200);
      if (!description) throw new Error("Each line needs a description.");

      let stockItemId: number | null = null;
      if (l.item_id) {
        const it = findItem.get(Number(l.item_id), companyId) as
          | { id: number; item_type: string; unit_cost: number }
          | undefined;
        if (!it) throw new Error("An item in the cart was not found.");
        if (it.item_type === "PRODUCT") {
          stockItemId = it.id;
          totalCogs += mulMinor(minorFromSql(it.unit_cost), quantity);
        }
      }
      return { itemId: l.item_id ? Number(l.item_id) : null, stockItemId, description, quantity, unitMinor, lineMinor };
    });

    const vatMinor = percentOfMinor(subtotalMinor, vatRate);
    const totalMinor = subtotalMinor + vatMinor;

    const count = (db.prepare("SELECT COUNT(*) as c FROM pos_sales WHERE company_id = ?").get(companyId) as { c: number }).c;
    const receiptNo = `POS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    const today = getTodayIso();

    const depositAcct = getAccountByCode(companyId, paymentMethod === "CASH" ? "1000" : "1010");
    const revAcct = getAccountByCode(companyId, "4000");
    const vatAcct = getAccountByCode(companyId, "2100");
    const cogsAcct = getAccountByCode(companyId, "5000");
    const invAcct = getAccountByCode(companyId, "1200");

    const jeLines: JournalLineInput[] = [
      { account_id: depositAcct.id, description: `POS ${receiptNo} (${paymentMethod})`, debit: fromMinor(totalMinor), credit: 0 },
      { account_id: revAcct.id, description: `POS Sales ${receiptNo}`, debit: 0, credit: fromMinor(subtotalMinor) },
    ];
    if (vatMinor > 0) {
      jeLines.push({ account_id: vatAcct.id, description: `POS Output VAT ${vatRate}%`, debit: 0, credit: fromMinor(vatMinor) });
    }
    if (totalCogs > 0) {
      jeLines.push({ account_id: cogsAcct.id, description: `POS COGS ${receiptNo}`, debit: fromMinor(totalCogs), credit: 0 });
      jeLines.push({ account_id: invAcct.id, description: `POS Inventory out ${receiptNo}`, debit: 0, credit: fromMinor(totalCogs) });
    }

    // Post the books first: if this fails, no stock has moved and no sale exists.
    const jeId = postJournalEntry({
      company_id: companyId,
      entry_date: today,
      reference: receiptNo,
      description: `POS Sale ${receiptNo} - ${customerName}`,
      source_type: "INVOICE",
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: jeLines,
    });

    let saleId = 0;
    db.exec("BEGIN");
    try {
      const res = db
        .prepare(`
          INSERT INTO pos_sales (company_id, receipt_number, sale_date, customer_name, payment_method, subtotal, vat_rate, vat_amount, total, journal_entry_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(companyId, receiptNo, today, customerName, paymentMethod, subtotalMinor, vatRate, vatMinor, totalMinor, jeId, auth.user.id);
      saleId = Number(res.lastInsertRowid);
      const insLine = db.prepare(`
        INSERT INTO pos_sale_lines (pos_sale_id, item_id, description, quantity, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const decStock = db.prepare("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ? AND company_id = ?");
      for (const l of priced) {
        insLine.run(saleId, l.itemId, l.description, l.quantity, l.unitMinor, l.lineMinor);
        if (l.stockItemId) decStock.run(l.quantity, l.stockItemId, companyId);
      }
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // keep the original error
      }
      throw err;
    }

    logAudit(companyId, auth.user.id, "POS_SALE", "POS", saleId, `Completed ${receiptNo} (${company.base_currency} ${fromMinor(totalMinor)} via ${paymentMethod})`);
    const sale = db.prepare("SELECT * FROM pos_sales WHERE id = ?").get(saleId) as Record<string, unknown>;
    const savedLines = (db.prepare("SELECT * FROM pos_sale_lines WHERE pos_sale_id = ?").all(saleId) as Array<Record<string, unknown>>).map(
      (l) => withMajorMoney(l, POS_LINE_MONEY_FIELDS)
    );
    return NextResponse.json({ sale: { ...withMajorMoney(sale, POS_SALE_MONEY_FIELDS), lines: savedLines } }, { status: 201 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
