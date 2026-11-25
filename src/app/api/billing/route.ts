import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { requireAdmin, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      plan_name: "FREE_TRIAL" | "BUSINESS" | "ENTERPRISE";
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const plan = body.plan_name || "BUSINESS";
    const status = plan === "FREE_TRIAL" ? "TRIALING" : "ACTIVE";
    const db = getDb();

    db.prepare("UPDATE companies SET plan_name = ?, subscription_status = ? WHERE id = ?").run(
      plan,
      status,
      companyId
    );
    logAudit(companyId, auth.user.id, "UPDATE_PLAN", "SUBSCRIPTION", companyId, `Switched plan to ${plan} (${status})`);
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
    return NextResponse.json({ company });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
