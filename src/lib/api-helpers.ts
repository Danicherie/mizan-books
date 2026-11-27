import { NextResponse } from "next/server";
import { canWrite, getCurrentUser, isAdmin, type SessionUser } from "./auth";
import { getDb } from "./db";
import { evaluateSubscription } from "./subscription";
import { canKeepBooks, normalizeCompanyRole } from "./team";

export async function requireAuth(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

export async function requireWrite(): Promise<{ user: SessionUser } | { error: NextResponse }> {
  // The company membership is the role check. A person can be a viewer on one
  // company and staff on another, so the global user role is not the lock.
  const auth = await requireAuth();
  if ("error" in auth) return auth;
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
  const rows = db
    .prepare(`
      SELECT c.*, cu.role AS membership_role
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE cu.user_id = ?
      ORDER BY c.id ASC
    `)
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const copy = { ...row };
    delete copy.subscription_notes;
    return copy;
  });
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
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as
    | {
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
        paid_until: string | null;
        subscription_notes?: string;
      }
    | undefined;
  if (!row) throw new Error("Company not found.");
  const copy = { ...row };
  delete copy.subscription_notes;
  return copy;
}

function subscriptionBlocked(company: {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  paid_until?: string | null;
}): NextResponse | null {
  const access = evaluateSubscription(company);
  if (access.canMutate) return null;
  const error =
    access.status === "paused"
      ? "This company is paused. You can view and export data, but changes are turned off."
      : "Subscription needed. You can view and export data, but changes are turned off until the company is subscribed.";
  return NextResponse.json({ error, code: "SUBSCRIPTION_REQUIRED", subscription_status: access.status }, { status: 403 });
}

/**
 * Membership role is the authority for a company. Viewers can read and export.
 * Trial expiry, a lapsed paid_until, and pause block every create, edit, and delete.
 */
export function guardCompanyMutation(
  user: SessionUser,
  companyId: number,
  options?: { adminOnly?: boolean; booksOnly?: boolean }
): NextResponse | null {
  const db = getDb();
  const membership = db
    .prepare("SELECT role FROM company_users WHERE user_id = ? AND company_id = ?")
    .get(user.id, companyId) as { role: string } | undefined;
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role = normalizeCompanyRole(membership.role);
  if (options?.adminOnly) {
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }
  } else if (options?.booksOnly) {
    if (!canKeepBooks(role)) {
      return NextResponse.json({ error: "Forbidden: Owner or accountant role required" }, { status: 403 });
    }
  } else if (!role || !canWrite(role)) {
    return NextResponse.json({ error: "Forbidden: Read-only access" }, { status: 403 });
  }
  return subscriptionBlocked(getCompanyRecord(companyId));
}

/** A new company is its own trial. Block it when every company this user can see is already locked. */
export function guardNewCompany(userId: number): NextResponse | null {
  const companies = getUserCompanies(userId) as Array<{
    subscription_status?: string | null;
    trial_ends_at?: string | null;
    paid_until?: string | null;
  }>;
  if (companies.length === 0) return null;
  if (companies.some((company) => evaluateSubscription(company).canMutate)) return null;
  return subscriptionBlocked({ subscription_status: "expired", trial_ends_at: "2000-01-01T00:00:00.000Z" });
}
