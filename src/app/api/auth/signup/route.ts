import { NextResponse } from "next/server";
import { getDb, logAudit, seedCompanyChartOfAccounts, seedCompanyExchangeRates } from "@/lib/db";
import { createSessionCookie, hashPassword } from "@/lib/auth";
import { TAX_REGIMES } from "@/lib/currency";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      company_name?: string;
      base_currency?: string;
      tax_regime?: string;
      country?: string;
      tin_number?: string;
      preferred_lang?: string;
    };

    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const companyName = (body.company_name ?? "").trim();

    if (!name || !email || password.length < 6 || !companyName) {
      return NextResponse.json(
        { error: "Full name, valid email, password (min 6 chars), and company name are required." },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const lang = ["en", "am", "om", "so", "ar"].includes(body.preferred_lang || "")
      ? (body.preferred_lang as string)
      : "en";
    const baseCurrency = body.base_currency || "ETB";
    const regimeCode = body.tax_regime || "ET_STANDARD";
    const regimeMeta = TAX_REGIMES.find((r) => r.code === regimeCode);
    const defaultVat = regimeMeta?.defaultVat ?? 15;
    const defaultWht = regimeMeta?.defaultWht ?? 0;

    // 30-day (1-month) Free Trial window
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const trialStartIso = trialStart.toISOString();
    const trialEndIso = trialEnd.toISOString();

    const userRes = db
      .prepare(`
        INSERT INTO users (name, email, password_hash, role, preferred_lang, preferred_calendar)
        VALUES (?, ?, ?, 'admin', ?, 'gregorian')
      `)
      .run(name, email, hashPassword(password), lang);
    const userId = Number(userRes.lastInsertRowid);

    const compRes = db
      .prepare(`
        INSERT INTO companies (
          name, legal_name, tin_number, base_currency, country, tax_regime,
          default_vat_rate, default_wht_rate, email, plan_name, subscription_status,
          trial_starts_at, trial_ends_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'FREE_TRIAL', 'TRIALING', ?, ?)
      `)
      .run(
        companyName,
        companyName,
        body.tin_number || "",
        baseCurrency,
        body.country || "Ethiopia",
        regimeCode,
        defaultVat,
        defaultWht,
        email,
        trialStartIso,
        trialEndIso
      );
    const companyId = Number(compRes.lastInsertRowid);

    // Seed full 22-account multilingual COA, exchange rates, and tenant ownership
    seedCompanyChartOfAccounts(db, companyId);
    seedCompanyExchangeRates(db, companyId, baseCurrency);
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'admin')").run(companyId, userId);

    logAudit(
      companyId,
      userId,
      "TRIAL_SIGNUP",
      "COMPANY",
      companyId,
      `Started 30-day free trial for ${companyName} (${baseCurrency}) — expires ${trialEndIso.slice(0, 10)}`
    );

    const token = await createSessionCookie(userId);
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);

    return NextResponse.json(
      {
        token,
        user: {
          id: userId,
          name,
          email,
          role: "admin",
          preferred_lang: lang,
          preferred_calendar: "gregorian",
        },
        company,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
