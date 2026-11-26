"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Upload, Sparkles, CheckCircle2, Landmark, FilePlus2, Link2 } from "lucide-react";
import { useApp } from "../AppContext";
import { Card, KpiCard, Modal, PageHeader, StatusBadge } from "../ui";

interface StatementLine {
  id: number;
  statement_date: string;
  description: string;
  reference: string;
  amount: number;
  matched_journal_line_id: number | null;
  status: string;
}

interface GlLine {
  id: number;
  entry_number: string;
  entry_date: string;
  reference: string;
  description: string;
  net_amount: number;
  matched: boolean;
}

interface ReconData {
  bankAccounts: Array<{ id: number; code: string; name: string }>;
  activeAccountId: number;
  statements: StatementLine[];
  glLines: GlLine[];
  summary: {
    bookBalance: number;
    statementNet: number;
    matchedCount: number;
    unmatchedCount: number;
  };
}

export function ReconciliationModule() {
  const { activeCompany, t, formatAmt, formatDt, canWrite, showToast } = useApp();
  const [data, setData] = useState<ReconData | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [openCsv, setOpenCsv] = useState(false);
  const [csvText, setCsvText] = useState(
    "date,description,reference,amount\n2026-11-15,Customer Wire Deposit,WIRE-901,125000\n2026-11-18,Bank Wire Transfer Fee,FEE-901,-350"
  );

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const qs = new URLSearchParams({ companyId: String(activeCompany.id) });
    if (accountId) qs.set("accountId", accountId);
    const res = await fetch(`/api/reconciliation?${qs.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as ReconData;
    setData(json);
    if (!accountId && json.activeAccountId) setAccountId(String(json.activeAccountId));
    setLoading(false);
  }, [activeCompany, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postAction(payload: Record<string, unknown>) {
    if (!activeCompany) return;
    const res = await fetch("/api/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompany.id, accountId: Number(accountId) || undefined, ...payload }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return false;
    }
    showToast("success", t.common.success);
    await load();
    return true;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCsvText(reader.result);
    };
    reader.readAsText(file);
  }

  const unmatchedGl = (data?.glLines || []).filter((g) => !g.matched);

  return (
    <div>
      <PageHeader
        title={t.extras.reconTitle}
        subtitle={t.extras.reconSubtitle}
        actions={
          canWrite && (
            <>
              <button
                type="button"
                onClick={() => void postAction({ action: "auto_match" })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t.extras.autoMatch}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenCsv(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>{t.extras.uploadCsv}</span>
              </button>
            </>
          )
        }
      />

      {loading || !data ? (
        <div className="py-16 text-center text-sm text-slate-400">{t.common.loading}</div>
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label={t.extras.bookBalance}
              value={formatAmt(data.summary.bookBalance)}
              icon={<Landmark className="w-5 h-5" />}
              tone="emerald"
            />
            <KpiCard
              label={t.extras.statementBalance}
              value={formatAmt(data.summary.statementNet)}
              icon={<Landmark className="w-5 h-5" />}
              tone="blue"
            />
            <KpiCard
              label={t.extras.matched}
              value={String(data.summary.matchedCount)}
              icon={<CheckCircle2 className="w-5 h-5" />}
              tone="emerald"
            />
            <KpiCard
              label={t.extras.unmatched}
              value={String(data.summary.unmatchedCount)}
              icon={<Link2 className="w-5 h-5" />}
              tone={data.summary.unmatchedCount > 0 ? "amber" : "emerald"}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Bank Statement Lines */}
            <Card className="xl:col-span-2 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">{t.extras.statementLines}</h2>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  {data.bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-start">{t.common.date}</th>
                      <th className="px-4 py-3 text-start">{t.common.description}</th>
                      <th className="px-4 py-3 text-end">{t.common.amount}</th>
                      <th className="px-4 py-3 text-center">{t.common.status}</th>
                      <th className="px-4 py-3 text-end">{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.statements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                          {t.common.noData}
                        </td>
                      </tr>
                    ) : (
                      data.statements.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDt(st.statement_date)}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{st.description}</div>
                            {st.reference && <div className="text-xs font-mono text-slate-400">{st.reference}</div>}
                          </td>
                          <td
                            className={`px-4 py-3 text-end font-bold tabular-nums whitespace-nowrap ${
                              st.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {st.amount >= 0 ? "+" : ""}
                            {formatAmt(st.amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge
                              status={st.status === "MATCHED" ? "PAID" : "PARTIAL"}
                              label={st.status === "MATCHED" ? t.extras.matched : t.extras.unmatched}
                            />
                          </td>
                          <td className="px-4 py-3 text-end whitespace-nowrap">
                            {canWrite && st.status !== "MATCHED" && (
                              <div className="inline-flex items-center gap-1.5">
                                {unmatchedGl.length > 0 && (
                                  <select
                                    defaultValue=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        void postAction({
                                          action: "manual_match",
                                          statementId: st.id,
                                          journalLineId: Number(e.target.value),
                                        });
                                      }
                                    }}
                                    className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white max-w-[130px]"
                                  >
                                    <option value="">{t.extras.matchNow}...</option>
                                    {unmatchedGl.map((g) => (
                                      <option key={g.id} value={g.id}>
                                        {g.entry_number} ({formatAmt(g.net_amount)})
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void postAction({ action: "post_adjustment", statementId: st.id })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-emerald-700 cursor-pointer"
                                  title={t.extras.postBankFee}
                                >
                                  <FilePlus2 className="w-3.5 h-3.5" />
                                  <span>{t.extras.postBankFee}</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Unmatched Ledger Transactions */}
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">{t.extras.unmatchedGl}</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                {unmatchedGl.length === 0 ? (
                  <div className="p-8 text-center text-xs text-emerald-700 font-semibold">{t.extras.matched}</div>
                ) : (
                  unmatchedGl.map((gl) => (
                    <div key={gl.id} className="p-4 hover:bg-slate-50">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-emerald-800">{gl.entry_number}</span>
                        <span className={`font-bold tabular-nums ${gl.net_amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {formatAmt(gl.net_amount)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 mt-1">{gl.description}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatDt(gl.entry_date)}</div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Import Bank Statement CSV Modal */}
      <Modal open={openCsv} onClose={() => setOpenCsv(false)} title={t.extras.uploadCsv}>
        <div className="space-y-4">
          <div className="text-xs text-slate-600">
            CSV format: <code className="bg-slate-100 px-1.5 py-0.5 rounded">date,description,reference,amount</code> (negative for withdrawals, positive for deposits).
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="block w-full text-xs text-slate-600 file:me-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          <textarea
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs"
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setOpenCsv(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={async () => {
                const ok = await postAction({ action: "import_csv", csvText });
                if (ok) setOpenCsv(false);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              {t.extras.uploadCsv}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
