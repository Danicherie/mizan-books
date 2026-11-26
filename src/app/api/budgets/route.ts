import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountBalances } from "@/lib/accounting";
import { guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { fromMinor, minorFromSql, mulMinor, toMinor } from "@/lib/money";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const requestedMonth = searchParams.get("month") || "";
  const periodMonth = MONTH_RE.test(requestedMonth) ? requestedMonth : new Date().toISOString().slice(0, 7);
  const db = getDb();

  // Accounts eligible for budgeting (Revenue & Expense)
  const accounts = db
    .prepare(`
      SELECT id, code, name, name_am, name_om, name_so, name_ar, type, normal_balance
      FROM accounts
      WHERE company_id = ? AND type IN ('REVENUE', 'EXPENSE') AND active = 1
      ORDER BY code ASC
    `)
    .all(companyId) as Array<{
    id: number;
    code: string;
    name: string;
    name_am: string | null;
    name_om: string | null;
    name_so: string | null;
    name_ar: string | null;
    type: string;
    normal_balance: string;
  }>;

  const savedBudgets = db
    .prepare("SELECT account_id, budget_amount, notes FROM budgets WHERE company_id = ? AND period_month = ?")
    .all(companyId, periodMonth) as Array<{ account_id: number; budget_amount: number; notes: string }>;
  const budgetMap = new Map(savedBudgets.map((b) => [b.account_id, b]));

  // Actuals for the selected month, plus everything posted so far
  const actualRows = db
    .prepare(`
      SELECT
        jl.account_id,
        COALESCE(SUM(CASE WHEN substr(je.entry_date, 1, 7) = ? THEN jl.debit ELSE 0 END), 0) AS m_debit,
        COALESCE(SUM(CASE WHEN substr(je.entry_date, 1, 7) = ? THEN jl.credit ELSE 0 END), 0) AS m_credit,
        COALESCE(SUM(jl.debit), 0) AS total_debit,
        COALESCE(SUM(jl.credit), 0) AS total_credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.company_id = ? AND je.status = 'POSTED'
      GROUP BY jl.account_id
    `)
    .all(periodMonth, periodMonth, companyId) as Array<{
    account_id: number;
    m_debit: number;
    m_credit: number;
    total_debit: number;
    total_credit: number;
  }>;
  const actualMap = new Map(actualRows.map((r) => [r.account_id, r]));

  const budgetRows = accounts.map((a) => {
    const b = budgetMap.get(a.id);
    const act = actualMap.get(a.id);
    const monthActual = act
      ? a.normal_balance === "DEBIT"
        ? minorFromSql(act.m_debit) - minorFromSql(act.m_credit)
        : minorFromSql(act.m_credit) - minorFromSql(act.m_debit)
      : 0;
    const totalActual = act
      ? a.normal_balance === "DEBIT"
        ? minorFromSql(act.total_debit) - minorFromSql(act.total_credit)
        : minorFromSql(act.total_credit) - minorFromSql(act.total_debit)
      : 0;
    const budgeted = minorFromSql(b?.budget_amount ?? 0);
    return {
      ...a,
      budget_amount: fromMinor(budgeted),
      month_actual: fromMinor(monthActual),
      ytd_actual: fromMinor(totalActual),
      variance: fromMinor(budgeted - monthActual),
      notes: b?.notes ?? "",
    };
  });

  // Cash flow forecast (next 30, 60, 90 days), all in whole minor units
  const balances = getAccountBalances(companyId);
  const currentCashMinor = balances
    .filter((b) => b.subtype === "CASH" || b.subtype === "BANK")
    .reduce((s, b) => s + toMinor(b.balance), 0);

  const openInvoices = db
    .prepare(`
      SELECT id, invoice_number, due_date, total, amount_paid, exchange_rate
      FROM invoices
      WHERE company_id = ? AND status IN ('SENT', 'PARTIAL', 'OVERDUE')
    `)
    .all(companyId) as Array<{
    id: number;
    invoice_number: string;
    due_date: string;
    total: number;
    amount_paid: number;
    exchange_rate: number;
  }>;

  const openBills = db
    .prepare(`
      SELECT id, bill_number, due_date, total, amount_paid, exchange_rate
      FROM bills
      WHERE company_id = ? AND status IN ('OPEN', 'PARTIAL', 'OVERDUE')
    `)
    .all(companyId) as Array<{
    id: number;
    bill_number: string;
    due_date: string;
    total: number;
    amount_paid: number;
    exchange_rate: number;
  }>;

  const baseDue = (row: { total: number; amount_paid: number; exchange_rate: number }) =>
    mulMinor(minorFromSql(row.total) - minorFromSql(row.amount_paid), row.exchange_rate);

  const monthlyPayrollMinor = minorFromSql(
    (
      db
        .prepare("SELECT COALESCE(SUM(base_salary + transport_allowance + housing_allowance), 0) AS m FROM employees WHERE company_id = ? AND active = 1")
        .get(companyId) as { m: number }
    ).m
  );

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const horizons = [30, 60, 90];

  let runningCash = currentCashMinor;
  const forecast = horizons.map((horizon, idx) => {
    const prevHorizon = idx === 0 ? -9999 : horizons[idx - 1];
    const inRange = (due: string) => {
      const diffDays = Math.ceil((new Date(due).getTime() - now) / dayMs);
      return diffDays > prevHorizon && diffDays <= horizon;
    };
    const inflows = openInvoices.filter((i) => inRange(i.due_date)).reduce((s, i) => s + baseDue(i), 0);
    const apOutflows = openBills.filter((b) => inRange(b.due_date)).reduce((s, b) => s + baseDue(b), 0);
    const outflows = apOutflows + monthlyPayrollMinor;
    const netChange = inflows - outflows;
    runningCash += netChange;
    return {
      label: `${horizon} Days`,
      days: horizon,
      inflows: fromMinor(inflows),
      outflows: fromMinor(outflows),
      netChange: fromMinor(netChange),
      endingCash: fromMinor(runningCash),
    };
  });

  return NextResponse.json({
    periodMonth,
    budgetRows,
    cashFlow: {
      currentCash: fromMinor(currentCashMinor),
      monthlyPayroll: fromMinor(monthlyPayrollMinor),
      forecast,
    },
  });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      periodMonth: string;
      items: Array<{ account_id: number; budget_amount: number; notes?: string }>;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    const db = getDb();

    if (!MONTH_RE.test(String(body.periodMonth))) {
      return NextResponse.json({ error: "Choose a month like 2026-11." }, { status: 400 });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > 500) {
      return NextResponse.json({ error: "Too many budget lines." }, { status: 400 });
    }

    const eligible = new Set(
      (
        db
          .prepare("SELECT id FROM accounts WHERE company_id = ? AND type IN ('REVENUE', 'EXPENSE') AND active = 1")
          .all(companyId) as Array<{ id: number }>
      ).map((r) => r.id)
    );
    const prepared = items.map((it) => {
      const accountId = Number(it.account_id);
      if (!eligible.has(accountId)) throw new Error("A budget line uses an account that is not available.");
      const amount = toMinor(it.budget_amount || 0);
      if (amount < 0) throw new Error("Budget amounts cannot be negative.");
      return { accountId, amount, notes: String(it.notes ?? "").slice(0, 200) };
    });

    const stmt = db.prepare(`
      INSERT INTO budgets (company_id, account_id, period_month, budget_amount, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(company_id, account_id, period_month)
      DO UPDATE SET budget_amount = excluded.budget_amount, notes = excluded.notes
    `);

    db.exec("BEGIN");
    try {
      for (const it of prepared) {
        stmt.run(companyId, it.accountId, body.periodMonth, it.amount, it.notes);
      }
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // keep the original error
      }
      throw err;
    }
    logAudit(companyId, auth.user.id, "SAVE_BUDGETS", "BUDGET", null, `Updated budgets for ${body.periodMonth}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
