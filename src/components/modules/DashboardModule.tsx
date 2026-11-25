"use client";

import React, { useEffect, useState } from "react";
import {
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  FilePlus2,
  BookOpen,
  Users,
  AlertTriangle,
  CheckCircle2,
  Package,
} from "lucide-react";
import { formatMonth } from "@/lib/calendar";
import { useApp } from "../AppContext";
import { Card, KpiCard, PageHeader, StatusBadge } from "../ui";

interface DashboardData {
  kpis: {
    cashBalance: number;
    accountsReceivable: number;
    accountsPayable: number;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    netVatPayable: number;
    lowStockCount: number;
  };
  monthlySeries: Array<{ month: string; revenue: number; expenses: number }>;
  recentJournals: Array<{
    id: number;
    entry_number: string;
    entry_date: string;
    reference: string;
    description: string;
    source_type: string;
    status: string;
    total_amount: number;
  }>;
  openInvoices: Array<{
    id: number;
    invoice_number: string;
    customer_name: string;
    due_date: string;
    currency_code: string;
    total: number;
    amount_paid: number;
    status: string;
  }>;
  lowStockItems: Array<{
    id: number;
    sku: string;
    name: string;
    quantity_on_hand: number;
    reorder_level: number;
    unit: string;
  }>;
}

