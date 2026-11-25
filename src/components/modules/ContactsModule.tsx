"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Mail, Phone, Building2 } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useApp } from "../AppContext";
import { Card, Modal, PageHeader } from "../ui";

interface ContactRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  tin_number: string;
  address: string;
  currency_code: string;
  credit_limit?: number;
  open_balance: number;
  invoice_count?: number;
  bill_count?: number;
}

export function ContactsModule({ mode }: { mode: "customers" | "vendors" }) {
  const { activeCompany, t, formatAmt, canWrite, showToast } = useApp();
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    tin_number: "",
    address: "",
    currency_code: "ETB",
    credit_limit: "0",
  });

  const isCustomer = mode === "customers";
  const endpoint = isCustomer ? "/api/customers" : "/api/vendors";

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const res = await fetch(`${endpoint}?companyId=${activeCompany.id}`, { cache: "no-store" });
    const data = (await res.json()) as { customers?: ContactRow[]; vendors?: ContactRow[] };
    setRows(isCustomer ? data.customers || [] : data.vendors || []);
    setForm((f) => ({ ...f, currency_code: activeCompany.base_currency }));
    setLoading(false);
  }, [activeCompany, endpoint, isCustomer]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompany.id,
        ...form,
        credit_limit: parseFloat(form.credit_limit) || 0,
      }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setOpenAdd(false);
    setForm({ name: "", email: "", phone: "", tin_number: "", address: "", currency_code: activeCompany.base_currency, credit_limit: "0" });
    void load();
  }

  return (
    <div>
      <PageHeader
        title={isCustomer ? t.sales.customersTitle : t.purchases.vendorsTitle}
        subtitle={isCustomer ? t.sales.customersSubtitle : t.purchases.vendorsSubtitle}
        actions={
          canWrite && (
            <button
              type="button"
              onClick={() => setOpenAdd(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isCustomer ? t.sales.newCustomer : t.purchases.newVendor}</span>
            </button>
          )
        }
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">{t.common.loading}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <Card key={r.id} className="p-5 hover:border-emerald-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 truncate">{r.name}</h3>
                    <p className="text-xs text-slate-500">
                      {t.common.tin}: {r.tin_number || "—"} · {r.currency_code}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                {r.email && (
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{r.email}</span>
                  </div>
                )}
                {r.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{r.phone}</span>
                  </div>
                )}
                {r.address && <div className="text-slate-500 truncate">{r.address}</div>}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {isCustomer ? t.sales.balanceDue : t.purchases.balanceDue}
                </span>
                <span className={`font-bold text-sm tabular-nums ${r.open_balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {formatAmt(r.open_balance)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title={isCustomer ? t.sales.newCustomer : t.purchases.newVendor}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.name} *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.email}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.phone}</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.tin}</label>
              <input
                value={form.tin_number}
                onChange={(e) => setForm({ ...form, tin_number: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.currency}</label>
              <select
                value={form.currency_code}
                onChange={(e) => setForm({ ...form, currency_code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={isCustomer ? "" : "sm:col-span-2"}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.address}</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            {isCustomer && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t.sales.creditLimit}</label>
                <input
                  type="number"
                  value={form.credit_limit}
                  onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setOpenAdd(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 cursor-pointer"
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
