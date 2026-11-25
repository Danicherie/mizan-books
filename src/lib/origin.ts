import { NextResponse } from "next/server";

export function isMutationMethod(method: string): boolean {
  const verb = method.toUpperCase();
  return verb !== "GET" && verb !== "HEAD" && verb !== "OPTIONS";
}

/**
 * Cookie-authenticated mutations must come from ALLOWED_ORIGIN, or from the same host
 * when ALLOWED_ORIGIN is unset or "*". Bearer tokens are not sent by a browser automatically,
 * so mobile clients are not treated as cross-site cookie requests.
 */
export function originAllowed(input: {
  method: string;
  origin: string | null;
  host: string | null;
  authorization?: string | null;
  allowedOrigin?: string | null;
}): boolean {
  if (!isMutationMethod(input.method)) return true;
  if (input.authorization?.trim().toLowerCase().startsWith("bearer ")) return true;
  if (!input.origin) return false;

  let originValue: URL;
  try {
    originValue = new URL(input.origin);
  } catch {
    return false;
  }

  const allowed = (input.allowedOrigin ?? "").trim();
  if (allowed && allowed !== "*") {
    try {
      return originValue.origin === new URL(allowed).origin;
    } catch {
      return originValue.origin === allowed.replace(/\/$/, "");
    }
  }

  const host = (input.host ?? "").split(",")[0]?.trim() ?? "";
  return host.length > 0 && originValue.host === host;
}

export function assertMutationOrigin(request: Request): NextResponse | null {
  const allowed = originAllowed({
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    authorization: request.headers.get("authorization"),
    allowedOrigin: process.env.ALLOWED_ORIGIN,
  });
  if (allowed) return null;
  return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
}