export function DashboardModule() {
  const { activeCompany, lang, calendar, t, formatAmt, formatDt, setActiveTab } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard?companyId=${activeCompany.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompany]);

  if (loading || !data) {
    return <div className="py-16 text-center text-sm text-slate-500">{t.common.loading}</div>;
  }

  const maxBar = Math.max(
    1,
    ...data.monthlySeries.flatMap((m) => [Math.max(0, m.revenue), Math.max(0, m.expenses)])
  );

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PAID: t.common.paid,
      PARTIAL: t.common.partial,
      SENT: t.common.sent,
      OPEN: t.common.open,
      OVERDUE: t.common.overdue,
      POSTED: t.common.posted,
    };
    return map[s] || s;
  };

  return (
    <div>
      <PageHeader
        title={t.dashboard.title}
        subtitle={`${activeCompany?.name ?? ""} · ${t.dashboard.subtitle}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>{t.dashboard.newInvoice}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bills")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>{t.dashboard.newBill}</span>
            </button>
          </>
        }
      />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label={t.dashboard.cashBalance}
          value={formatAmt(data.kpis.cashBalance)}
          subtext={`${activeCompany?.base_currency} · 1000 & 1010`}
          icon={<Landmark className="w-5 h-5" />}
          tone="emerald"
        />
        <KpiCard
          label={t.dashboard.accountsReceivable}
          value={formatAmt(data.kpis.accountsReceivable)}
          subtext={`${data.openInvoices.length} ${t.common.open}`}
          icon={<ArrowDownLeft className="w-5 h-5" />}
          tone="blue"
        />
        <KpiCard
          label={t.dashboard.accountsPayable}
          value={formatAmt(data.kpis.accountsPayable)}
          subtext={`${t.dashboard.vatPayable}: ${formatAmt(data.kpis.netVatPayable, undefined, true)}`}
          icon={<ArrowUpRight className="w-5 h-5" />}
          tone="amber"
        />
        <KpiCard
          label={t.dashboard.netIncome}
          value={formatAmt(data.kpis.netIncome)}
          subtext={`${t.dashboard.revenue}: ${formatAmt(data.kpis.totalRevenue, undefined, true)}`}
          icon={<TrendingUp className="w-5 h-5" />}
          tone={data.kpis.netIncome >= 0 ? "emerald" : "rose"}
        />
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Revenue vs Expenses Chart */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">{t.dashboard.revenueVsExpenses}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.dashboard.totalRevenue}: <span className="font-semibold text-emerald-700 tabular-nums">{formatAmt(data.kpis.totalRevenue)}</span> ·{" "}
                {t.dashboard.totalExpenses}: <span className="font-semibold text-rose-700 tabular-nums">{formatAmt(data.kpis.totalExpenses)}</span>
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                {t.dashboard.revenue}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-800 inline-block" />
                {t.dashboard.expenses}
              </span>
            </div>
          </div>

          {data.monthlySeries.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-slate-400">{t.common.noData}</div>
          ) : (
            <div className="h-56 flex items-end justify-around gap-3 pt-4 pb-2 border-b border-slate-200">
              {data.monthlySeries.map((m) => {
                const revH = Math.max(4, Math.round((Math.max(0, m.revenue) / maxBar) * 180));
                const expH = Math.max(4, Math.round((Math.max(0, m.expenses) / maxBar) * 180));
                return (
                  <div key={m.month} className="flex flex-col items-center flex-1 max-w-[110px]">
                    <div className="flex items-end gap-1.5 h-[184px]">
                      <div className="group relative flex flex-col items-center">
                        <div
                          style={{ height: `${revH}px` }}
                          className="w-7 sm:w-9 rounded-t-md bg-emerald-500 hover:bg-emerald-600 transition-all"
                          title={`${t.dashboard.revenue}: ${formatAmt(m.revenue)}`}
                        />
                      </div>
                      <div className="group relative flex flex-col items-center">
                        <div
                          style={{ height: `${expH}px` }}
                          className="w-7 sm:w-9 rounded-t-md bg-slate-800 hover:bg-slate-900 transition-all"
                          title={`${t.dashboard.expenses}: ${formatAmt(m.expenses)}`}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-600 mt-2 tabular-nums text-center">
                      {formatMonth(m.month, calendar, lang)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Quick Actions & Low Stock */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">{t.dashboard.quickActions}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab("invoices")}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors text-start cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-slate-800">{t.dashboard.newInvoice}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("bills")}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors text-start cursor-pointer"
              >
                <Receipt className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-800">{t.dashboard.newBill}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("journals")}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors text-start cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-semibold text-slate-800">{t.dashboard.newJournalEntry}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("payroll")}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors text-start cursor-pointer"
              >
                <Users className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-slate-800">{t.dashboard.runPayroll}</span>
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                <span>{t.dashboard.inventoryAlerts}</span>
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {data.lowStockItems.length}
              </span>
            </div>
            {data.lowStockItems.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-3 rounded-lg">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.dashboard.allHealthy}</span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.lowStockItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-rose-50/70 border border-rose-100 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{it.name}</div>
                      <div className="text-slate-500">{it.sku}</div>
                    </div>
                    <div className="text-end shrink-0 ms-2">
                      <span className="inline-flex items-center gap-1 font-bold text-rose-700 tabular-nums">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {it.quantity_on_hand} / {it.reorder_level} {it.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Bottom Split: Open Invoices + Recent GL */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">{t.dashboard.overdueInvoices}</h2>
            <button
              type="button"
              onClick={() => setActiveTab("invoices")}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              {t.common.view}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.sales.invoiceNumber}</th>
                  <th className="px-4 py-2.5 text-start">{t.sales.customer}</th>
                  <th className="px-4 py-2.5 text-start">{t.common.dueDate}</th>
                  <th className="px-4 py-2.5 text-end">{t.sales.balanceDue}</th>
                  <th className="px-4 py-2.5 text-center">{t.common.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.openInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {t.common.noData}
                    </td>
                  </tr>
                ) : (
                  data.openInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-700 truncate max-w-[160px]">{inv.customer_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDt(inv.due_date)}</td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums">
                        {formatAmt(inv.total - inv.amount_paid, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={inv.status} label={statusLabel(inv.status)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">{t.dashboard.recentTransactions}</h2>
            <button
              type="button"
              onClick={() => setActiveTab("journals")}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              {t.common.view}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.journal.entryNumber}</th>
                  <th className="px-4 py-2.5 text-start">{t.common.date}</th>
                  <th className="px-4 py-2.5 text-start">{t.common.description}</th>
                  <th className="px-4 py-2.5 text-end">{t.common.amount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentJournals.map((je) => (
                  <tr key={je.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-emerald-800">{je.entry_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDt(je.entry_date)}</td>
                    <td className="px-4 py-3 text-slate-700 truncate max-w-[200px]">{je.description}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums whitespace-nowrap">
                      {formatAmt(je.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
