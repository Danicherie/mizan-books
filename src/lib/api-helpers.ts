import { NextResponse } from "next/server";
import { canWrite, getCurrentUser, isAdmin, type SessionUser } from "./auth";
import { getDb } from "./db";

export async function requireAuth(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

export async function requireWrite(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (!canWrite(auth.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden: Read-only access" }, { status: 403 }) };
  }
  return auth;
}

export async function requireAdmin(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const auth = await requireAuth();
  if ("error" in auth) return auth;
  if (!isAdmin(auth.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 }) };
  }
  return auth;
}

export function userHasCompanyAccess(userId: number, companyId: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 as ok FROM company_users WHERE user_id = ? AND company_id = ?")
    .get(userId, companyId) as { ok: number } | undefined;
  return !!row;
}

export function getUserCompanies(userId: number) {
  const db = getDb();
  return db
    .prepare(`
      SELECT c.*
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE cu.user_id = ?
      ORDER BY c.id ASC
    `)
    .all(userId);
}

/**
 * Strictly resolves a company ID that the authenticated user is allowed to access.
 * Returns a 403 NextResponse if the user explicitly requests a company they don't belong to.
 */
export function resolveScopedCompanyId(
  userId: number,
  rawId: string | number | null | undefined
): { companyId: number } | { error: NextResponse } {
  const db = getDb();
  const parsed = Number(rawId);
  if (rawId !== null && rawId !== undefined && String(rawId).trim() !== "" && Number.isFinite(parsed) && parsed > 0) {
    if (!userHasCompanyAccess(userId, parsed)) {
      return {
        error: NextResponse.json({ error: "Forbidden: You do not have access to this company" }, { status: 403 }),
      };
    }
    return { companyId: parsed };
  }
  const first = db
    .prepare("SELECT company_id FROM company_users WHERE user_id = ? ORDER BY company_id ASC LIMIT 1")
    .get(userId) as { company_id: number } | undefined;
  if (!first) {
    return { error: NextResponse.json({ error: "No company assigned to this account" }, { status: 403 }) };
  }
  return { companyId: first.company_id };
}

export function getCompanyRecord(companyId: number) {
  const db = getDb();
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as {
    id: number;
    name: string;
    legal_name: string;
    tin_number: string;
    base_currency: string;
    country: string;
    tax_regime: string;
    default_vat_rate: number;
    default_wht_rate: number;
    fiscal_year_start_month: number;
    address: string;
    phone: string;
    email: string;
    plan_name: string;
    subscription_status: string;
    trial_starts_at: string;
    trial_ends_at: string;
  };
}
