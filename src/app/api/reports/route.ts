import { NextResponse } from "next/server";
import { computeFinancialStatements } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const asOf = searchParams.get("asOf") || undefined;
  const company = getCompanyRecord(companyId);
  const statements = computeFinancialStatements(companyId, asOf);
  return NextResponse.json({ company, asOf: asOf || null, ...statements });
}
