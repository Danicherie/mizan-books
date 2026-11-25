"use client";

import { localizeApiError } from "@/lib/i18n/errors";
import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { localizedAccountName } from "@/lib/i18n";
import { getTodayIso } from "@/lib/calendar";
import { toMinor } from "@/lib/money";
import { useApp } from "../AppContext";
import { Card, Modal, PageHeader, StatusBadge } from "../ui";

function draftCents(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return toMinor(parsed);
  } catch {
    return Number.NaN;
  }
}

interface AccountOpt {
  id: number;
  code: string;
  name: string;
  name_am: string | null;
  name_om: string | null;
  name_so: string | null;
  name_ar: string | null;
}

interface JournalLine {
  id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  name_am: string | null;
  name_om: string | null;
  name_so: string | null;
  name_ar: string | null;
  description: string;
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  reference: string;
  description: string;
  source_type: string;
  status: string;
  created_by_name: string | null;
  lines: JournalLine[];
}

export function JournalEntriesModule() {
  const { activeCompany, lang, t, formatAmt, formatDt, canWrite, showToast } = useApp();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);

  const [entryDate, setEntryDate] = useState(getTodayIso());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Array<{ account_id: string; description: string; debit: string; credit: string }>>([
    { account_id: "", description: "", debit: "", credit: "" },
    { account_id: "", description: "", debit: "", credit: "" },
  ]);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const [jeRes, accRes] = await Promise.all([
      fetch(`/api/journals?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/accounts?companyId=${activeCompany.id}`, { cache: "no-store" }),
    ]);
    const jeData = (await jeRes.json()) as { entries: JournalEntry[] };
    const accData = (await accRes.json()) as { accounts: AccountOpt[] };
    setEntries(jeData.entries || []);
    setAccounts(accData.accounts || []);
    if (jeData.entries?.[0]) {
      setExpanded({ [jeData.entries[0].id]: true });
    }
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const totalDebitMinor = lines.reduce((sum, line) => sum + draftCents(line.debit), 0);
  const totalCreditMinor = lines.reduce((sum, line) => sum + draftCents(line.credit), 0);
  const isBalanced =
    totalDebitMinor > 0 &&
    Number.isFinite(totalDebitMinor) &&
    Number.isFinite(totalCreditMinor) &&
    totalDebitMinor === totalCreditMinor;

  const sourceLabel = (s: string) => {
    const map: Record<string, string> = {
      MANUAL: t.journal.manual,
      INVOICE: t.journal.autoInvoice,
      INVOICE_PAYMENT: t.journal.autoPayment,
      BILL: t.journal.autoBill,
      BILL_PAYMENT: t.journal.autoPayment,
      PAYROLL: t.journal.autoPayroll,
      INVENTORY_ADJ: t.journal.autoInventory,
    };
    return map[s] || s;
  };

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany || !isBalanced) return;
    const payloadLines = lines
      .filter((l) => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l) => ({
        account_id: Number(l.account_id),
        description: l.description || description,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
      }));

    const res = await fetch("/api/journals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompany.id,
        entry_date: entryDate,
        reference,
        description,
        lines: payloadLines,
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", localizeApiError(t, err.error));
      return;
    }

    showToast("success", t.common.success);
    setOpenModal(false);
    setReference("");
    setDescription("");
    setLines([
      { account_id: "", description: "", debit: "", credit: "" },
      { account_id: "", description: "", debit: "", credit: "" },
    ]);
    void load();
  }

  return (
    <div>
      <PageHeader
        title={t.journal.title}
        subtitle={t.journal.subtitle}
        actions={
          canWrite && (
            <button
              type="button"
              onClick={() => setOpenModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.journal.newEntry}</span>
            </button>
          )
        }
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-mb-ink/70">{t.common.loading}</div>
      ) : (
        <div className="space-y-3">
          {entries.map((je) => {
            const isOpen = !!expanded[je.id];
            const jeTotal = je.lines.reduce((s, l) => s + Number(l.debit), 0);
            return (
              <Card key={je.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [je.id]: !p[je.id] }))}
                  className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-mb-cream/80 transition-colors text-start cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-mb-cream text-mb-cocoa border border-mb-line shrink-0">
                      {je.entry_number}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-mb-cocoa truncate">{je.description}</div>
                      <div className="text-xs text-mb-ink mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{formatDt(je.entry_date)}</span>
                        {je.reference && <span>· {t.common.reference}: {je.reference}</span>}
                        <span>· {sourceLabel(je.source_type)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={je.status} label={t.common.posted} />
                    <span className="font-bold text-sm tabular-nums text-mb-cocoa">{formatAmt(jeTotal)}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-mb-ink/70" /> : <ChevronDown className="w-4 h-4 text-mb-ink/70" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-mb-line bg-mb-beige/50 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-mb-ink uppercase border-b border-mb-line">
                        <tr>
                          <th className="px-5 py-2 text-start">{t.journal.account}</th>
                          <th className="px-5 py-2 text-start">{t.common.description}</th>
                          <th className="px-5 py-2 text-end">{t.journal.debit}</th>
                          <th className="px-5 py-2 text-end">{t.journal.credit}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mb-line/70">
                        {je.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="px-5 py-2.5 font-medium text-mb-cocoa">
                              <span className="font-mono text-mb-ink me-2">{l.account_code}</span>
                              {localizedAccountName(
                                {
                                  name: l.account_name,
                                  name_am: l.name_am,
                                  name_om: l.name_om,
                                  name_so: l.name_so,
                                  name_ar: l.name_ar,
                                },
                                lang
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-mb-ink">{l.description}</td>
                            <td className="px-5 py-2.5 text-end font-semibold tabular-nums text-mb-cocoa">
                              {l.debit > 0 ? formatAmt(l.debit) : "—"}
                            </td>
                            <td className="px-5 py-2.5 text-end font-semibold tabular-nums text-mb-cocoa">
                              {l.credit > 0 ? formatAmt(l.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New Journal Entry Modal */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title={t.journal.newEntry} maxWidth="max-w-3xl">
        <form onSubmit={handlePost} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.date} *</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.reference}</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. ADJ-001"
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.description} *</label>
              <input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
              />
            </div>
          </div>

          <div className="border border-mb-line rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-mb-beige text-mb-ink uppercase">
                <tr>
                  <th className="px-3 py-2 text-start">{t.journal.account}</th>
                  <th className="px-3 py-2 text-start">{t.common.description}</th>
                  <th className="px-3 py-2 text-end w-32">{t.journal.debit}</th>
                  <th className="px-3 py-2 text-end w-32">{t.journal.credit}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-mb-line/70">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <select
                        required
                        value={line.account_id}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].account_id = e.target.value;
                          setLines(next);
                        }}
                        className="w-full px-2 py-1.5 rounded-md border border-mb-line bg-mb-paper text-xs"
                      >
                        <option value="">-- {t.journal.account} --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} - {localizedAccountName(a, lang)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        value={line.description}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].description = e.target.value;
                          setLines(next);
                        }}
                        className="w-full px-2 py-1.5 rounded-md border border-mb-line text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debit}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].debit = e.target.value;
                          if (parseFloat(e.target.value) > 0) next[idx].credit = "";
                          setLines(next);
                        }}
                        className="w-full px-2 py-1.5 rounded-md border border-mb-line text-xs text-end tabular-nums"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.credit}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].credit = e.target.value;
                          if (parseFloat(e.target.value) > 0) next[idx].debit = "";
                          setLines(next);
                        }}
                        className="w-full px-2 py-1.5 rounded-md border border-mb-line text-xs text-end tabular-nums"
                      />
                    </td>
                    <td className="p-2 text-center">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          className="text-mb-ink/70 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setLines([...lines, { account_id: "", description: "", debit: "", credit: "" }])}
              className="text-xs font-semibold text-mb-cocoa hover:underline cursor-pointer"
            >
              + {t.common.addLine}
            </button>

            <div className="flex items-center gap-4 text-xs">
              <span>
                {t.journal.totalDebit}: <strong className="tabular-nums">{formatAmt(totalDebit)}</strong>
              </span>
              <span>
                {t.journal.totalCredit}: <strong className="tabular-nums">{formatAmt(totalCredit)}</strong>
              </span>
              {isBalanced ? (
                <span className="inline-flex items-center gap-1 font-semibold text-mb-cocoa">
                  <CheckCircle2 className="w-4 h-4" /> {t.journal.balanced}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                  <AlertCircle className="w-4 h-4" /> {t.journal.outOfBalance}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
            <button
              type="button"
              onClick={() => setOpenModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep disabled:opacity-40 cursor-pointer"
            >
              {t.journal.postEntry}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
