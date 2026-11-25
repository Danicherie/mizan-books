import { getDb } from "./db";
import { fromMinor, minorFromSql, minorToString, toMinor } from "./money";
export { calculateIncomeTax, computeEmployeePay } from "./payroll-math";

export interface JournalLineInput {
  account_id: number;
  description?: string;
  debit: number;
  credit: number;
  currency_code?: string;
  exchange_rate?: number;
  foreign_amount?: number;
}

const SEQUENCE_TABLES = new Set(["journal_entries", "invoices", "bills"]);

export function nextSequenceNumber(companyId: number, table: "journal_entries" | "invoices" | "bills", column: string, prefix: string): string {
  if (!SEQUENCE_TABLES.has(table)) {
    throw new Error("Invalid sequence table.");
  }
  void column;
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

interface NormalizedLine {
  account_id: number;
  description: string;
  debit: number;
  credit: number;
  currency_code: string;
  exchange_rate: number;
  foreign_amount: number;
}

function assertAccountsBelongToCompany(companyId: number, accountIds: number[]) {
  const unique = [...new Set(accountIds)];
  const db = getDb();
  const placeholders = unique.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT id, company_id FROM accounts WHERE id IN (${placeholders})`)
    .all(...unique) as Array<{ id: number; company_id: number }>;
  const owner = new Map(rows.map((row) => [Number(row.id), Number(row.company_id)]));
  for (const id of unique) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`Account ${String(id)} is not valid.`);
    }
    const accountCompany = owner.get(id);
    if (accountCompany == null) {
      throw new Error(`Account ${id} does not exist.`);
    }
    if (accountCompany !== companyId) {
      throw new Error(
        `Account ${id} belongs to another company. Every journal line must use an account from the same company as the entry.`
      );
    }
  }
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
  const normalized: NormalizedLine[] = [];
  for (const line of params.lines) {
    const debit = toMinor(line.debit || 0);
    const credit = toMinor(line.credit || 0);
    if (debit === 0 && credit === 0) continue;
    if (debit < 0 || credit < 0) throw new Error("Debit and credit amounts must be non-negative.");
    if (debit > 0 && credit > 0) throw new Error("A line cannot have both debit and credit.");
    const foreign =
      line.foreign_amount == null ? debit || credit : toMinor(line.foreign_amount);
    normalized.push({
      account_id: Number(line.account_id),
      description: line.description ?? params.description,
      debit,
      credit,
      currency_code: line.currency_code ?? params.currency_code ?? "ETB",
      exchange_rate: line.exchange_rate ?? 1,
      foreign_amount: foreign,
    });
  }

  if (normalized.length < 2) {
    throw new Error("A journal entry requires at least two non-zero lines.");
  }

  const totalDebit = normalized.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = normalized.reduce((sum, line) => sum + line.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry is out of balance: Debits (${minorToString(totalDebit)}) != Credits (${minorToString(totalCredit)}). Debits and credits must match to the cent.`
    );
  }

  assertAccountsBelongToCompany(
    params.company_id,
    normalized.map((line) => line.account_id)
  );

  const write = () => {
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
    for (const line of normalized) {
      insLine.run(
        jeId,
        line.account_id,
        line.description,
        line.debit,
        line.credit,
        line.currency_code,
        line.exchange_rate,
        line.foreign_amount
      );
    }
    return jeId;
  };

  db.exec("BEGIN");
  try {
    const jeId = write();
    db.exec("COMMIT");
    return jeId;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original error is the one the caller needs.
    }
    throw err;
  }
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

interface RawBalance extends Omit<AccountBalanceRow, "total_debit" | "total_credit" | "balance"> {
  debitMinor: number;
  creditMinor: number;
}

function normalMinor(row: RawBalance): number {
  return row.normal_balance === "DEBIT" ? row.debitMinor - row.creditMinor : row.creditMinor - row.debitMinor;
}

function toPublicBalance(row: RawBalance): AccountBalanceRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_am: row.name_am,
    name_om: row.name_om,
    name_so: row.name_so,
    name_ar: row.name_ar,
    type: row.type,
    subtype: row.subtype,
    normal_balance: row.normal_balance,
    total_debit: fromMinor(row.debitMinor),
    total_credit: fromMinor(row.creditMinor),
    balance: fromMinor(normalMinor(row)),
  };
}

function loadRawBalances(companyId: number, asOfDate?: string): RawBalance[] {
  const db = getDb();
  const dateClause = asOfDate ? "AND je.entry_date <= ?" : "";
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

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    name_am: row.name_am,
    name_om: row.name_om,
    name_so: row.name_so,
    name_ar: row.name_ar,
    type: row.type,
    subtype: row.subtype,
    normal_balance: row.normal_balance,
    debitMinor: minorFromSql(row.total_debit),
    creditMinor: minorFromSql(row.total_credit),
  }));
}

