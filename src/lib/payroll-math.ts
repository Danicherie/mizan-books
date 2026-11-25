import { fromMinor, percentOfMinor, toMinor } from "./money";

/**
 * Ethiopian Proclamation No. 979/2016 progressive employment income tax (ETB).
 * For non-ETB companies, uses a regional default (0% in GCC/UAE, or a simple Somalia scale).
 * An accountant should confirm these brackets before anyone files a return from them.
 */
export function calculateIncomeTax(taxableIncome: number, taxRegime: string): number {
  if (taxRegime === "UAE_VAT" || taxRegime === "SA_VAT" || taxRegime === "EXEMPT") {
    return 0;
  }
  if (taxRegime === "SO_CUSTOM") {
    if (taxableIncome <= 200) return 0;
    if (taxableIncome <= 500) return (taxableIncome - 200) * 0.06;
    if (taxableIncome <= 1000) return 18 + (taxableIncome - 500) * 0.12;
    return 78 + (taxableIncome - 1000) * 0.18;
  }
  if (taxableIncome <= 600) return 0;
  if (taxableIncome <= 1650) return taxableIncome * 0.1 - 60;
  if (taxableIncome <= 3200) return taxableIncome * 0.15 - 142.5;
  if (taxableIncome <= 5250) return taxableIncome * 0.2 - 302.5;
  if (taxableIncome <= 7800) return taxableIncome * 0.25 - 565;
  if (taxableIncome <= 10900) return taxableIncome * 0.3 - 955;
  return taxableIncome * 0.35 - 1500;
}

export interface EmployeePayInput {
  /** Minor units. */
  base_salary: number;
  transport_allowance: number;
  housing_allowance: number;
}

export interface EmployeePay {
  /** All fields are minor units, and net = gross - tax - employee pension exactly. */
  gross: number;
  taxable: number;
  tax: number;
  empPen: number;
  coPen: number;
  net: number;
}

export function computeEmployeePay(employee: EmployeePayInput, taxRegime: string): EmployeePay {
  const gross = employee.base_salary + employee.transport_allowance + employee.housing_allowance;
  const transportExempt = taxRegime === "ET_STANDARD" ? Math.min(employee.transport_allowance, toMinor(600)) : 0;
  const taxable = Math.max(0, gross - transportExempt);
  const tax = toMinor(calculateIncomeTax(fromMinor(taxable), taxRegime));
  const empPen = taxRegime === "ET_STANDARD" ? percentOfMinor(employee.base_salary, 7) : 0;
  const coPen = taxRegime === "ET_STANDARD" ? percentOfMinor(employee.base_salary, 11) : 0;
  const net = gross - tax - empPen;
  return { gross, taxable, tax, empPen, coPen, net };
}
