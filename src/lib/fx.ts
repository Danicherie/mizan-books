import { getDb } from "./db";
import { fromMinor, mulMinor } from "./money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** How many units of the company base currency one unit of `currency` buys on `onDate`. */
export function rateToBaseOn(companyId: number, currency: string, baseCurrency: string, onDate: string): number {
  const code = currency.trim().toUpperCase();
  if (!code || code === baseCurrency) return 1;
  if (!isIsoDate(onDate)) throw new Error("Choose a valid date.");
  const db = getDb();
  const dated = db
    .prepare(
      `SELECT rate_to_base FROM exchange_rate_history
       WHERE company_id = ? AND currency_code = ? AND rate_date <= ?
       ORDER BY rate_date DESC LIMIT 1`
    )
    .get(companyId, code, onDate) as { rate_to_base: number } | undefined;
  if (dated && Number(dated.rate_to_base) > 0) return Number(dated.rate_to_base);
  const current = db
    .prepare("SELECT rate_to_base FROM exchange_rates WHERE company_id = ? AND currency_code = ?")
    .get(companyId, code) as { rate_to_base: number } | undefined;
  if (current && Number(current.rate_to_base) > 0) return Number(current.rate_to_base);
  throw new Error(`No exchange rate is saved for ${code}.`);
}

export function resolveDocumentRate(
  companyId: number,
  baseCurrency: string,
  currencyCode: string | undefined,
  onDate: string,
  explicitRate?: number
): number {
  const code = (currencyCode || baseCurrency).trim().toUpperCase();
  if (code === baseCurrency) return 1;
  const explicit = Number(explicitRate || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return rateToBaseOn(companyId, code, baseCurrency, onDate);
}

export function recordExchangeRate(companyId: number, currencyCode: string, rate: number, rateDate: string): void {
  const code = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Currency code must be 3 letters.");
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) throw new Error("Rate must be a positive number.");
  if (!isIsoDate(rateDate)) throw new Error("Choose a valid rate date.");
  const db = getDb();
  db.prepare(
    `INSERT INTO exchange_rates (company_id, currency_code, rate_to_base, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id, currency_code) DO UPDATE SET rate_to_base = excluded.rate_to_base, updated_at = excluded.updated_at`
  ).run(companyId, code, rate, rateDate);
  db.prepare(
    `INSERT INTO exchange_rate_history (company_id, currency_code, rate_date, rate_to_base)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(company_id, currency_code, rate_date) DO UPDATE SET rate_to_base = excluded.rate_to_base`
  ).run(companyId, code, rateDate, rate);
}

export interface Settlement {
  bookedBase: number;
  settledBase: number;
  fxMinor: number;
}

/** Booked base is the invoice/bill rate. Settled base is the rate on the payment date. */
export function settlementBases(foreignMinor: number, bookedRate: number, payRate: number): Settlement {
  const bookedBase = mulMinor(foreignMinor, bookedRate);
  const settledBase = mulMinor(foreignMinor, payRate);
  return { bookedBase, settledBase, fxMinor: settledBase - bookedBase };
}

type MoneyLine = { account_id: number; description: string; debit: number; credit: number };

function pushFx(lines: MoneyLine[], fxAccountId: number, fxMinor: number, description: string, lossIsDebit: boolean) {
  if (fxMinor === 0) return;
  const amount = fromMinor(Math.abs(fxMinor));
  const debit = (fxMinor > 0) === lossIsDebit;
  lines.push({
    account_id: fxAccountId,
    description,
    debit: debit ? amount : 0,
    credit: debit ? 0 : amount,
  });
}

/** Customer receipt. A higher payment-date rate is a gain (credit FX). */
export function customerReceiptLines(input: {
  foreignMinor: number;
  bookedRate: number;
  payRate: number;
  bankAccountId: number;
  arAccountId: number;
  fxAccountId: number;
  description: string;
}): MoneyLine[] {
  const { bookedBase, settledBase, fxMinor } = settlementBases(input.foreignMinor, input.bookedRate, input.payRate);
  const lines: MoneyLine[] = [
    { account_id: input.bankAccountId, description: input.description, debit: fromMinor(settledBase), credit: 0 },
    { account_id: input.arAccountId, description: input.description, debit: 0, credit: fromMinor(bookedBase) },
  ];
  pushFx(lines, input.fxAccountId, fxMinor, input.description, false);
  return lines;
}

/** Supplier payment. A higher payment-date rate is a loss (debit FX). */
export function supplierPaymentLines(input: {
  foreignMinor: number;
  bookedRate: number;
  payRate: number;
  bankAccountId: number;
  apAccountId: number;
  fxAccountId: number;
  description: string;
}): MoneyLine[] {
  const { bookedBase, settledBase, fxMinor } = settlementBases(input.foreignMinor, input.bookedRate, input.payRate);
  const lines: MoneyLine[] = [
    { account_id: input.apAccountId, description: input.description, debit: fromMinor(bookedBase), credit: 0 },
    { account_id: input.bankAccountId, description: input.description, debit: 0, credit: fromMinor(settledBase) },
  ];
  pushFx(lines, input.fxAccountId, fxMinor, input.description, true);
  return lines;
}
