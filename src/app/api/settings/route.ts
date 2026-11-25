import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getUserCompanies, requireAdmin, requireAuth, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const companies = getUserCompanies(auth.user.id);
  const exchangeRates = db
    .prepare("SELECT * FROM exchange_rates WHERE company_id = ? ORDER BY currency_code ASC")
    .all(companyId);
  const users = db
    .prepare(`
      SELECT u.id, u.name, u.email, cu.role, u.preferred_lang, u.preferred_calendar, u.created_at
      FROM users u
      JOIN company_users cu ON cu.user_id = u.id
      WHERE cu.company_id = ?
      ORDER BY u.id ASC
    `)
    .all(companyId);
  const auditLogs = db
    .prepare(`
      SELECT al.*, u.name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.company_id = ?
      ORDER BY al.id DESC
      LIMIT 50
    `)
    .all(companyId);

  return NextResponse.json({ companies, exchangeRates, users, auditLogs });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "update_rate" | "add_user" | "update_company";
      companyId: number;
      currency_code?: string;
      rate_to_base?: number;
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "accountant" | "viewer";
      default_vat_rate?: number;
      default_wht_rate?: number;
      tax_regime?: string;
      tin_number?: string;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const db = getDb();

    if (body.action === "update_rate") {
      const rate = Number(body.rate_to_base);
      if (!body.currency_code || !rate || rate <= 0) {
        return NextResponse.json({ error: "Valid currency and positive rate required" }, { status: 400 });
      }
      db.prepare(`
        INSERT INTO exchange_rates (company_id, currency_code, rate_to_base, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(company_id, currency_code) DO UPDATE SET rate_to_base = excluded.rate_to_base, updated_at = datetime('now')
      `).run(companyId, body.currency_code, rate);
      logAudit(companyId, auth.user.id, "UPDATE_FX_RATE", "EXCHANGE_RATE", null, `Updated ${body.currency_code} rate to ${rate}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "add_user") {
      if (!body.name?.trim() || !body.email?.trim() || !body.password) {
        return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
      }
      const role = body.role || "accountant";
      const res = db
        .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
        .run(body.name.trim(), body.email.trim().toLowerCase(), hashPassword(body.password), role);
      const id = Number(res.lastInsertRowid);
      db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)").run(companyId, id, role);
      logAudit(companyId, auth.user.id, "CREATE_USER", "USER", id, `Created user ${body.email} (${role})`);
      return NextResponse.json({ id }, { status: 201 });
    }

    if (body.action === "update_company") {
      db.prepare(`
        UPDATE companies
        SET tax_regime = COALESCE(?, tax_regime),
            default_vat_rate = COALESCE(?, default_vat_rate),
            default_wht_rate = COALESCE(?, default_wht_rate),
            tin_number = COALESCE(?, tin_number)
        WHERE id = ?
      `).run(
        body.tax_regime ?? null,
        body.default_vat_rate ?? null,
        body.default_wht_rate ?? null,
        body.tin_number ?? null,
        companyId
      );
      logAudit(companyId, auth.user.id, "UPDATE_COMPANY", "COMPANY", companyId, `Updated tax settings for company #${companyId}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
