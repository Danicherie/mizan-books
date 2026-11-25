import { NextResponse } from "next/server";
import { getDb, logAudit, seedCompanyChartOfAccounts, seedCompanyExchangeRates } from "@/lib/db";
import { createSessionCookie, hashPassword } from "@/lib/auth";
import { TAX_REGIMES } from "@/lib/currency";
import { clientErrorResponse, isSignupEnabled, tooManyAttempts } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { cleanEmail, cleanText, userPasswordProblem } from "@/lib/passwords";
import { SIGNUP_LIMIT, SIGNUP_WINDOW_MS, clientAddress, rateLimit } from "@/lib/rate-limit";
import { trialWindow } from "@/lib/subscription";

const CURRENCIES = new Set(["ETB", "USD", "SOS", "KES", "SAR", "AED", "EUR"]);

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;

  if (!isSignupEnabled()) {
    return NextResponse.json(
      { error: "New sign-ups are turned off. Ask the owner for an account.", code: "SIGNUP_DISABLED" },
      { status: 403 }
    );
  }

  const limit = rateLimit(`signup:${clientAddress(request.headers)}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  if (!limit.ok) return tooManyAttempts(limit.retryAfterSec);

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

    const name = cleanText(body.name, 120);
    const email = cleanEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const companyName = cleanText(body.company_name, 200);
    const passwordProblem = userPasswordProblem(password);

    if (!name || !email || !companyName || passwordProblem) {
      return NextResponse.json(
        {
          error:
            passwordProblem ||
            "Full name, a valid email, a password of at least 8 characters, and a company name are required.",
        },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const lang = ["en", "am", "om", "so", "ar"].includes(body.preferred_lang || "") ? (body.preferred_lang as string) : "en";
    const baseCurrency = body.base_currency && CURRENCIES.has(body.base_currency) ? body.base_currency : "ETB";
    const regimeCode = TAX_REGIMES.some((regime) => regime.code === body.tax_regime) ? (body.tax_regime as string) : "ET_STANDARD";
    const regimeMeta = TAX_REGIMES.find((regime) => regime.code === regimeCode);
    const defaultVat = regimeMeta?.defaultVat ?? 15;
    const defaultWht = regimeMeta?.defaultWht ?? 0;
    const trial = trialWindow();
    const country = cleanText(body.country, 80) || "Ethiopia";
    const tin = typeof body.tin_number === "string" ? body.tin_number.trim().slice(0, 64) : "";

    const userRes = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, preferred_lang, preferred_calendar)
         VALUES (?, ?, ?, 'admin', ?, 'gregorian')`
      )
      .run(name, email, hashPassword(password), lang);
    const userId = Number(userRes.lastInsertRowid);

    const compRes = db
      .prepare(
        `INSERT INTO companies (
           name, legal_name, tin_number, base_currency, country, tax_regime,
           default_vat_rate, default_wht_rate, email, plan_name, subscription_status,
           trial_starts_at, trial_ends_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'FREE_TRIAL', 'trial', ?, ?)`
      )
      .run(
        companyName,
        companyName,
        tin,
        baseCurrency,
        country,
        regimeCode,
        defaultVat,
        defaultWht,
        email,
        trial.trialStartsAt,
        trial.trialEndsAt
      );
    const companyId = Number(compRes.lastInsertRowid);

    seedCompanyChartOfAccounts(db, companyId);
    seedCompanyExchangeRates(db, companyId, baseCurrency);
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'admin')").run(companyId, userId);

    logAudit(
      companyId,
      userId,
      "TRIAL_SIGNUP",
      "COMPANY",
      companyId,
      `Started 30-day free trial for ${companyName} (${baseCurrency}) — expires ${trial.trialEndsAt.slice(0, 10)}`
    );

    const token = await createSessionCookie(userId);
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as Record<string, unknown>;
    delete company.subscription_notes;

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
    return clientErrorResponse(err);
  }
}
