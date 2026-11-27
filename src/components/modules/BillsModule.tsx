"use client";

import { localizeApiError } from "@/lib/i18n/errors";
import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, CreditCard, Camera, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getTodayIso } from "@/lib/calendar";
import { localizedAccountName } from "@/lib/i18n";
import { useApp } from "../AppContext";
import { Card, Modal, PageHeader, StatusBadge } from "../ui";

interface BillRow {
  id: number;
  bill_number: string;
  vendor_name: string;
  issue_date: string;
  due_date: string;
  currency_code: string;
  expense_account_code: string;
  expense_account_name: string;
  subtotal: number;
  vat_amount: number;
  wht_amount: number;
  total: number;
  amount_paid: number;
  status: string;
  receipt_filename?: string;
}

interface VendorOpt {
  id: number;
  name: string;
  currency_code: string;
}

interface AccountOpt {
  id: number;
  code: string;
  name: string;
  name_am: string | null;
  name_om: string | null;
  name_so: string | null;
  name_ar: string | null;
  type: string;
  subtype: string;
}

export function BillsModule() {
  const { activeCompany, lang, t, formatAmt, formatDt, canWrite, showToast } = useApp();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [aging, setAging] = useState({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 });
  const [vendors, setVendors] = useState<VendorOpt[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<AccountOpt[]>([]);
  const [cashAccounts, setCashAccounts] = useState<AccountOpt[]>([]);
  const [loading, setLoading] = useState(true);

  const [openNew, setOpenNew] = useState(false);
  const [payBill, setPayBill] = useState<BillRow | null>(null);
  const [viewReceiptBill, setViewReceiptBill] = useState<BillRow | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [issueDate, setIssueDate] = useState(getTodayIso());
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [currencyCode, setCurrencyCode] = useState("ETB");
  const [vatRate, setVatRate] = useState("15");
  const [whtRate, setWhtRate] = useState("2");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ description: "", quantity: "1", unit_cost: "0" }]);

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(getTodayIso());
  const [payAcctId, setPayAcctId] = useState("");

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const [bRes, vRes, aRes] = await Promise.all([
      fetch(`/api/bills?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/vendors?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/accounts?companyId=${activeCompany.id}`, { cache: "no-store" }),
    ]);
    const bData = (await bRes.json()) as {
      bills: BillRow[];
      aging?: { current: number; d1_30: number; d31_60: number; d61_90: number; d90: number };
    };
    const vData = (await vRes.json()) as { vendors: VendorOpt[] };
    const aData = (await aRes.json()) as { accounts: AccountOpt[] };

    setBills(bData.bills || []);
    if (bData.aging) setAging(bData.aging);
    setVendors(vData.vendors || []);
    const expAccts = (aData.accounts || []).filter((a) => a.type === "EXPENSE" || a.subtype === "INVENTORY" || a.subtype === "FIXED_ASSET");
    const banks = (aData.accounts || []).filter((a) => a.subtype === "CASH" || a.subtype === "BANK");
    setExpenseAccounts(expAccts);
    setCashAccounts(banks);
    if (expAccts[0]) setExpenseAccountId(String(expAccts[0].id));
    if (banks[1] || banks[0]) setPayAcctId(String((banks[1] || banks[0]).id));
    setCurrencyCode(activeCompany.base_currency);
    setVatRate(String(activeCompany.default_vat_rate));
    setWhtRate(String(activeCompany.default_wht_rate));
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0);
  const vatAmt = (subtotal * (parseFloat(vatRate) || 0)) / 100;
  const whtAmt = (subtotal * (parseFloat(whtRate) || 0)) / 100;
  const netPayable = subtotal + vatAmt - whtAmt;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompany.id,
        vendor_id: Number(vendorId),
        expense_account_id: Number(expenseAccountId),
        issue_date: issueDate,
        due_date: dueDate,
        currency_code: currencyCode,
        vat_rate: parseFloat(vatRate) || 0,
        wht_rate: parseFloat(whtRate) || 0,
        notes,
        lines: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unit_cost: parseFloat(l.unit_cost) || 0,
          })),
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", localizeApiError(t, err.error));
      return;
    }
    showToast("success", t.common.success);
    setOpenNew(false);
    setLines([{ description: "", quantity: "1", unit_cost: "0" }]);
    setNotes("");
    void load();
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payBill) return;
    const res = await fetch(`/api/bills/${payBill.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parseFloat(payAmount),
        payment_date: payDate,
        account_id: payAcctId ? Number(payAcctId) : undefined,
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", localizeApiError(t, err.error));
      return;
    }
    showToast("success", t.common.success);
    setPayBill(null);
    void load();
  }

  function handleAttachReceipt(billId: number, file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== "string") return;
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId, dataUrl: reader.result }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        showToast("error", err.error || t.common.error);
        return;
      }
      showToast("success", t.common.success);
      void load();
    };
    reader.readAsDataURL(file);
  }

  const nowMs = Date.now();
  const overdueBills = bills.filter(
    (b) => b.total - b.amount_paid > 0.01 && new Date(b.due_date).getTime() < nowMs
  );
  const dueSoonBills = bills.filter((b) => {
    const diffDays = (new Date(b.due_date).getTime() - nowMs) / (1000 * 60 * 60 * 24);
    return b.total - b.amount_paid > 0.01 && diffDays >= 0 && diffDays <= 7;
  });

  return (
    <div>
      <PageHeader
        title={t.purchases.billsTitle}
        subtitle={t.purchases.billsSubtitle}
        actions={
          canWrite && (
            <button
              type="button"
              onClick={() => setOpenNew(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.purchases.newBill}</span>
            </button>
          )
        }
      />

      <h2 className="text-sm font-bold text-mb-cocoa mb-2">{t.purchases.agedPayables}</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {(
          [
            ["current", t.purchases.agingCurrent, aging.current],
            ["d1_30", t.purchases.aging1to30, aging.d1_30],
            ["d31_60", t.purchases.aging31to60, aging.d31_60],
            ["d61_90", t.purchases.aging61to90, aging.d61_90],
            ["d90", t.purchases.agingOver90, aging.d90],
          ] as const
        ).map(([key, label, amount]) => (
          <Card key={key} className="p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-mb-ink/70">{label}</div>
            <div className="mt-1 text-sm font-bold tabular-nums text-mb-cocoa">{formatAmt(amount)}</div>
          </Card>
        ))}
      </div>

      {(overdueBills.length > 0 || dueSoonBills.length > 0) && (
        <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <strong>{t.extras.dueReminders}:</strong>{" "}
              {overdueBills.length > 0 && `${overdueBills.length} ${t.extras.overdueBillsAlert}. `}
              {dueSoonBills.length > 0 && `${dueSoonBills.length} ${t.extras.dueSoonBillsAlert}.`}
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mb-beige text-xs text-mb-ink uppercase border-b border-mb-line">
              <tr>
                <th className="px-4 py-3 text-start">{t.purchases.billNumber}</th>
                <th className="px-4 py-3 text-start">{t.purchases.vendor}</th>
                <th className="px-4 py-3 text-start">{t.purchases.expenseAccount}</th>
                <th className="px-4 py-3 text-start">{t.common.dueDate}</th>
                <th className="px-4 py-3 text-end">{t.common.total}</th>
                <th className="px-4 py-3 text-end">{t.purchases.balanceDue}</th>
                <th className="px-4 py-3 text-center">{t.common.status}</th>
                <th className="px-4 py-3 text-end">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mb-line/70">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-mb-ink/70">
                    {t.common.loading}
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-mb-ink/70">
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                bills.map((b) => {
                  const due = Math.max(0, Number((b.total - b.amount_paid).toFixed(2)));
                  return (
                    <tr key={b.id} className="hover:bg-mb-cream/70">
                      <td className="px-4 py-3 font-mono font-bold text-mb-cocoa">{b.bill_number}</td>
                      <td className="px-4 py-3 font-medium text-mb-cocoa">{b.vendor_name}</td>
                      <td className="px-4 py-3 text-xs text-mb-ink">
                        <span className="font-mono text-mb-ink/70 me-1">{b.expense_account_code}</span>
                        {b.expense_account_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-mb-ink whitespace-nowrap">{formatDt(b.due_date)}</td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums whitespace-nowrap">
                        {formatAmt(b.total, b.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-end font-bold tabular-nums whitespace-nowrap">
                        {formatAmt(due, b.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={b.status} label={b.status === "PAID" ? t.common.paid : b.status === "PARTIAL" ? t.common.partial : t.common.open} />
                      </td>
                      <td className="px-4 py-3 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {b.receipt_filename ? (
                            <button
                              type="button"
                              onClick={() => setViewReceiptBill(b)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-mb-cream text-mb-cocoa border border-mb-line hover:bg-mb-cream cursor-pointer"
                              title={t.extras.viewReceipt}
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            canWrite && (
                              <label
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-mb-line text-mb-ink hover:bg-mb-cream cursor-pointer"
                                title={t.extras.snapReceipt}
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => handleAttachReceipt(b.id, e.target.files?.[0])}
                                />
                              </label>
                            )
                          )}
                          {canWrite && due > 0.01 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayBill(b);
                                setPayAmount(String(due));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-mb-cream text-emerald-700 border border-mb-line hover:bg-mb-cream cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>{t.common.recordPayment}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Bill Modal */}
      <Modal open={openNew} onClose={() => setOpenNew(false)} title={t.purchases.newBill} maxWidth="max-w-3xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.purchases.vendor} *</label>
              <select
                required
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper"
              >
                <option value="">-- {t.purchases.vendor} --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.purchases.expenseAccount} *</label>
              <select
                required
                value={expenseAccountId}
                onChange={(e) => setExpenseAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper"
              >
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {localizedAccountName(a, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.date}</label>
              <input type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.dueDate}</label>
              <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.currency}</label>
              <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper">
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.applyVat}</label>
                <input type="number" step="0.5" min="0" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="w-full px-2.5 py-2 rounded-xl border border-mb-line text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.applyWht}</label>
                <input type="number" step="0.5" min="0" value={whtRate} onChange={(e) => setWhtRate(e.target.value)} className="w-full px-2.5 py-2 rounded-xl border border-mb-line text-sm" />
              </div>
            </div>
          </div>

          <div className="border border-mb-line rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-mb-beige text-mb-ink uppercase">
                <tr>
                  <th className="px-3 py-2 text-start">{t.common.description}</th>
                  <th className="px-3 py-2 text-end w-24">{t.common.quantity}</th>
                  <th className="px-3 py-2 text-end w-32">{t.common.unitCost}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-mb-line/70">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <input
                        required
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
                        min="0.01"
                        value={line.quantity}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].quantity = e.target.value;
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
                        value={line.unit_cost}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx].unit_cost = e.target.value;
                          setLines(next);
                        }}
                        className="w-full px-2 py-1.5 rounded-md border border-mb-line text-xs text-end tabular-nums"
                      />
                    </td>
                    <td className="p-2 text-center">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-mb-ink/70 hover:text-rose-600 cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <button
              type="button"
              onClick={() => setLines([...lines, { description: "", quantity: "1", unit_cost: "0" }])}
              className="text-xs font-semibold text-mb-cocoa hover:underline cursor-pointer"
            >
              + {t.common.addLine}
            </button>
            <div className="w-full sm:w-72 bg-mb-beige rounded-xl p-4 space-y-1.5 text-xs border border-mb-line">
              <div className="flex justify-between">
                <span className="text-mb-ink">{t.common.subtotal}</span>
                <span className="font-semibold tabular-nums">{formatAmt(subtotal, currencyCode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mb-ink">{t.common.vat} ({vatRate}%)</span>
                <span className="font-semibold tabular-nums">+{formatAmt(vatAmt, currencyCode)}</span>
              </div>
              {whtAmt > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>{t.common.wht} ({whtRate}%)</span>
                  <span className="font-semibold tabular-nums">-{formatAmt(whtAmt, currencyCode)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-mb-line text-sm font-bold text-mb-cocoa">
                <span>{t.common.total}</span>
                <span className="tabular-nums">{formatAmt(netPayable, currencyCode)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
            <button type="button" onClick={() => setOpenNew(false)} className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer">
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Bill Modal */}
      <Modal open={!!payBill} onClose={() => setPayBill(null)} title={`${t.common.recordPayment} — ${payBill?.bill_number || ""}`} maxWidth="max-w-md">
        {payBill && (
          <form onSubmit={handlePay} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.amount} ({payBill.currency_code})</label>
              <input type="number" step="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm tabular-nums" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.date}</label>
              <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.journal.account}</label>
              <select value={payAcctId} onChange={(e) => setPayAcctId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper">
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {localizedAccountName(a, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
              <button type="button" onClick={() => setPayBill(null)} className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer">
                {t.common.cancel}
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer">
                {t.common.confirm}
              </button>
            </div>
          </form>
        )}
      </Modal>
      {/* View Attached Receipt Photo Modal */}
      <Modal
        open={!!viewReceiptBill}
        onClose={() => setViewReceiptBill(null)}
        title={`${t.extras.viewReceipt} — ${viewReceiptBill?.bill_number || ""}`}
        maxWidth="max-w-lg"
      >
        {viewReceiptBill?.receipt_filename && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/receipts/${viewReceiptBill.receipt_filename}`}
              alt={viewReceiptBill.bill_number}
              className="w-full rounded-xl border border-mb-line object-contain max-h-[65vh]"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
