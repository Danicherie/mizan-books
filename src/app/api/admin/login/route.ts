import { NextResponse } from "next/server";
import { appVersion, databaseOk } from "@/lib/app-info";
import { clientErrorResponse, tooManyAttempts } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import {
  hasOperatorSession,
  operatorAdminEnabled,
  operatorConfigProblem,
  operatorPasswordMatches,
  setOperatorCookie,
} from "@/lib/operator-auth";
import { getDb } from "@/lib/db";
import { ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS, clientAddress, rateLimit } from "@/lib/rate-limit";

function healthLine() {
  return { db: databaseOk() ? "ok" : "error", version: appVersion() };
}

export async function GET() {
  const enabled = operatorAdminEnabled();
  const authenticated = enabled && (await hasOperatorSession());
  return NextResponse.json({ enabled, authenticated, health: healthLine(), problem: enabled ? null : operatorConfigProblem() });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;

  const limit = rateLimit(`admin-login:${clientAddress(request.headers)}`, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS);
  if (!limit.ok) return tooManyAttempts(limit.retryAfterSec);

  const problem = operatorConfigProblem();
  if (problem) {
    const error =
      problem === "unset"
        ? "Operator admin is turned off. Set OPERATOR_PASSWORD on the server to enable it."
        : "Operator admin is turned off. OPERATOR_PASSWORD must be at least 12 characters and must not be a sample password.";
    return NextResponse.json({ error, code: "ADMIN_DISABLED" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (!operatorPasswordMatches(password)) {
      getDb()
        .prepare("INSERT INTO operator_audit (action, company_id, details) VALUES ('ADMIN_LOGIN_FAILED', NULL, ?)")
        .run("Rejected operator login.");
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }
    await setOperatorCookie();
    getDb()
      .prepare("INSERT INTO operator_audit (action, company_id, details) VALUES ('ADMIN_LOGIN', NULL, ?)")
      .run("Operator signed in.");
    return NextResponse.json({ ok: true, health: healthLine() });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
