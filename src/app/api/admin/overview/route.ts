import { NextResponse } from "next/server";
import { appVersion, databaseOk } from "@/lib/app-info";
import { hasOperatorSession } from "@/lib/operator-auth";
import { listCompaniesForOperator } from "@/lib/subscription-admin";

export async function GET() {
  if (!(await hasOperatorSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dbOk = databaseOk();
  return NextResponse.json({
    health: { db: dbOk ? "ok" : "error", version: appVersion() },
    companies: dbOk ? listCompaniesForOperator() : [],
  });
}
