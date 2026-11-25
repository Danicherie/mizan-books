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

  const vendors = db
    .prepare(`
      SELECT
        v.*,
        COALESCE(SUM(CASE WHEN b.status != 'DRAFT' THEN (b.total - b.amount_paid) * b.exchange_rate ELSE 0 END), 0) AS open_balance,
        COUNT(b.id) AS bill_count
      FROM vendors v
      LEFT JOIN bills b ON b.vendor_id = v.id
      WHERE v.company_id = ?
      GROUP BY v.id
      ORDER BY v.name ASC
    `)
    .all(companyId);

  return NextResponse.json({ vendors });
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
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
    }
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO vendors (company_id, name, email, phone, tin_number, address, currency_code)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        companyId,
        body.name.trim(),
        body.email || "",
        body.phone || "",
        body.tin_number || "",
        body.address || "",
        body.currency_code || "ETB"
      );
    const id = Number(res.lastInsertRowid);
    logAudit(companyId, auth.user.id, "CREATE_VENDOR", "VENDOR", id, `Added vendor ${body.name}`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
