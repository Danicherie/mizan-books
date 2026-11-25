/**
 * Money is stored and added as integer minor units (cents).
 * One minor unit is 1/100 of the currency's main unit for every currency
 * this app supports, including the Somali shilling (displayed with 0 decimals).
 * Rates, quantities, and tax percentages are not money and stay as plain numbers.
 */

const MINOR_PER_MAJOR = 100n;

export function toMinor(value: number | string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Amount must be a finite number");
    return parseDecimalToMinor(numberToDecimal(value));
  }
  const text = value.trim().replace(/^\+/, "");
  if (!text) throw new Error("Amount is empty");
  return parseDecimalToMinor(text);
}

export function fromMinor(minor: number): number {
  if (!Number.isSafeInteger(minor)) throw new Error("Minor units must be a safe integer");
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  const text = `${whole}.${String(frac).padStart(2, "0")}`;
  return negative ? -Number(text) : Number(text);
}

/** "10.10" style text, safe to show in an error message. */
export function minorToString(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Minor units must be a safe integer");
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function minorFromSql(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(-Number.MAX_SAFE_INTEGER)) {
      throw new Error("Amount is too large");
    }
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error("Database money value is not a whole number of minor units");
    }
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  throw new Error("Unexpected money value from the database");
}

export function withMajorMoney<T extends object>(row: T, fields: readonly string[]): T {
  const next: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of fields) {
    if (next[field] != null) {
      next[field] = fromMinor(minorFromSql(next[field]));
    }
  }
  return next as T;
}

/** Multiply a minor-unit amount by a decimal factor (quantity, exchange rate) and round half away from zero. */
export function mulMinor(minor: number, factor: number | string): number {
  if (!Number.isSafeInteger(minor)) throw new Error("Minor units must be a safe integer");
  const factorText = typeof factor === "number" ? numberToDecimal(factor) : factor.trim().replace(/^\+/, "");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(factorText);
  if (!match) throw new Error(`Invalid factor: ${factorText}`);
  const factorNeg = match[1] === "-";
  const whole = BigInt(match[2]);
  const frac = match[3] ?? "";
  const scale = 10n ** BigInt(frac.length);
  const factorInt = whole * scale + BigInt(frac || "0");
  const rounded = divRoundHalfAway(BigInt(minor) * factorInt, scale);
  const signed = factorNeg ? -rounded : rounded;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large");
  }
  return Number(signed);
}

/** `percent` is "15" for 15 percent, not 0.15. */
export function percentOfMinor(minor: number, percent: number): number {
  const scaled = mulMinor(minor, percent);
  return Number(divRoundHalfAway(BigInt(scaled), 100n));
}

export const INVOICE_MONEY_FIELDS = ["subtotal", "vat_amount", "wht_amount", "total", "amount_paid"] as const;
export const INVOICE_LINE_MONEY_FIELDS = ["unit_price", "line_total"] as const;
export const BILL_LINE_MONEY_FIELDS = ["unit_cost", "line_total"] as const;
export const JOURNAL_MONEY_FIELDS = ["debit", "credit", "foreign_amount"] as const;
export const INVENTORY_MONEY_FIELDS = ["unit_cost", "unit_price"] as const;
export const EMPLOYEE_MONEY_FIELDS = ["base_salary", "transport_allowance", "housing_allowance"] as const;
export const PAYROLL_RUN_MONEY_FIELDS = [
  "total_gross",
  "total_income_tax",
  "total_employee_pension",
  "total_employer_pension",
  "total_net",
] as const;
export const PAYROLL_ITEM_MONEY_FIELDS = [
  "gross_salary",
  "taxable_income",
  "income_tax",
  "employee_pension",
  "employer_pension",
  "net_salary",
] as const;

function numberToDecimal(value: number): string {
  if (Object.is(value, -0)) return "0";
  const text = value.toString();
  if (/[eE]/.test(text)) {
    return value.toFixed(8).replace(/\.?0+$/, "");
  }
  return text;
}

function parseDecimalToMinor(text: string): number {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid money amount: ${text}`);
  const negative = match[1] === "-";
  const whole = BigInt(match[2]);
  const fracAll = match[3] ?? "";
  const frac2 = (fracAll + "00").slice(0, 2);
  let minor = whole * MINOR_PER_MAJOR + BigInt(frac2);
  if (fracAll.length > 2 && fracAll.charCodeAt(2) - 48 >= 5) {
    minor += 1n;
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large");
  const asNumber = Number(minor);
  return negative ? -asNumber : asNumber;
}

function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Invalid divisor");
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}
