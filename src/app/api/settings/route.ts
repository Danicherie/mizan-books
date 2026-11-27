import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { TAX_REGIMES } from "@/lib/currency";
import { getUserCompanies, guardCompanyMutation, requireAuth, resolveScopedCompanyId } from "@/lib/api-helpers";
import { recordExchangeRate } from "@/lib/fx";
import { clientErrorResponse } from "@/lib/http";
import { getTodayIso } from "@/lib/calendar";
import { assertMutationOrigin } from "@/lib/origin";
import { addCompanyMember, canKeepBooks } from "@/lib/team";

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
  const membership = db
    .prepare("SELECT role FROM company_users WHERE user_id = ? AND company_id = ?")
    .get(auth.user.id, companyId) as { role: string } | undefined;
  const auditLogs = canKeepBooks(membership?.role)
    ? db
        .prepare(
          `SELECT al.*, u.name AS user_name
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.user_id
           WHERE al.company_id = ?
           ORDER BY al.id DESC
           LIMIT 50`
        )
        .all(companyId)
    : [];

  return NextResponse.json({ companies, exchangeRates, users, auditLogs });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "update_rate" | "add_user" | "update_company";
      companyId: number;
      currency_code?: string;
      rate_to_base?: number;
      rate_date?: string;
      name?: string;
      email?: string;
      password?: string;
      role?: "admin" | "accountant" | "staff" | "viewer" | "owner";
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
      const code = (body.currency_code ?? "").trim().toUpperCase();
      const company = db.prepare("SELECT base_currency FROM companies WHERE id = ?").get(companyId) as { base_currency: string };
      if (code === company.base_currency) {
        return NextResponse.json({ error: "The base currency rate stays at 1." }, { status: 400 });
      }
      recordExchangeRate(companyId, code, Number(body.rate_to_base), body.rate_date || getTodayIso());
      logAudit(companyId, auth.user.id, "UPDATE_FX_RATE", "EXCHANGE_RATE", null, `Updated ${code} rate to ${body.rate_to_base} on ${body.rate_date || getTodayIso()}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "add_user") {
      const added = addCompanyMember(db, companyId, body);
      logAudit(
        companyId,
        auth.user.id,
        added.invited ? "INVITE_USER" : "CREATE_USER",
        "USER",
        added.id,
        added.invited ? `Invited existing user (${added.role})` : `Created user (${added.role})`
      );
      return NextResponse.json({ id: added.id, invited: added.invited }, { status: 201 });
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
