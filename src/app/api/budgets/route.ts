import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountBalances } from "@/lib/accounting";
import { requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const periodMonth = searchParams.get("month") || new Date().toISOString().slice(0, 7);
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

  // Actuals for selected month (plus YTD fallback summary)
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
        ? act.m_debit - act.m_credit
        : act.m_credit - act.m_debit
      : 0;
    const totalActual = act
      ? a.normal_balance === "DEBIT"
        ? act.total_debit - act.total_credit
        : act.total_credit - act.total_debit
      : 0;
    const budgeted = Number(b?.budget_amount ?? 0);
    return {
      ...a,
      budget_amount: budgeted,
      month_actual: Number(monthActual.toFixed(2)),
      ytd_actual: Number(totalActual.toFixed(2)),
      variance: Number((budgeted - monthActual).toFixed(2)),
      notes: b?.notes ?? "",
    };
  });

  // Cash Flow Forecast (Next 30, 60, 90 Days)
  const balances = getAccountBalances(companyId);
  const currentCash = Number(
    balances
      .filter((b) => b.subtype === "CASH" || b.subtype === "BANK")
      .reduce((s, b) => s + b.balance, 0)
      .toFixed(2)
  );

  const openInvoices = db
    .prepare(`
      SELECT id, invoice_number, due_date, (total - amount_paid) * exchange_rate AS base_due
      FROM invoices
      WHERE company_id = ? AND status IN ('SENT', 'PARTIAL', 'OVERDUE')
    `)
    .all(companyId) as Array<{ id: number; invoice_number: string; due_date: string; base_due: number }>;

  const openBills = db
    .prepare(`
      SELECT id, bill_number, due_date, (total - amount_paid) * exchange_rate AS base_due
      FROM bills
      WHERE company_id = ? AND status IN ('OPEN', 'PARTIAL', 'OVERDUE')
    `)
    .all(companyId) as Array<{ id: number; bill_number: string; due_date: string; base_due: number }>;

  const monthlyPayroll = (
    db
      .prepare("SELECT COALESCE(SUM(base_salary + transport_allowance + housing_allowance), 0) AS m FROM employees WHERE company_id = ? AND active = 1")
      .get(companyId) as { m: number }
  ).m;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const buckets = [30, 60, 90].map((horizon, idx) => {
    const prevHorizon = idx === 0 ? -9999 : [30, 60, 90][idx - 1];
    const inflows = openInvoices
      .filter((i) => {
        const diffDays = Math.ceil((new Date(i.due_date).getTime() - now) / dayMs);
        return diffDays > prevHorizon && diffDays <= horizon;
      })
      .reduce((s, i) => s + Number(i.base_due || 0), 0);

    const apOutflows = openBills
      .filter((b) => {
        const diffDays = Math.ceil((new Date(b.due_date).getTime() - now) / dayMs);
        return diffDays > prevHorizon && diffDays <= horizon;
      })
      .reduce((s, b) => s + Number(b.base_due || 0), 0);

    const outflows = apOutflows + Number(monthlyPayroll || 0);
    return {
      label: `${horizon} Days`,
      days: horizon,
      inflows: Number(inflows.toFixed(2)),
      outflows: Number(outflows.toFixed(2)),
      netChange: Number((inflows - outflows).toFixed(2)),
    };
  });

  let runningCash = currentCash;
  const forecast = buckets.map((b) => {
    runningCash = Number((runningCash + b.netChange).toFixed(2));
    return { ...b, endingCash: runningCash };
  });

  return NextResponse.json({
    periodMonth,
    budgetRows,
    cashFlow: {
      currentCash,
      monthlyPayroll: Number(monthlyPayroll.toFixed(2)),
      forecast,
    },
  });
}

export async function POST(request: Request) {
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
    const db = getDb();

    const stmt = db.prepare(`
      INSERT INTO budgets (company_id, account_id, period_month, budget_amount, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(company_id, account_id, period_month)
      DO UPDATE SET budget_amount = excluded.budget_amount, notes = excluded.notes
    `);

    for (const it of body.items || []) {
      stmt.run(companyId, it.account_id, body.periodMonth, Number(it.budget_amount || 0), it.notes || "");
    }
    logAudit(companyId, auth.user.id, "SAVE_BUDGETS", "BUDGET", null, `Updated budgets for ${body.periodMonth}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
