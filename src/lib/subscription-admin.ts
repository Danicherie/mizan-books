import { getDb, logAudit } from "./db";
import {
  addDays,
  evaluateSubscription,
  parseTimestamp,
  type SubscriptionStatus,
} from "./subscription";

export interface OperatorCompanyRow {
  id: number;
  name: string;
  created_at: string;
  user_count: number;
  status: SubscriptionStatus;
  stored_status: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  notes: string;
  can_mutate: boolean;
  days_left: number | null;
}

interface CompanyRow {
  id: number;
  name: string;
  subscription_status: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  subscription_notes: string | null;
  created_at: string;
  user_count?: number;
}

function loadCompany(companyId: number): CompanyRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, subscription_status, trial_ends_at, paid_until, subscription_notes, created_at
       FROM companies WHERE id = ?`
    )
    .get(companyId) as CompanyRow | undefined;
}

function logOperator(action: string, companyId: number | null, details: string, companyVisible: boolean) {
  const db = getDb();
  const text = details.slice(0, 1000);
  db.prepare("INSERT INTO operator_audit (action, company_id, details) VALUES (?, ?, ?)").run(action, companyId, text);
  if (companyVisible && companyId != null) {
    logAudit(companyId, null, action, "SUBSCRIPTION", companyId, text.slice(0, 300));
  }
}

export function listCompaniesForOperator(now = new Date()): OperatorCompanyRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.created_at, c.subscription_status, c.trial_ends_at, c.paid_until, c.subscription_notes,
              (SELECT COUNT(*) FROM company_users cu WHERE cu.company_id = c.id) AS user_count
       FROM companies c
       ORDER BY c.name COLLATE NOCASE ASC, c.id ASC`
    )
    .all() as unknown as CompanyRow[];

  return rows.map((row) => {
    const access = evaluateSubscription(row, now);
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      user_count: Number(row.user_count ?? 0),
      status: access.status,
      stored_status: row.subscription_status,
      trial_ends_at: row.trial_ends_at,
      paid_until: row.paid_until,
      notes: row.subscription_notes ?? "",
      can_mutate: access.canMutate,
      days_left: access.daysLeft,
    };
  });
}

function rememberNote(notes: string | undefined, current: string | null) {
  const next = notes?.trim();
  if (!next) return current ?? "";
  return next.slice(0, 1000);
}

function applyNote(companyId: number, notes: string | undefined, current: string | null) {
  const next = notes?.trim();
  if (!next) return;
  const text = next.slice(0, 1000);
  if ((current ?? "") === text) return;
  getDb().prepare("UPDATE companies SET subscription_notes = ? WHERE id = ?").run(text, companyId);
  logOperator("SUBSCRIPTION_NOTE", companyId, `Note: ${text.slice(0, 500)}`, false);
}

/** Seam for a future payment provider. Recording paid_until is the only step Stripe needs to call. */
export function setPaidUntil(companyId: number, paidUntil: Date, notes?: string, now = new Date()): void {
  const company = loadCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const iso = paidUntil.toISOString();
  const paused = (company.subscription_status ?? "").trim().toLowerCase() === "paused";
  const access = evaluateSubscription(
    { ...company, paid_until: iso, subscription_status: paused ? "paused" : "trial" },
    now
  );
  const status = paused ? "paused" : access.status === "active" ? "active" : access.status;
  const note = rememberNote(notes, company.subscription_notes);
  const db = getDb();
  db.prepare(
    `UPDATE companies
     SET paid_until = ?, subscription_status = ?, subscription_notes = ?, plan_name = 'PAID'
     WHERE id = ?`
  ).run(iso, status, note, companyId);
  const day = iso.slice(0, 10);
  logOperator("MARK_PAID", companyId, `Marked paid until ${day}.`, true);
  if (notes?.trim()) {
    logOperator("SUBSCRIPTION_NOTE", companyId, `Note: ${notes.trim().slice(0, 500)}`, false);
  }
}

export function extendTrial(companyId: number, days: number, now = new Date(), notes?: string): string {
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error("Days must be a whole number from 1 to 3650.");
  }
  const company = loadCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const currentEnd = parseTimestamp(company.trial_ends_at);
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const next = addDays(base, days);
  const iso = next.toISOString();
  const paused = (company.subscription_status ?? "").trim().toLowerCase() === "paused";
  const access = evaluateSubscription(
    { ...company, trial_ends_at: iso, subscription_status: paused ? "paused" : "trial" },
    now
  );
  const status = paused ? "paused" : access.canMutate && access.status === "active" ? "active" : access.status;
  const db = getDb();
  db.prepare("UPDATE companies SET trial_ends_at = ?, subscription_status = ? WHERE id = ?").run(iso, status, companyId);
  logOperator("EXTEND_TRIAL", companyId, `Extended the free trial by ${days} days. Trial now ends ${iso.slice(0, 10)}.`, true);
  applyNote(companyId, notes, company.subscription_notes);
  return iso;
}

export function pauseCompany(companyId: number, notes?: string): void {
  const company = loadCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const db = getDb();
  db.prepare("UPDATE companies SET subscription_status = 'paused' WHERE id = ?").run(companyId);
  logOperator("PAUSE_COMPANY", companyId, `Paused ${company.name}. Viewing and export stay available.`, true);
  applyNote(companyId, notes, company.subscription_notes);
}

export function unpauseCompany(companyId: number, now = new Date(), notes?: string): SubscriptionStatus {
  const company = loadCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const access = evaluateSubscription({ ...company, subscription_status: "trial" }, now);
  const db = getDb();
  db.prepare("UPDATE companies SET subscription_status = ? WHERE id = ?").run(access.status, companyId);
  logOperator("UNPAUSE_COMPANY", companyId, `Resumed ${company.name}. Status is now ${access.status}.`, true);
  applyNote(companyId, notes, company.subscription_notes);
  return access.status;
}
