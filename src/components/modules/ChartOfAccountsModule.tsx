"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { localizedAccountName } from "@/lib/i18n";
import { useApp } from "../AppContext";
import { Card, CsvButton, exportToCsv, Modal, PageHeader, StatusBadge } from "../ui";

interface AccountRow {
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
  balance: number;
}

export function ChartOfAccountsModule() {
  const { activeCompany, lang, t, formatAmt, canWrite, showToast } = useApp();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [openAdd, setOpenAdd] = useState(false);

  const [form, setForm] = useState({
    code: "",
    name: "",
    name_am: "",
    name_om: "",
    name_so: "",
    name_ar: "",
    type: "EXPENSE" as AccountRow["type"],
    subtype: "OPERATING_EXPENSE",
  });

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const res = await fetch(`/api/accounts?companyId=${activeCompany.id}`, { cache: "no-store" });
    const data = (await res.json()) as { accounts: AccountRow[] };
    setAccounts(data.accounts || []);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      ASSET: t.coa.asset,
      LIABILITY: t.coa.liability,
      EQUITY: t.coa.equity,
      REVENUE: t.coa.revenue,
      EXPENSE: t.coa.expense,
    };
    return map[type] || type;
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompany.id, ...form }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setOpenAdd(false);
    setForm({ code: "", name: "", name_am: "", name_om: "", name_so: "", name_ar: "", type: "EXPENSE", subtype: "OPERATING_EXPENSE" });
    void load();
  }

  const filtered = accounts.filter((a) => {
    if (typeFilter !== "ALL" && a.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.name_am || "").toLowerCase().includes(q) ||
      (a.name_om || "").toLowerCase().includes(q) ||
      (a.name_so || "").toLowerCase().includes(q) ||
      (a.name_ar || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title={t.coa.title}
        subtitle={t.coa.subtitle}
        actions={
          <>
            <CsvButton
              label={t.common.exportCsv}
              onClick={() =>
                exportToCsv(
                  `chart-of-accounts-${activeCompany?.name || "company"}.csv`,
                  [t.coa.code, t.coa.accountName, t.coa.type, t.coa.normalBalance, t.coa.currentBalance],
                  filtered.map((a) => [a.code, localizedAccountName(a, lang), a.type, a.normal_balance, a.balance])
                )
              }
            />
            {canWrite && (
              <button
                type="button"
                onClick={() => setOpenAdd(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.coa.addAccount}</span>
              </button>
            )}
          </>
        }
      />

      {/* Filter Bar */}
      <Card className="p-4 mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setTypeFilter(tp)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  typeFilter === tp
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tp === "ALL" ? t.common.all : typeLabel(tp)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Accounts Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">{t.coa.code}</th>
                <th className="px-4 py-3 text-start">{t.coa.accountName}</th>
                <th className="px-4 py-3 text-start">{t.coa.type}</th>
                <th className="px-4 py-3 text-start">{t.coa.normalBalance}</th>
                <th className="px-4 py-3 text-end">{t.journal.debit}</th>
                <th className="px-4 py-3 text-end">{t.journal.credit}</th>
                <th className="px-4 py-3 text-end">{t.coa.currentBalance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    {t.common.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{acc.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{localizedAccountName(acc, lang)}</div>
                      {lang !== "en" && <div className="text-xs text-slate-400">{acc.name}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={acc.type} label={typeLabel(acc.type)} />
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">
                      {acc.normal_balance === "DEBIT" ? t.coa.debit : t.coa.credit}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-600">{formatAmt(acc.total_debit)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-600">{formatAmt(acc.total_credit)}</td>
                    <td className="px-4 py-3 text-end font-bold tabular-nums text-slate-900">
                      {formatAmt(acc.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Account Modal */}
      <Modal open={openAdd} onClose={() => setOpenAdd(false)} title={t.coa.addAccount}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.coa.code} *</label>
              <input
                required
                placeholder="e.g. 6400"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.coa.accountName} (English) *</label>
              <input
                required
                placeholder="e.g. Marketing & Advertising"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.coa.type}</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountRow["type"] })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="ASSET">{t.coa.asset}</option>
                <option value="LIABILITY">{t.coa.liability}</option>
                <option value="EQUITY">{t.coa.equity}</option>
                <option value="REVENUE">{t.coa.revenue}</option>
                <option value="EXPENSE">{t.coa.expense}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.coa.subtype}</label>
              <input
                value={form.subtype}
                onChange={(e) => setForm({ ...form, subtype: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t.coa.localizedNames}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="አማርኛ (Amharic)"
                value={form.name_am}
                onChange={(e) => setForm({ ...form, name_am: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
              <input
                placeholder="Afaan Oromoo"
                value={form.name_om}
                onChange={(e) => setForm({ ...form, name_om: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
              <input
                placeholder="Soomaali"
                value={form.name_so}
                onChange={(e) => setForm({ ...form, name_so: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
              <input
                dir="rtl"
                placeholder="العربية (Arabic)"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setOpenAdd(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
