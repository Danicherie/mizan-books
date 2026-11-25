/** Pure subscription rules. Safe to import from client components. */

export const TRIAL_LENGTH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus = "trial" | "active" | "expired" | "paused";

export interface SubscriptionFields {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  paid_until?: string | null;
}

export interface SubscriptionAccess {
  status: SubscriptionStatus;
  canMutate: boolean;
  daysLeft: number | null;
  trialEndsAt: string | null;
  paidUntil: string | null;
}

export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let normalized = trimmed;
  if (!trimmed.includes("T")) {
    normalized = `${trimmed.replace(" ", "T")}Z`;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export function trialWindow(from = new Date()): { trialStartsAt: string; trialEndsAt: string } {
  return {
    trialStartsAt: from.toISOString(),
    trialEndsAt: addDays(from, TRIAL_LENGTH_DAYS).toISOString(),
  };
}

export function endOfUtcDay(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function normalizeStored(raw: string | null | undefined): SubscriptionStatus | "unknown" {
  const value = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "trial" || value === "trialing") return "trial";
  if (value === "active") return "active";
  if (value === "paused") return "paused";
  if (value === "expired" || value === "past_due") return "expired";
  return "unknown";
}

export function daysRemaining(end: Date, now: Date): number {
  const remaining = end.getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
}

/**
 * Writes are allowed during an open trial, or while paid_until is still in the future.
 * A paused company is view-only even if a payment date is in the future.
 * A stored "active" flag without a future paid_until does not keep writes open after the trial.
 */
export function evaluateSubscription(company: SubscriptionFields, now = new Date()): SubscriptionAccess {
  const stored = normalizeStored(company.subscription_status);
  const trialEnd = parseTimestamp(company.trial_ends_at);
  const paidUntil = parseTimestamp(company.paid_until);
  const paidActive = !!paidUntil && paidUntil.getTime() > now.getTime();
  const trialActive = !!trialEnd && trialEnd.getTime() > now.getTime();
  const trialDaysLeft = trialEnd ? daysRemaining(trialEnd, now) : null;

  if (stored === "paused") {
    return {
      status: "paused",
      canMutate: false,
      daysLeft: trialActive ? trialDaysLeft : null,
      trialEndsAt: company.trial_ends_at ?? null,
      paidUntil: company.paid_until ?? null,
    };
  }

  if (paidActive) {
    return {
      status: "active",
      canMutate: true,
      daysLeft: null,
      trialEndsAt: company.trial_ends_at ?? null,
      paidUntil: company.paid_until ?? null,
    };
  }

  if (trialActive) {
    return {
      status: "trial",
      canMutate: true,
      daysLeft: trialDaysLeft,
      trialEndsAt: company.trial_ends_at ?? null,
      paidUntil: company.paid_until ?? null,
    };
  }

  return {
    status: "expired",
    canMutate: false,
    daysLeft: 0,
    trialEndsAt: company.trial_ends_at ?? null,
    paidUntil: company.paid_until ?? null,
  };
}