export function getAccountBalances(companyId: number, asOfDate?: string): AccountBalanceRow[] {
  return loadRawBalances(companyId, asOfDate).map(toPublicBalance);
}

function sumNormal(rows: RawBalance[], pred: (row: RawBalance) => boolean): number {
  return rows.filter(pred).reduce((sum, row) => sum + normalMinor(row), 0);
}

export function computeFinancialStatements(companyId: number, asOfDate?: string) {
  const raw = loadRawBalances(companyId, asOfDate);

  let trialDebitMinor = 0;
  let trialCreditMinor = 0;
  const trialBalance = raw.map((row) => {
    const net = row.debitMinor - row.creditMinor;
    const debitMinor = net > 0 ? net : 0;
    const creditMinor = net < 0 ? -net : 0;
    trialDebitMinor += debitMinor;
    trialCreditMinor += creditMinor;
    return {
      ...toPublicBalance(row),
      debit_balance: fromMinor(debitMinor),
      credit_balance: fromMinor(creditMinor),
    };
  });

  const revenues = raw.filter((row) => row.type === "REVENUE").map(toPublicBalance);
  const cogs = raw.filter((row) => row.type === "EXPENSE" && row.subtype === "COGS").map(toPublicBalance);
  const operatingExpenses = raw
    .filter((row) => row.type === "EXPENSE" && row.subtype !== "COGS")
    .map(toPublicBalance);

  const totalRevenueMinor = sumNormal(raw, (row) => row.type === "REVENUE");
  const totalCogsMinor = sumNormal(raw, (row) => row.type === "EXPENSE" && row.subtype === "COGS");
  const totalOperatingMinor = sumNormal(raw, (row) => row.type === "EXPENSE" && row.subtype !== "COGS");
  const totalExpensesMinor = totalCogsMinor + totalOperatingMinor;
  const netIncomeMinor = totalRevenueMinor - totalExpensesMinor;

  const assets = raw.filter((row) => row.type === "ASSET").map(toPublicBalance);
  const liabilities = raw.filter((row) => row.type === "LIABILITY").map(toPublicBalance);
  const equity = raw.filter((row) => row.type === "EQUITY").map(toPublicBalance);
  const totalAssetsMinor = sumNormal(raw, (row) => row.type === "ASSET");
  const totalLiabilitiesMinor = sumNormal(raw, (row) => row.type === "LIABILITY");
  const totalEquityMinor = sumNormal(raw, (row) => row.type === "EQUITY");
  const totalEquityWithIncomeMinor = totalEquityMinor + netIncomeMinor;
  const totalLiabilitiesAndEquityMinor = totalLiabilitiesMinor + totalEquityWithIncomeMinor;

  const findMinor = (code: string) => {
    const row = raw.find((item) => item.code === code);
    return row ? normalMinor(row) : 0;
  };
  const vatOutputMinor = findMinor("2100");
  const vatInputMinor = findMinor("1300");

  return {
    trialBalance: {
      rows: trialBalance,
      totalDebits: fromMinor(trialDebitMinor),
      totalCredits: fromMinor(trialCreditMinor),
      balanced: trialDebitMinor === trialCreditMinor,
    },
    profitAndLoss: {
      revenues,
      cogs,
      operatingExpenses,
      totalRevenue: fromMinor(totalRevenueMinor),
      totalCogs: fromMinor(totalCogsMinor),
      grossProfit: fromMinor(totalRevenueMinor - totalCogsMinor),
      totalOperatingExpenses: fromMinor(totalOperatingMinor),
      totalExpenses: fromMinor(totalExpensesMinor),
      netIncome: fromMinor(netIncomeMinor),
    },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      currentPeriodEarnings: fromMinor(netIncomeMinor),
      totalAssets: fromMinor(totalAssetsMinor),
      totalLiabilities: fromMinor(totalLiabilitiesMinor),
      totalEquity: fromMinor(totalEquityWithIncomeMinor),
      totalLiabilitiesAndEquity: fromMinor(totalLiabilitiesAndEquityMinor),
      balanced: totalAssetsMinor === totalLiabilitiesAndEquityMinor,
    },
    taxSummary: {
      vatOutput: fromMinor(vatOutputMinor),
      vatInput: fromMinor(vatInputMinor),
      netVatPayable: fromMinor(vatOutputMinor - vatInputMinor),
      whtPayable: fromMinor(findMinor("2110")),
      whtReceivable: fromMinor(findMinor("1310")),
      payePayable: fromMinor(findMinor("2200")),
      pensionPayable: fromMinor(findMinor("2210")),
    },
  };
}
