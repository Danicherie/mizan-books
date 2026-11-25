import { NextResponse } from "next/server";
import { getDb, logAudit, seedCompanyChartOfAccounts, seedCompanyExchangeRates } from "@/lib/db";
import { getUserCompanies, requireAdmin, requireAuth } from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const companies = getUserCompanies(auth.user.id);
  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

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
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }
    const db = getDb();
    const baseCurrency = body.base_currency || "ETB";
    const res = db
      .prepare(`
        INSERT INTO companies (name, legal_name, tin_number, base_currency, country, tax_regime, default_vat_rate, default_wht_rate, address, phone, email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        body.name.trim(),
        (body.legal_name || body.name).trim(),
        body.tin_number || "",
        baseCurrency,
        body.country || "Ethiopia",
        body.tax_regime || "ET_STANDARD",
        Number(body.default_vat_rate ?? 15),
        Number(body.default_wht_rate ?? 2),
        body.address || "",
        body.phone || "",
        body.email || ""
      );

    const companyId = Number(res.lastInsertRowid);
    seedCompanyChartOfAccounts(db, companyId);
    seedCompanyExchangeRates(db, companyId, baseCurrency);
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'admin')").run(
      companyId,
      auth.user.id
    );
    logAudit(companyId, auth.user.id, "CREATE_COMPANY", "COMPANY", companyId, `Created company ${body.name} (${baseCurrency})`);

    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
    return NextResponse.json({ company }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
