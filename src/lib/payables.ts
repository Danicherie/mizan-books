import { mulMinor } from "./money";

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90";

export interface OpenBill {
  due_date: string;
  total: number;
  amount_paid: number;
  exchange_rate: number;
}

export function addIsoDays(iso: string, days: number): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Choose a valid date.");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(as)) return "current";
  const days = Math.floor((as - due) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90";
}

/** Open supplier balances in base-currency cents, grouped by how late they are. */
export function agedPayables(bills: OpenBill[], asOf: string): Record<AgingBucket, number> {
  const totals: Record<AgingBucket, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  for (const bill of bills) {
    const remaining = Math.trunc(bill.total) - Math.trunc(bill.amount_paid);
    if (remaining <= 0) continue;
    const base = mulMinor(remaining, Number(bill.exchange_rate) || 1);
    totals[agingBucket(bill.due_date, asOf)] += base;
  }
  return totals;
}

export function isDueSoon(dueDate: string, asOf: string, withinDays = 7): boolean {
  return dueDate >= asOf && dueDate <= addIsoDays(asOf, withinDays);
}
