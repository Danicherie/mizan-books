import { mulMinor } from "./money";

function divideMinor(minor: number, quantity: number): number {
  if (!Number.isSafeInteger(minor)) throw new Error("Minor units must be a safe integer");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be more than 0.");
  const text = quantity.toString().includes("e") ? quantity.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : quantity.toString();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error("Quantity must be more than 0.");
  const frac = match[2] ?? "";
  const scale = 10n ** BigInt(frac.length);
  const qty = BigInt(match[1]) * scale + BigInt(frac || "0");
  if (qty <= 0n) throw new Error("Quantity must be more than 0.");
  const negative = minor < 0;
  const abs = BigInt(Math.abs(minor)) * scale;
  const quotient = abs / qty;
  const remainder = abs % qty;
  const rounded = remainder * 2n >= qty ? quotient + 1n : quotient;
  const signed = negative ? -rounded : rounded;
  return Number(signed);
}

/**
 * Moving average cost in cents.
 * oldQty may be 0. addQty must be positive. Costs are cents per unit.
 */
export function weightedAverageMinor(oldQty: number, oldCostMinor: number, addQty: number, addCostMinor: number): number {
  if (!Number.isFinite(addQty) || addQty <= 0) throw new Error("Quantity must be more than 0.");
  if (addCostMinor < 0 || oldCostMinor < 0) throw new Error("Cost cannot be negative.");
  const keptQty = oldQty > 0 ? oldQty : 0;
  const oldValue = keptQty > 0 ? mulMinor(oldCostMinor, keptQty) : 0;
  const addValue = mulMinor(addCostMinor, addQty);
  return divideMinor(oldValue + addValue, keptQty + addQty);
}
