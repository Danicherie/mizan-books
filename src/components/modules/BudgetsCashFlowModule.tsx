"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Save, TrendingUp, ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { localizedAccountName } from "@/lib/i18n";
import { useApp } from "../AppContext";
import { Card, KpiCard, PageHeader, StatusBadge } from "../ui";

interface BudgetRow {
  id: number;
  code: string;
  name: string;
  name_am: string | null;
  name_om: string | null;
  name_so: string | null;
  name_ar: string | null;
  type: "REVENUE" | "EXPENSE";
  budget_amount: number;
  month_actual: number;
  ytd_actual: number;
  variance: number;
  notes: string;
}

interface ForecastBucket {
  label: string;
  days: number;
  inflows: number;
  outflows: number;
  netChange: number;
  endingCash: number;
}

export function BudgetsCashFlowModule() {
  const { activeCompany, lang, t, formatAmt, canWrite, showToast } = useApp();
  const [subTab, setSubTab] = useState<"budgets" | "cashflow">("budgets");
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [cashFlow, setCashFlow] = useState<{
    currentCash: number;
    monthlyPayroll: number;
    forecast: ForecastBucket[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const res = await fetch(`/api/budgets?companyId=${activeCompany.id}&month=${periodMonth}`, { cache: "no-store" });
    const data = (await res.json()) as {
      budgetRows: BudgetRow[];
      cashFlow: { currentCash: number; monthlyPayroll: number; forecast: ForecastBucket[] };
    };
    setRows(data.budgetRows || []);
    setCashFlow(data.cashFlow || null);
    const map: Record<number, string> = {};
    for (const r of data.budgetRows || []) {
      map[r.id] = String(r.budget_amount);
    }
    setEdits(map);
    setLoading(false);
  }, [activeCompany, periodMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveBudgets() {
    if (!activeCompany) return;
    const items = rows.map((r) => ({
      account_id: r.id,
      budget_amount: parseFloat(edits[r.id] ?? String(r.budget_amount)) || 0,
      notes: r.notes,
    }));
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompany.id, periodMonth, items }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    void load();
  }

  const totalInflows = (cashFlow?.forecast || []).reduce((s, b) => s + b.inflows, 0);
  const totalOutflows = (cashFlow?.forecast || []).reduce((s, b) => s + b.outflows, 0);
  const finalProjectedCash = cashFlow?.forecast?.[cashFlow.forecast.length - 1]?.endingCash ?? cashFlow?.currentCash ?? 0;

  return (
    <div>
      <PageHeader
        title={t.extras.budgetTitle}
        subtitle={t.extras.budgetSubtitle}
        actions={
          <>
            <input
              type="month"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium"
            />
            {subTab === "budgets" && canWrite && (
              <button
                type="button"
                onClick={() => void handleSaveBudgets()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{t.extras.saveBudgets}</span>
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setSubTab("budgets")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
            subTab === "budgets" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t.extras.budgetsTab}
        </button>
        <button
          type="button"
          onClick={() => setSubTab("cashflow")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
            subTab === "cashflow" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t.extras.cashFlowTab}
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">{t.common.loading}</div>
      ) : subTab === "budgets" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-start">{t.coa.accountName}</th>
                  <th className="px-4 py-3 text-start">{t.coa.type}</th>
                  <th className="px-4 py-3 text-end">{t.extras.budgeted}</th>
                  <th className="px-4 py-3 text-end">{t.extras.actual} ({periodMonth})</th>
                  <th className="px-4 py-3 text-end">{t.extras.variance}</th>
                  <th className="px-4 py-3 text-start w-44">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const bud = parseFloat(edits[r.id] ?? String(r.budget_amount)) || 0;
                  const pct = bud > 0 ? Math.min(150, Math.round((r.month_actual / bud) * 100)) : 0;
                  const overBudget = r.type === "EXPENSE" && bud > 0 && r.month_actual > bud;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-400 me-2">{r.code}</span>
                        <span className="font-semibold text-slate-900">{localizedAccountName(r, lang)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={r.type}
                          label={r.type === "REVENUE" ? t.coa.revenue : t.coa.expense}
                        />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <input
                          type="number"
                          step="100"
                          disabled={!canWrite}
                          value={edits[r.id] ?? r.budget_amount}
                          onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })}
                          className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 text-end tabular-nums text-sm disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatAmt(r.month_actual)}</td>
                      <td
                        className={`px-4 py-3 text-end font-bold tabular-nums ${
                          overBudget ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {formatAmt(bud - r.month_actual)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              style={{ width: `${Math.min(100, pct)}%` }}
                              className={`h-full rounded-full ${overBudget ? "bg-rose-500" : "bg-emerald-500"}`}
                            />
                          </div>
                          <span className="text-xs font-mono text-slate-600 w-10 text-end">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        cashFlow && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label={t.dashboard.cashBalance}
                value={formatAmt(cashFlow.currentCash)}
                icon={<Landmark className="w-5 h-5" />}
                tone="slate"
              />
              <KpiCard
                label={t.extras.projectedInflows}
                value={formatAmt(totalInflows)}
                icon={<ArrowDownLeft className="w-5 h-5" />}
                tone="emerald"
              />
              <KpiCard
                label={t.extras.projectedOutflows}
                value={formatAmt(totalOutflows)}
                subtext={`${t.journal.autoPayroll}: ${formatAmt(cashFlow.monthlyPayroll)}/mo`}
                icon={<ArrowUpRight className="w-5 h-5" />}
                tone="rose"
              />
              <KpiCard
                label={t.extras.projectedNetCash}
                value={formatAmt(finalProjectedCash)}
                icon={<TrendingUp className="w-5 h-5" />}
                tone={finalProjectedCash >= 0 ? "emerald" : "rose"}
              />
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3 text-start">{t.dashboard.month}</th>
                      <th className="px-5 py-3 text-end">{t.extras.projectedInflows}</th>
                      <th className="px-5 py-3 text-end">{t.extras.projectedOutflows}</th>
                      <th className="px-5 py-3 text-end">{t.extras.variance}</th>
                      <th className="px-5 py-3 text-end">{t.extras.projectedNetCash}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashFlow.forecast.map((b) => (
                      <tr key={b.days} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4 font-bold text-slate-900">{b.label}</td>
                        <td className="px-5 py-4 text-end font-semibold text-emerald-700 tabular-nums">
                          +{formatAmt(b.inflows)}
                        </td>
                        <td className="px-5 py-4 text-end font-semibold text-rose-700 tabular-nums">
                          -{formatAmt(b.outflows)}
                        </td>
                        <td
                          className={`px-5 py-4 text-end font-bold tabular-nums ${
                            b.netChange >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {b.netChange >= 0 ? "+" : ""}
                          {formatAmt(b.netChange)}
                        </td>
                        <td className="px-5 py-4 text-end font-extrabold text-slate-900 tabular-nums">
                          {formatAmt(b.endingCash)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
