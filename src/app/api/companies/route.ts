import { NextResponse } from "next/server";
import { getDb, logAudit, seedCompanyChartOfAccounts, seedCompanyExchangeRates } from "@/lib/db";
import { getUserCompanies, guardNewCompany, requireAdmin, requireAuth } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { TAX_REGIMES } from "@/lib/currency";
import { cleanText } from "@/lib/passwords";
import { trialWindow } from "@/lib/subscription";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const companies = getUserCompanies(auth.user.id);
  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const blocked = guardNewCompany(auth.user.id);
  if (blocked) return blocked;

  try {
    const body = (await request.json()) as {
      name: string;
      legal_name?: string;
      tin_number?: string;
      base_currency?: string;
      country?: string;
      tax_regime?: string;
      default_vat_rate?: number;
      default_wht_rate?: number;
      address?: string;
      phone?: string;
      email?: string;
    };
    const name = cleanText(body.name, 200);
    if (!name) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }
    const db = getDb();
    const currencies = new Set(["ETB", "USD", "SOS", "KES", "SAR", "AED", "EUR"]);
    const baseCurrency = body.base_currency && currencies.has(body.base_currency) ? body.base_currency : "ETB";
    const taxRegime = TAX_REGIMES.some((regime) => regime.code === body.tax_regime) ? (body.tax_regime as string) : "ET_STANDARD";
    const trial = trialWindow();
    const vat = Number(body.default_vat_rate ?? 15);
    const wht = Number(body.default_wht_rate ?? 2);
    const res = db
      .prepare(`
        INSERT INTO companies (
          name, legal_name, tin_number, base_currency, country, tax_regime, default_vat_rate, default_wht_rate,
          address, phone, email, plan_name, subscription_status, trial_starts_at, trial_ends_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FREE_TRIAL', 'trial', ?, ?)
      `)
      .run(
        name,
        cleanText(body.legal_name, 200) || name,
        typeof body.tin_number === "string" ? body.tin_number.trim().slice(0, 64) : "",
        baseCurrency,
        cleanText(body.country, 80) || "Ethiopia",
        taxRegime,
        Number.isFinite(vat) ? Math.min(100, Math.max(0, vat)) : 15,
        Number.isFinite(wht) ? Math.min(100, Math.max(0, wht)) : 2,
        typeof body.address === "string" ? body.address.trim().slice(0, 300) : "",
        typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "",
        typeof body.email === "string" ? body.email.trim().slice(0, 254) : "",
        trial.trialStartsAt,
        trial.trialEndsAt
      );

    const companyId = Number(res.lastInsertRowid);
    seedCompanyChartOfAccounts(db, companyId);
    seedCompanyExchangeRates(db, companyId, baseCurrency);
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'admin')").run(
      companyId,
      auth.user.id
    );
    logAudit(companyId, auth.user.id, "CREATE_COMPANY", "COMPANY", companyId, `Created company ${name} (${baseCurrency})`);

    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as Record<string, unknown>;
    delete company.subscription_notes;
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
