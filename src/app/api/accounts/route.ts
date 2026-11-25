import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountBalances } from "@/lib/accounting";
import { requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const accounts = getAccountBalances(scoped.companyId);
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      code: string;
      name: string;
      name_am?: string;
      name_om?: string;
      name_so?: string;
      name_ar?: string;
      type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
      subtype?: string;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    if (!body.code?.trim() || !body.name?.trim() || !body.type) {
      return NextResponse.json({ error: "Code, name, and type are required" }, { status: 400 });
    }
    const normalBalance = body.type === "ASSET" || body.type === "EXPENSE" ? "DEBIT" : "CREDIT";
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO accounts (company_id, code, name, name_am, name_om, name_so, name_ar, type, subtype, normal_balance, is_system, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
      `)
      .run(
        companyId,
        body.code.trim(),
        body.name.trim(),
        body.name_am?.trim() || null,
        body.name_om?.trim() || null,
        body.name_so?.trim() || null,
        body.name_ar?.trim() || null,
        body.type,
        body.subtype?.trim() || "OTHER",
        normalBalance
      );

    const id = Number(res.lastInsertRowid);
    logAudit(companyId, auth.user.id, "CREATE_ACCOUNT", "ACCOUNT", id, `Created account ${body.code} - ${body.name}`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
