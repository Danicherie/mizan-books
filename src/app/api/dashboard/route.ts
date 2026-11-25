import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeFinancialStatements, getAccountBalances } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, resolveScopedCompanyId } from "@/lib/api-helpers";
import { fromMinor, INVOICE_MONEY_FIELDS, INVENTORY_MONEY_FIELDS, minorFromSql, withMajorMoney } from "@/lib/money";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const company = getCompanyRecord(companyId);
  const db = getDb();

  const balances = getAccountBalances(companyId);
  const statements = computeFinancialStatements(companyId);

  const cashBalance = balances
    .filter((b) => b.subtype === "CASH" || b.subtype === "BANK")
    .reduce((s, b) => s + b.balance, 0);
  const arBalance = balances.filter((b) => b.subtype === "AR").reduce((s, b) => s + b.balance, 0);
  const apBalance = balances.filter((b) => b.subtype === "AP").reduce((s, b) => s + b.balance, 0);

  // Monthly revenue vs expense from posted journal entries
  const monthlyRows = db
    .prepare(`
      SELECT
        substr(je.entry_date, 1, 7) AS month,
        SUM(CASE WHEN a.type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END) AS revenue,
        SUM(CASE WHEN a.type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END) AS expenses
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id AND a.company_id = je.company_id
      WHERE je.company_id = ? AND je.status = 'POSTED'
      GROUP BY substr(je.entry_date, 1, 7)
      ORDER BY month ASC
      LIMIT 12
    `)
    .all(companyId) as Array<{ month: string; revenue: number; expenses: number }>;
  const monthlySeries = monthlyRows.map((row) => ({
    month: row.month,
    revenue: fromMinor(minorFromSql(row.revenue)),
    expenses: fromMinor(minorFromSql(row.expenses)),
  }));

  const recentJournals = db
    .prepare(`
      SELECT
        je.id, je.entry_number, je.entry_date, je.reference, je.description, je.source_type, je.status,
        COALESCE(SUM(jl.debit), 0) AS total_amount
      FROM journal_entries je
      LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.company_id = ?
      GROUP BY je.id
      ORDER BY je.entry_date DESC, je.id DESC
      LIMIT 8
    `)
    .all(companyId) as Array<Record<string, unknown>>;
  const recent = recentJournals.map((row) => withMajorMoney(row, ["total_amount"]));

  const openInvoices = db
    .prepare(`
      SELECT i.*, c.name AS customer_name
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.company_id = ? AND i.status IN ('SENT', 'PARTIAL', 'OVERDUE')
      ORDER BY i.due_date ASC
      LIMIT 6
    `)
    .all(companyId) as Array<Record<string, unknown>>;
  const open = openInvoices.map((row) => withMajorMoney(row, INVOICE_MONEY_FIELDS));

  const lowStockItems = db
    .prepare(`
      SELECT *
      FROM inventory_items
      WHERE company_id = ? AND item_type = 'PRODUCT' AND quantity_on_hand <= reorder_level AND active = 1
      ORDER BY quantity_on_hand ASC
    `)
    .all(companyId) as Array<Record<string, unknown>>;
  const lowStock = lowStockItems.map((row) => withMajorMoney(row, INVENTORY_MONEY_FIELDS));

  return NextResponse.json({
    company,
    kpis: {
      cashBalance: Number(cashBalance.toFixed(2)),
      accountsReceivable: Number(arBalance.toFixed(2)),
      accountsPayable: Number(apBalance.toFixed(2)),
      totalRevenue: statements.profitAndLoss.totalRevenue,
      totalExpenses: statements.profitAndLoss.totalExpenses,
      netIncome: statements.profitAndLoss.netIncome,
      netVatPayable: statements.taxSummary.netVatPayable,
      lowStockCount: lowStockItems.length,
    },
    monthlySeries,
    recentJournals: recent,
    openInvoices: open,
    lowStockItems: lowStock,
  });
}
