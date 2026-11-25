import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb } from "./db";
import { getSessionSecret } from "./session-secret";

const SESSION_COOKIE = "mizan_session";

/** Sample companies and the published demo password exist only when this is exactly "true". */
export function isDemoLoginEnabled(): boolean {
  return process.env.ENABLE_DEMO_LOGIN === "true";
}

export type UserRole = "admin" | "accountant" | "viewer";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  preferred_lang: string;
  preferred_calendar: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function signToken(payload: string): string {
  const sig = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return payload;
}

export function createSessionToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now() })).toString("base64url");
  return signToken(payload);
}

async function isSecureRequest(): Promise<boolean> {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  try {
    const hdrs = await headers();
    return hdrs.get("x-forwarded-proto") === "https";
  } catch {
    return false;
  }
}

export async function createSessionCookie(userId: number): Promise<string> {
  const token = createSessionToken(userId);
  const secure = await isSecureRequest();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  let token: string | undefined;

  // Support Authorization: Bearer <token> for native mobile app (Expo / iOS / Android)
  try {
    const hdrs = await headers();
    const authHeader = hdrs.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  } catch {
    // ignore
  }

  if (!token) {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value;
  }

  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid: number };
    const db = getDb();
    const row = db
      .prepare("SELECT id, name, email, role, preferred_lang, preferred_calendar FROM users WHERE id = ?")
      .get(parsed.uid) as SessionUser | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function canWrite(role: UserRole): boolean {
  return role === "admin" || role === "accountant";
}

export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}
