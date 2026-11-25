import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { TAX_REGIMES } from "@/lib/currency";
import { hashPassword } from "@/lib/auth";
import { getUserCompanies, guardCompanyMutation, requireAdmin, requireAuth, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { cleanEmail, cleanText, userPasswordProblem } from "@/lib/passwords";

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
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
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
    const blocked = guardCompanyMutation(auth.user, companyId, { adminOnly: true });
    if (blocked) return blocked;
    const db = getDb();

    if (body.action === "update_rate") {
      const rate = Number(body.rate_to_base);
      const code = (body.currency_code ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) {
        return NextResponse.json({ error: "Valid currency and positive rate required" }, { status: 400 });
      }
      db.prepare(`
        INSERT INTO exchange_rates (company_id, currency_code, rate_to_base, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(company_id, currency_code) DO UPDATE SET rate_to_base = excluded.rate_to_base, updated_at = datetime('now')
      `).run(companyId, code, rate);
      logAudit(companyId, auth.user.id, "UPDATE_FX_RATE", "EXCHANGE_RATE", null, `Updated ${code} rate to ${rate}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "add_user") {
      const name = cleanText(body.name, 120);
      const email = cleanEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const passwordProblem = userPasswordProblem(password);
      const roles = new Set(["admin", "accountant", "viewer"]);
      if (!name || !email || passwordProblem || !roles.has(body.role || "accountant")) {
        return NextResponse.json(
          { error: passwordProblem || "Name, a valid email, and a password of at least 8 characters are required." },
          { status: 400 }
        );
      }
      const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) as { id: number } | undefined;
      if (existing) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      const role = body.role || "accountant";
      const res = db
        .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
        .run(name, email, hashPassword(password), role);
      const id = Number(res.lastInsertRowid);
      db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)").run(companyId, id, role);
      logAudit(companyId, auth.user.id, "CREATE_USER", "USER", id, `Created user ${email} (${role})`);
      return NextResponse.json({ id }, { status: 201 });
    }

    if (body.action === "update_company") {
      let taxRegime: string | null = null;
      if (body.tax_regime != null) {
        if (!TAX_REGIMES.some((regime) => regime.code === body.tax_regime)) {
          return NextResponse.json({ error: "Choose a known tax regime." }, { status: 400 });
        }
        taxRegime = body.tax_regime;
      }
      const rate = (value: unknown, label: string): number | null | NextResponse => {
        if (value == null || value === "") return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          return NextResponse.json({ error: `${label} must be between 0 and 100.` }, { status: 400 });
        }
        return parsed;
      };
      const vat = rate(body.default_vat_rate, "VAT");
      if (vat instanceof NextResponse) return vat;
      const wht = rate(body.default_wht_rate, "Withholding tax");
      if (wht instanceof NextResponse) return wht;
      const tin = body.tin_number == null ? null : typeof body.tin_number === "string" ? body.tin_number.trim().slice(0, 64) : null;
      if (body.tin_number != null && typeof body.tin_number !== "string") {
        return NextResponse.json({ error: "TIN must be text." }, { status: 400 });
      }
      db.prepare(`
        UPDATE companies
        SET tax_regime = COALESCE(?, tax_regime),
            default_vat_rate = COALESCE(?, default_vat_rate),
            default_wht_rate = COALESCE(?, default_wht_rate),
            tin_number = COALESCE(?, tin_number)
        WHERE id = ?
      `).run(taxRegime, vat, wht, tin, companyId);
      logAudit(companyId, auth.user.id, "UPDATE_COMPANY", "COMPANY", companyId, `Updated tax settings for company #${companyId}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
