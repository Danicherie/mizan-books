"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Printer, CheckCircle2, AlertCircle } from "lucide-react";
import { localizedAccountName } from "@/lib/i18n";
import { useApp } from "../AppContext";
import { Card, CsvButton, exportToCsv, PageHeader } from "../ui";

interface AcctLine {
  id: number;
  code: string;
  name: string;
  name_am: string | null;
  name_om: string | null;
  name_so: string | null;
  name_ar: string | null;
  type: string;
  balance: number;
  debit_balance?: number;
  credit_balance?: number;
}

interface ReportsResponse {
  trialBalance: {
    rows: AcctLine[];
    totalDebits: number;
    totalCredits: number;
    balanced: boolean;
  };
  profitAndLoss: {
    revenues: AcctLine[];
    cogs: AcctLine[];
    operatingExpenses: AcctLine[];
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    totalOperatingExpenses: number;
    totalExpenses: number;
    netIncome: number;
  };
  balanceSheet: {
    assets: AcctLine[];
    liabilities: AcctLine[];
    equity: AcctLine[];
    currentPeriodEarnings: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    balanced: boolean;
  };
  taxSummary: {
    vatOutput: number;
    vatInput: number;
    netVatPayable: number;
    whtPayable: number;
    whtReceivable: number;
    payePayable: number;
    pensionPayable: number;
  };
}

