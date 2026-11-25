import crypto from "node:crypto";
import { cookies } from "next/headers";
import { sessionCookieSecure } from "./auth";
import { PUBLISHED_PASSWORDS } from "./passwords";
import { getSessionSecret } from "./session-secret";

export const OPERATOR_COOKIE = "mizan_operator";
export const OPERATOR_SESSION_MS = 4 * 60 * 60 * 1000;
const MIN_OPERATOR_PASSWORD = 12;

function operatorKey(): string {
  return `${getSessionSecret()}\0mizan-operator-v1`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", operatorKey()).update(payload).digest("hex");
}

export function operatorConfigProblem(): "unset" | "short" | "published" | null {
  const value = process.env.OPERATOR_PASSWORD;
  if (value == null || value.trim() === "") return "unset";
  if (value.length < MIN_OPERATOR_PASSWORD) return "short";
  if (PUBLISHED_PASSWORDS.has(value)) return "published";
  return null;
}

export function operatorAdminEnabled(): boolean {
  return operatorConfigProblem() === null;
}

/** SHA-256 both sides so the comparison stays constant-time for any password length. */
export function operatorPasswordMatches(provided: string): boolean {
  if (!operatorAdminEnabled()) return false;
  const expected = process.env.OPERATOR_PASSWORD ?? "";
  const actualHash = crypto.createHash("sha256").update(provided, "utf8").digest();
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

export function createOperatorSessionToken(now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ op: 1, iat: now, exp: now + OPERATOR_SESSION_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyOperatorSessionToken(token: string, now = Date.now()): boolean {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      op?: number;
      exp?: number;
      iat?: number;
    };
    if (parsed.op !== 1 || !Number.isFinite(parsed.exp) || !Number.isFinite(parsed.iat)) return false;
    if ((parsed.iat as number) > now + 60_000) return false;
    return (parsed.exp as number) > now;
  } catch {
    return false;
  }
}

export async function setOperatorCookie(now = Date.now()): Promise<void> {
  const secure = await sessionCookieSecure();
  const jar = await cookies();
  jar.set(OPERATOR_COOKIE, createOperatorSessionToken(now), {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/admin",
    maxAge: Math.floor(OPERATOR_SESSION_MS / 1000),
  });
}

export async function clearOperatorCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(OPERATOR_COOKIE);
}

export async function hasOperatorSession(): Promise<boolean> {
  if (!operatorAdminEnabled()) return false;
  try {
    const jar = await cookies();
    const token = jar.get(OPERATOR_COOKIE)?.value;
    if (!token) return false;
    return verifyOperatorSessionToken(token);
  } catch {
    return false;
  }
}
