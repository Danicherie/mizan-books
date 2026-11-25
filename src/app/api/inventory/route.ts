import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId, userHasCompanyAccess } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { getTodayIso } from "@/lib/calendar";
import { fromMinor, INVENTORY_MONEY_FIELDS, minorFromSql, mulMinor, toMinor, withMajorMoney } from "@/lib/money";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const items = (
    db.prepare("SELECT * FROM inventory_items WHERE company_id = ? AND active = 1 ORDER BY name ASC").all(companyId) as Array<
      Record<string, unknown>
    >
  ).map((item) => withMajorMoney(item, INVENTORY_MONEY_FIELDS));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      companyId: number;
      sku: string;
      name: string;
      category?: string;
      item_type?: "PRODUCT" | "SERVICE";
      unit?: string;
      unit_cost?: number;
      unit_price?: number;
      quantity_on_hand?: number;
      reorder_level?: number;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    if (!body.sku?.trim() || body.sku.trim().length > 64 || !body.name?.trim() || body.name.trim().length > 200) {
      return NextResponse.json({ error: "SKU and name are required" }, { status: 400 });
    }
    const db = getDb();
    const incAcct = getAccountByCode(companyId, body.item_type === "SERVICE" ? "4100" : "4000").id;
    const cogsAcct = getAccountByCode(companyId, "5000").id;
    const invAcct = getAccountByCode(companyId, "1200").id;

    const res = db
      .prepare(`
        INSERT INTO inventory_items (company_id, sku, name, category, item_type, unit, unit_cost, unit_price, quantity_on_hand, reorder_level, income_account_id, cogs_account_id, inventory_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        companyId,
        body.sku.trim().toUpperCase(),
        body.name.trim(),
        body.category || "General",
        body.item_type || "PRODUCT",
        body.unit || "pcs",
        toMinor(body.unit_cost || 0),
        toMinor(body.unit_price || 0),
        Number(body.quantity_on_hand || 0),
        Number(body.reorder_level || 5),
        incAcct,
        cogsAcct,
        invAcct
      );

    const id = Number(res.lastInsertRowid);
    logAudit(companyId, auth.user.id, "CREATE_INVENTORY_ITEM", "INVENTORY", id, `Added ${body.sku} - ${body.name}`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      id: number;
      delta: number;
      reason?: string;
    };
    const db = getDb();
    const item = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(body.id) as {
      id: number;
      company_id: number;
      sku: string;
      name: string;
      unit_cost: number;
      quantity_on_hand: number;
    } | undefined;
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!userHasCompanyAccess(auth.user.id, item.company_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const blocked = guardCompanyMutation(auth.user, item.company_id);
    if (blocked) return blocked;

    const delta = Number(body.delta);
    if (!delta) return NextResponse.json({ error: "Non-zero adjustment required" }, { status: 400 });
    const newQty = Number((item.quantity_on_hand + delta).toFixed(2));
    db.prepare("UPDATE inventory_items SET quantity_on_hand = ? WHERE id = ?").run(newQty, item.id);

    const valueDelta = mulMinor(minorFromSql(item.unit_cost), Math.abs(delta));
    if (valueDelta > 0) {
      const company = getCompanyRecord(item.company_id);
      const invAcct = getAccountByCode(item.company_id, "1200").id;
      const cogsAcct = getAccountByCode(item.company_id, "5000").id;
      postJournalEntry({
        company_id: item.company_id,
        entry_date: getTodayIso(),
        reference: `ADJ-${item.sku}`,
        description: `Inventory adjustment (${delta > 0 ? "+" : ""}${delta}) ${item.name}: ${body.reason || "Stock count"}`,
        source_type: "INVENTORY_ADJ",
        source_id: item.id,
        created_by: auth.user.id,
        currency_code: company.base_currency,
        lines:
          delta > 0
            ? [
                { account_id: invAcct, description: `Stock increase ${item.sku}`, debit: fromMinor(valueDelta), credit: 0 },
                { account_id: cogsAcct, description: `Inventory adjustment offset`, debit: 0, credit: fromMinor(valueDelta) },
              ]
            : [
                { account_id: cogsAcct, description: `Stock write-down ${item.sku}`, debit: fromMinor(valueDelta), credit: 0 },
                { account_id: invAcct, description: `Inventory reduction ${item.sku}`, debit: 0, credit: fromMinor(valueDelta) },
              ],
      });
    }

    logAudit(item.company_id, auth.user.id, "ADJUST_STOCK", "INVENTORY", item.id, `Adjusted ${item.sku} by ${delta} (${body.reason || "manual"})`);
    return NextResponse.json({ ok: true, quantity_on_hand: newQty });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
