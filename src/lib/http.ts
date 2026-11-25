import { NextResponse } from "next/server";

const UNSAFE = /sqlite|syntax error|password_hash|secret|token|cookie|stack|node:|\/app\/|\/home\//i;

function isSafeMessage(message: string): boolean {
  return message.length > 0 && message.length <= 240 && !message.includes("\n") && !UNSAFE.test(message);
}

function logServerError(err: unknown) {
  const message = err instanceof Error ? err.message : "unknown error";
  if (/password|secret|token|cookie/i.test(message)) {
    console.error("[mizan] request failed");
    return;
  }
  console.error("[mizan] request failed:", message.slice(0, 300));
}

export function clientErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "";
  if (/UNIQUE constraint failed/i.test(message)) {
    return NextResponse.json({ error: "That record already exists." }, { status: 409 });
  }
  if (isSafeMessage(message)) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  logServerError(err);
  return NextResponse.json({ error: "Request could not be completed." }, { status: 500 });
}

export function tooManyAttempts(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Please wait and try again.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export function isSignupEnabled(): boolean {
  const value = (process.env.SIGNUP_ENABLED ?? "").trim().toLowerCase();
  if (!value) return true;
  return value !== "false" && value !== "0" && value !== "off" && value !== "no";
}
