import { getDb } from "./db";

export interface JournalLineInput {
  account_id: number;
  description?: string;
  debit: number;
  credit: number;
  currency_code?: string;
  exchange_rate?: number;
  foreign_amount?: number;
}

export function nextSequenceNumber(companyId: number, table: "journal_entries" | "invoices" | "bills", column: string, prefix: string): string {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE company_id = ?`)
    .get(companyId) as { c: number };
  const nextNum = String(row.c + 1).padStart(4, "0");
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${nextNum}`;
}

export function getAccountByCode(companyId: number, code: string): { id: number; code: string; name: string } {
  const db = getDb();
  const row = db
    .prepare("SELECT id, code, name FROM accounts WHERE company_id = ? AND code = ?")
    .get(companyId, code) as { id: number; code: string; name: string } | undefined;
  if (!row) {
    throw new Error(`Required system account ${code} not found for company ${companyId}`);
  }
  return row;
}

export function postJournalEntry(params: {
  company_id: number;
  entry_date: string;
  reference?: string;
  description: string;
  source_type?: string;
  source_id?: number | null;
  created_by?: number | null;
  currency_code?: string;
  lines: JournalLineInput[];
}): number {
  const db = getDb();
  const validLines = params.lines.filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0);
  if (validLines.length < 2) {
    throw new Error("A journal entry requires at least two non-zero lines.");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of validLines) {
    const d = Number(line.debit || 0);
    const c = Number(line.credit || 0);
    if (d < 0 || c < 0) throw new Error("Debit and credit amounts must be non-negative.");
    if (d > 0 && c > 0) throw new Error("A line cannot have both debit and credit.");
    totalDebit += d;
    totalCredit += c;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.02) {
    throw new Error(
      `Journal entry is out of balance: Debits (${totalDebit.toFixed(2)}) != Credits (${totalCredit.toFixed(2)})`
    );
  }

  const entryNumber = nextSequenceNumber(params.company_id, "journal_entries", "entry_number", "JE");
  const res = db
    .prepare(`
      INSERT INTO journal_entries (company_id, entry_number, entry_date, reference, description, source_type, source_id, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)
    `)
    .run(
      params.company_id,
      entryNumber,
      params.entry_date,
      params.reference ?? "",
      params.description,
      params.source_type ?? "MANUAL",
      params.source_id ?? null,
      params.created_by ?? null
    );

  const jeId = Number(res.lastInsertRowid);
  const insLine = db.prepare(`
    INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, exchange_rate, foreign_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of validLines) {
    const d = Number(Number(line.debit || 0).toFixed(2));
    const c = Number(Number(line.credit || 0).toFixed(2));
    insLine.run(
      jeId,
      line.account_id,
      line.description ?? params.description,
      d,
      c,
      line.currency_code ?? params.currency_code ?? "ETB",
      line.exchange_rate ?? 1,
      line.foreign_amount ?? (d || c)
    );
  }

  return jeId;
}

/**
 * Ethiopian Proclamation No. 979/2016 Progressive Employment Income Tax (ETB)
 * For non-ETB companies, uses a clean regional default (0% in GCC/UAE or configurable)
 */
export function calculateIncomeTax(taxableIncome: number, taxRegime: string): number {
  if (taxRegime === "UAE_VAT" || taxRegime === "SA_VAT" || taxRegime === "EXEMPT") {
    return 0; // No personal income tax in UAE / Saudi Arabia
  }
  if (taxRegime === "SO_CUSTOM") {
    // Somalia simplified employment tax (0% <= 200, 6% 201-500, 12% 501-1000, 18% >1000)
    if (taxableIncome <= 200) return 0;
    if (taxableIncome <= 500) return (taxableIncome - 200) * 0.06;
    if (taxableIncome <= 1000) return 18 + (taxableIncome - 500) * 0.12;
    return 78 + (taxableIncome - 1000) * 0.18;
  }
  // Default: Ethiopian progressive brackets (ETB)
  if (taxableIncome <= 600) return 0;
  if (taxableIncome <= 1650) return taxableIncome * 0.1 - 60;
  if (taxableIncome <= 3200) return taxableIncome * 0.15 - 142.5;
  if (taxableIncome <= 5250) return taxableIncome * 0.2 - 302.5;
  if (taxableIncome <= 7800) return taxableIncome * 0.25 - 565;
  if (taxableIncome <= 10900) return taxableIncome * 0.3 - 955;
  return taxableIncome * 0.35 - 1500;
}

export interface AccountBalanceRow {
  id: number;
  code: string;
  name: string;
  name_am: string | null;
  name_om: string | null;
  name_so: string | null;
  name_ar: string | null;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  subtype: string;
  normal_balance: "DEBIT" | "CREDIT";
  total_debit: number;
  total_credit: number;
  balance: number; // positive in normal direction
}

export function getAccountBalances(companyId: number, asOfDate?: string): AccountBalanceRow[] {
  const db = getDb();
  const dateClause = asOfDate ? "AND je.entry_date <= ?" : "";
  const params = asOfDate ? [companyId, asOfDate] : [companyId];

  const rows = db
    .prepare(`
      SELECT
        a.id, a.code, a.name, a.name_am, a.name_om, a.name_so, a.name_ar,
        a.type, a.subtype, a.normal_balance,
        COALESCE(SUM(CASE WHEN je.status = 'POSTED' ${dateClause} THEN jl.debit ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN je.status = 'POSTED' ${dateClause} THEN jl.credit ELSE 0 END), 0) AS total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.company_id = a.company_id
      WHERE a.company_id = ? AND a.active = 1
      GROUP BY a.id
      ORDER BY a.code ASC
    `)
    .all(...(asOfDate ? [asOfDate, asOfDate, companyId] : [companyId])) as Array<
      Omit<AccountBalanceRow, "balance">
    >;

  void params;
  return rows.map((r) => {
    const td = Number(r.total_debit || 0);
    const tc = Number(r.total_credit || 0);
    const balance = r.normal_balance === "DEBIT" ? td - tc : tc - td;
    return {
      ...r,
      total_debit: Number(td.toFixed(2)),
      total_credit: Number(tc.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    };
  });
}

export function computeFinancialStatements(companyId: number, asOfDate?: string) {
  const balances = getAccountBalances(companyId, asOfDate);

  // Trial Balance
  const trialBalance = balances.map((b) => {
    const net = b.total_debit - b.total_credit;
    return {
      ...b,
      debit_balance: net > 0 ? Number(net.toFixed(2)) : 0,
      credit_balance: net < 0 ? Number(Math.abs(net).toFixed(2)) : 0,
    };
  });
  const totalTrialDebits = Number(trialBalance.reduce((s, r) => s + r.debit_balance, 0).toFixed(2));
  const totalTrialCredits = Number(trialBalance.reduce((s, r) => s + r.credit_balance, 0).toFixed(2));

  // Profit & Loss
  const revenues = balances.filter((b) => b.type === "REVENUE");
  const cogs = balances.filter((b) => b.type === "EXPENSE" && b.subtype === "COGS");
  const operatingExpenses = balances.filter((b) => b.type === "EXPENSE" && b.subtype !== "COGS");

  const totalRevenue = Number(revenues.reduce((s, r) => s + r.balance, 0).toFixed(2));
  const totalCogs = Number(cogs.reduce((s, r) => s + r.balance, 0).toFixed(2));
  const grossProfit = Number((totalRevenue - totalCogs).toFixed(2));
  const totalOperatingExpenses = Number(operatingExpenses.reduce((s, r) => s + r.balance, 0).toFixed(2));
  const totalExpenses = Number((totalCogs + totalOperatingExpenses).toFixed(2));
  const netIncome = Number((totalRevenue - totalExpenses).toFixed(2));

  // Balance Sheet
  const assets = balances.filter((b) => b.type === "ASSET");
  const liabilities = balances.filter((b) => b.type === "LIABILITY");
  const equity = balances.filter((b) => b.type === "EQUITY");

  const totalAssets = Number(assets.reduce((s, r) => s + r.balance, 0).toFixed(2));
  const totalLiabilities = Number(liabilities.reduce((s, r) => s + r.balance, 0).toFixed(2));
  const totalEquityAccounts = Number(equity.reduce((s, r) => s + r.balance, 0).toFixed(2));
  const totalEquityWithIncome = Number((totalEquityAccounts + netIncome).toFixed(2));
  const totalLiabilitiesAndEquity = Number((totalLiabilities + totalEquityWithIncome).toFixed(2));

  // Tax Summary from GL
  const findBal = (code: string) => balances.find((b) => b.code === code)?.balance ?? 0;
  const vatOutput = findBal("2100");
  const vatInput = findBal("1300");
  const netVatPayable = Number((vatOutput - vatInput).toFixed(2));
  const whtPayable = findBal("2110");
  const whtReceivable = findBal("1310");
  const payePayable = findBal("2200");
  const pensionPayable = findBal("2210");

  return {
    trialBalance: {
      rows: trialBalance,
      totalDebits: totalTrialDebits,
      totalCredits: totalTrialCredits,
      balanced: Math.abs(totalTrialDebits - totalTrialCredits) < 0.05,
    },
    profitAndLoss: {
      revenues,
      cogs,
      operatingExpenses,
      totalRevenue,
      totalCogs,
      grossProfit,
      totalOperatingExpenses,
      totalExpenses,
      netIncome,
    },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      currentPeriodEarnings: netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity: totalEquityWithIncome,
      totalLiabilitiesAndEquity,
      balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.05,
    },
    taxSummary: {
      vatOutput,
      vatInput,
      netVatPayable,
      whtPayable,
      whtReceivable,
      payePayable,
      pensionPayable,
    },
  };
}
