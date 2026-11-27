import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./auth";
import { cleanEmail, cleanText, userPasswordProblem } from "./passwords";

export const COMPANY_ROLES = ["admin", "accountant", "staff", "viewer"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export function normalizeCompanyRole(role: unknown): CompanyRole | null {
  const value = String(role ?? "accountant").trim().toLowerCase();
  if (value === "owner" || value === "admin") return "admin";
  if (value === "accountant" || value === "staff" || value === "viewer") return value;
  return null;
}

export function canKeepBooks(role: string | null | undefined): boolean {
  const normalized = normalizeCompanyRole(role);
  return normalized === "admin" || normalized === "accountant";
}

/**
 * Create a user or attach an existing login to this company.
 * An existing password is left alone. A new account needs a password.
 */
export function addCompanyMember(
  db: DatabaseSync,
  companyId: number,
  input: { name?: string; email?: string; password?: string; role?: unknown }
): { id: number; invited: boolean; role: CompanyRole } {
  const role = normalizeCompanyRole(input.role ?? "accountant");
  const email = cleanEmail(input.email);
  if (!role || !email) {
    throw new Error("Name, a valid email, and a role are required.");
  }
  const existing = db.prepare("SELECT id, name FROM users WHERE lower(email) = ?").get(email) as
    | { id: number; name: string }
    | undefined;
  if (existing) {
    const member = db
      .prepare("SELECT 1 AS ok FROM company_users WHERE company_id = ? AND user_id = ?")
      .get(companyId, existing.id) as { ok: number } | undefined;
    if (member) throw new Error("This person is already on the company.");
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)").run(companyId, existing.id, role);
    return { id: existing.id, invited: true, role };
  }

  const name = cleanText(input.name, 120);
  const password = typeof input.password === "string" ? input.password : "";
  const passwordProblem = userPasswordProblem(password);
  if (!name || passwordProblem) {
    throw new Error(passwordProblem || "Name, a valid email, and a password of at least 8 characters are required.");
  }
  const res = db
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(name, email, hashPassword(password), role);
  const id = Number(res.lastInsertRowid);
  db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)").run(companyId, id, role);
  return { id, invited: false, role };
}