export function ReportsModule() {
  const { activeCompany, lang, t, formatAmt, formatDt } = useApp();
  const [tab, setTab] = useState<"tb" | "pnl" | "bs" | "tax">("tb");
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const qs = new URLSearchParams({ companyId: String(activeCompany.id) });
    if (asOf) qs.set("asOf", asOf);
    const res = await fetch(`/api/reports?${qs.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as ReportsResponse;
    setData(json);
    setLoading(false);
  }, [activeCompany, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = () => {
    if (!data || !activeCompany) return;
    if (tab === "tb") {
      exportToCsv(
        `trial-balance-${activeCompany.name}.csv`,
        [t.coa.code, t.coa.accountName, t.journal.debit, t.journal.credit],
        data.trialBalance.rows.map((r) => [r.code, localizedAccountName(r, lang), r.debit_balance || 0, r.credit_balance || 0])
      );
    } else if (tab === "pnl") {
      const rows: Array<[string, string, number]> = [
        ...data.profitAndLoss.revenues.map((r): [string, string, number] => [r.code, localizedAccountName(r, lang), r.balance]),
        ...data.profitAndLoss.cogs.map((r): [string, string, number] => [r.code, localizedAccountName(r, lang), -r.balance]),
        ...data.profitAndLoss.operatingExpenses.map((r): [string, string, number] => [r.code, localizedAccountName(r, lang), -r.balance]),
        ["", t.reports.netIncome, data.profitAndLoss.netIncome],
      ];
      exportToCsv(`profit-and-loss-${activeCompany.name}.csv`, [t.coa.code, t.coa.accountName, t.common.amount], rows);
    } else if (tab === "bs") {
      const rows: Array<[string, string, string, number]> = [
        ...data.balanceSheet.assets.map((r): [string, string, string, number] => ["ASSET", r.code, localizedAccountName(r, lang), r.balance]),
        ...data.balanceSheet.liabilities.map((r): [string, string, string, number] => ["LIABILITY", r.code, localizedAccountName(r, lang), r.balance]),
        ...data.balanceSheet.equity.map((r): [string, string, string, number] => ["EQUITY", r.code, localizedAccountName(r, lang), r.balance]),
        ["EQUITY", "NET", t.reports.currentPeriodEarnings, data.balanceSheet.currentPeriodEarnings],
      ];
      exportToCsv(`balance-sheet-${activeCompany.name}.csv`, [t.coa.type, t.coa.code, t.coa.accountName, t.common.balance], rows);
    }
  };

  return (
    <div>
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={
          <>
            <div className="flex items-center gap-2 bg-mb-paper border border-mb-line rounded-xl px-3 py-1.5 text-xs">
              <span className="text-mb-ink font-medium">{t.reports.asOf}:</span>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="text-mb-cocoa focus:outline-none"
              />
            </div>
            <CsvButton label={t.common.exportCsv} onClick={handleExport} />
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-mb-cocoa text-mb-cream hover:bg-[#3a2418] cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{t.common.print}</span>
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 no-print">
        {(
          [
            ["tb", t.reports.trialBalance],
            ["pnl", t.reports.profitAndLoss],
            ["bs", t.reports.balanceSheet],
            ["tax", t.reports.taxReport],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              tab === k ? "bg-mb-amber text-mb-cocoa" : "bg-mb-paper border border-mb-line text-mb-ink hover:bg-mb-cream"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="py-16 text-center text-sm text-mb-ink/70">{t.common.loading}</div>
      ) : (
        <Card className="p-6 sm:p-8 print-container">
          {/* Statement Header */}
          <div className="text-center border-b border-mb-line pb-5 mb-6">
            <h2 className="text-xl font-bold text-mb-cocoa">{activeCompany?.name}</h2>
            <p className="text-sm font-semibold text-mb-cocoa mt-1">
              {tab === "tb"
                ? t.reports.trialBalance
                : tab === "pnl"
                ? t.reports.profitAndLoss
                : tab === "bs"
                ? t.reports.balanceSheet
                : t.reports.taxReport}
            </p>
            <p className="text-xs text-mb-ink mt-0.5">
              {t.reports.asOf}: {asOf ? formatDt(asOf) : formatDt(new Date().toISOString().slice(0, 10))} ·{" "}
              {activeCompany?.base_currency}
            </p>
          </div>

          {/* Trial Balance */}
          {tab === "tb" && (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-mb-beige text-xs text-mb-ink uppercase border-y border-mb-line">
                    <tr>
                      <th className="px-4 py-2.5 text-start">{t.coa.code}</th>
                      <th className="px-4 py-2.5 text-start">{t.coa.accountName}</th>
                      <th className="px-4 py-2.5 text-end">{t.journal.debit}</th>
                      <th className="px-4 py-2.5 text-end">{t.journal.credit}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mb-line/70">
                    {data.trialBalance.rows
                      .filter((r) => (r.debit_balance || 0) > 0 || (r.credit_balance || 0) > 0)
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2.5 font-mono text-mb-ink">{r.code}</td>
                          <td className="px-4 py-2.5 font-medium text-mb-cocoa">{localizedAccountName(r, lang)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">
                            {r.debit_balance ? formatAmt(r.debit_balance) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-end tabular-nums">
                            {r.credit_balance ? formatAmt(r.credit_balance) : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="border-t-2 border-mb-cocoa bg-mb-beige font-bold">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-mb-cocoa">
                        {t.common.total}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-mb-cocoa">
                        {formatAmt(data.trialBalance.totalDebits)}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-mb-cocoa">
                        {formatAmt(data.trialBalance.totalCredits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold">
                {data.trialBalance.balanced ? (
                  <span className="inline-flex items-center gap-1.5 text-mb-cocoa bg-mb-cream border border-mb-line px-3 py-1.5 rounded-full">
                    <CheckCircle2 className="w-4 h-4" />
                    {t.journal.balanced}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-full">
                    <AlertCircle className="w-4 h-4" />
                    {t.journal.outOfBalance}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Profit & Loss */}
          {tab === "pnl" && (
            <div className="max-w-3xl mx-auto space-y-6 text-sm">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-mb-cocoa border-b border-mb-line pb-1.5 mb-2">
                  {t.coa.revenue}
                </h3>
                {data.profitAndLoss.revenues.map((r) => (
                  <div key={r.id} className="flex justify-between py-1.5 border-b border-mb-line/70">
                    <span>
                      <span className="font-mono text-xs text-mb-ink/70 me-2">{r.code}</span>
                      {localizedAccountName(r, lang)}
                    </span>
                    <span className="font-medium tabular-nums">{formatAmt(r.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-bold text-mb-cocoa">
                  <span>{t.dashboard.totalRevenue}</span>
                  <span className="tabular-nums">{formatAmt(data.profitAndLoss.totalRevenue)}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 border-b border-amber-200 pb-1.5 mb-2">
                  {t.reports.cogs}
                </h3>
                {data.profitAndLoss.cogs.map((r) => (
                  <div key={r.id} className="flex justify-between py-1.5 border-b border-mb-line/70">
                    <span>
                      <span className="font-mono text-xs text-mb-ink/70 me-2">{r.code}</span>
                      {localizedAccountName(r, lang)}
                    </span>
                    <span className="font-medium tabular-nums">{formatAmt(r.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 px-3 rounded-xl bg-mb-cream font-bold text-mb-cocoa mt-2">
                  <span>{t.reports.grossProfit}</span>
                  <span className="tabular-nums">{formatAmt(data.profitAndLoss.grossProfit)}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 border-b border-rose-200 pb-1.5 mb-2">
                  {t.reports.operatingExpenses}
                </h3>
                {data.profitAndLoss.operatingExpenses
                  .filter((r) => Math.abs(r.balance) > 0)
                  .map((r) => (
                    <div key={r.id} className="flex justify-between py-1.5 border-b border-mb-line/70">
                      <span>
                        <span className="font-mono text-xs text-mb-ink/70 me-2">{r.code}</span>
                        {localizedAccountName(r, lang)}
                      </span>
                      <span className="font-medium tabular-nums">{formatAmt(r.balance)}</span>
                    </div>
                  ))}
                <div className="flex justify-between py-2 font-bold text-mb-cocoa">
                  <span>{t.reports.operatingExpenses}</span>
                  <span className="tabular-nums">{formatAmt(data.profitAndLoss.totalOperatingExpenses)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center p-4 rounded-xl bg-mb-cocoa text-mb-cream text-base font-bold">
                <span>{t.reports.netIncome}</span>
                <span className="tabular-nums text-mb-amber">{formatAmt(data.profitAndLoss.netIncome)}</span>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {tab === "bs" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-sm">
                {/* Assets */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-mb-cocoa border-b-2 border-mb-amber pb-2 mb-3">
                    {t.coa.asset}
                  </h3>
                  {data.balanceSheet.assets.map((r) => (
                    <div key={r.id} className="flex justify-between py-2 border-b border-mb-line/70">
                      <span>
                        <span className="font-mono text-xs text-mb-ink/70 me-2">{r.code}</span>
                        {localizedAccountName(r, lang)}
                      </span>
                      <span className="font-semibold tabular-nums">{formatAmt(r.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 mt-2 border-t-2 border-mb-cocoa font-bold text-base">
                    <span>{t.reports.totalAssets}</span>
                    <span className="tabular-nums">{formatAmt(data.balanceSheet.totalAssets)}</span>
                  </div>
                </div>

                {/* Liabilities & Equity */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 border-b-2 border-rose-500 pb-2 mb-3">
                      {t.coa.liability}
                    </h3>
                    {data.balanceSheet.liabilities.map((r) => (
                      <div key={r.id} className="flex justify-between py-2 border-b border-mb-line/70">
                        <span>
                          <span className="font-mono text-xs text-mb-ink/70 me-2">{r.code}</span>
                          {localizedAccountName(r, lang)}
                        </span>
                        <span className="font-semibold tabular-nums">{formatAmt(r.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-bold text-mb-cocoa">
                      <span>{t.reports.totalLiabilities}</span>
                      <span className="tabular-nums">{formatAmt(data.balanceSheet.totalLiabilities)}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-800 border-b-2 border-indigo-500 pb-2 mb-3">
                      {t.coa.equity}
                    </h3>
                    {data.balanceSheet.equity.map((r) => (
                      <div key={r.id} className="flex justify-between py-2 border-b border-mb-line/70">
                        <span>
                          <span className="font-mono text-xs text-mb-ink/70 me-2">{r.code}</span>
                          {localizedAccountName(r, lang)}
                        </span>
                        <span className="font-semibold tabular-nums">{formatAmt(r.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 border-b border-mb-line/70 text-mb-cocoa font-medium">
                      <span>{t.reports.currentPeriodEarnings}</span>
                      <span className="tabular-nums">{formatAmt(data.balanceSheet.currentPeriodEarnings)}</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold text-mb-cocoa">
                      <span>{t.reports.totalEquity}</span>
                      <span className="tabular-nums">{formatAmt(data.balanceSheet.totalEquity)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between py-3 border-t-2 border-mb-cocoa font-bold text-base">
                    <span>{t.reports.totalLiabilitiesAndEquity}</span>
                    <span className="tabular-nums">{formatAmt(data.balanceSheet.totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>

              {data.balanceSheet.balanced && (
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-mb-cream border border-mb-line text-mb-cocoa text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.reports.balancedCheck}</span>
                </div>
              )}
            </div>
          )}

          {/* Tax Report */}
          {tab === "tax" && (
            <div className="max-w-2xl mx-auto space-y-3 text-sm">
              {[
                [t.payroll.vatOutput, data.taxSummary.vatOutput],
                [t.payroll.vatInput, -data.taxSummary.vatInput],
                [t.payroll.netVatPayable, data.taxSummary.netVatPayable],
                [t.payroll.whtPayable, data.taxSummary.whtPayable],
                [t.payroll.whtReceivable, data.taxSummary.whtReceivable],
                [t.payroll.payePayable, data.taxSummary.payePayable],
                [t.payroll.pensionPayable, data.taxSummary.pensionPayable],
              ].map(([label, val], idx) => (
                <div
                  key={idx}
                  className={`flex justify-between py-3 px-4 rounded-xl border ${
                    idx === 2 ? "bg-mb-cream border-mb-line font-bold text-mb-cocoa" : "bg-mb-paper border-mb-line"
                  }`}
                >
                  <span>{label as string}</span>
                  <span className="tabular-nums font-bold">{formatAmt(val as number)}</span>
                </div>
              ))}
              <p className="text-xs text-mb-ink pt-2">{t.payroll.taxSummaryNote}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
