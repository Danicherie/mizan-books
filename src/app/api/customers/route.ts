import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const customers = db
    .prepare(`
      SELECT
        c.*,
        COALESCE(SUM(CASE WHEN i.status != 'DRAFT' THEN (i.total - i.amount_paid) * i.exchange_rate ELSE 0 END), 0) AS open_balance,
        COUNT(i.id) AS invoice_count
      FROM customers c
      LEFT JOIN invoices i ON i.customer_id = c.id
      WHERE c.company_id = ?
      GROUP BY c.id
      ORDER BY c.name ASC
    `)
    .all(companyId);

  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      companyId: number;
      name: string;
      email?: string;
      phone?: string;
      tin_number?: string;
      address?: string;
      currency_code?: string;
      credit_limit?: number;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO customers (company_id, name, email, phone, tin_number, address, currency_code, credit_limit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        companyId,
        body.name.trim(),
        body.email || "",
        body.phone || "",
        body.tin_number || "",
        body.address || "",
        body.currency_code || "ETB",
        Number(body.credit_limit || 0)
      );
    const id = Number(res.lastInsertRowid);
    logAudit(companyId, auth.user.id, "CREATE_CUSTOMER", "CUSTOMER", id, `Added customer ${body.name}`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
