"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Printer, CreditCard, Eye } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getTodayIso } from "@/lib/calendar";
import { useApp } from "../AppContext";
import { Card, CsvButton, exportToCsv, Modal, PageHeader, StatusBadge } from "../ui";

interface InvoiceLine {
  id?: number;
  item_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

interface InvoiceRow {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  customer_tin: string;
  customer_address: string;
  customer_email: string;
  issue_date: string;
  due_date: string;
  currency_code: string;
  exchange_rate: number;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  wht_rate: number;
  wht_amount: number;
  total: number;
  amount_paid: number;
  status: string;
  notes: string;
  lines: InvoiceLine[];
}

interface CustomerOpt {
  id: number;
  name: string;
  currency_code: string;
}

interface InventoryOpt {
  id: number;
  sku: string;
  name: string;
  unit_price: number;
  quantity_on_hand: number;
  item_type: string;
}

interface CashAcctOpt {
  id: number;
  code: string;
  name: string;
  subtype: string;
}

export function InvoicesModule() {
  const { activeCompany, t, formatAmt, formatDt, canWrite, showToast } = useApp();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [items, setItems] = useState<InventoryOpt[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAcctOpt[]>([]);
  const [loading, setLoading] = useState(true);

  const [openNew, setOpenNew] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<InvoiceRow | null>(null);
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);

  // Create form
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(getTodayIso());
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [currencyCode, setCurrencyCode] = useState("ETB");
  const [vatRate, setVatRate] = useState("15");
  const [whtRate, setWhtRate] = useState("2");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ item_id: string; description: string; quantity: string; unit_price: string }>>([
    { item_id: "", description: "", quantity: "1", unit_price: "0" },
  ]);

  // Pay form
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(getTodayIso());
  const [payAcctId, setPayAcctId] = useState("");

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const [invRes, custRes, itemRes, accRes] = await Promise.all([
      fetch(`/api/invoices?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/customers?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/inventory?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/accounts?companyId=${activeCompany.id}`, { cache: "no-store" }),
    ]);
    const invData = (await invRes.json()) as { invoices: InvoiceRow[] };
    const custData = (await custRes.json()) as { customers: CustomerOpt[] };
    const itemData = (await itemRes.json()) as { items: InventoryOpt[] };
    const accData = (await accRes.json()) as { accounts: CashAcctOpt[] };

    setInvoices(invData.invoices || []);
    setCustomers(custData.customers || []);
    setItems(itemData.items || []);
    const banks = (accData.accounts || []).filter((a) => a.subtype === "CASH" || a.subtype === "BANK");
    setCashAccounts(banks);
    if (banks[1] || banks[0]) setPayAcctId(String((banks[1] || banks[0]).id));
    setCurrencyCode(activeCompany.base_currency);
    setVatRate(String(activeCompany.default_vat_rate));
    setWhtRate(String(activeCompany.default_wht_rate));
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const vatAmt = (subtotal * (parseFloat(vatRate) || 0)) / 100;
  const whtAmt = (subtotal * (parseFloat(whtRate) || 0)) / 100;
  const netPayable = subtotal + vatAmt - whtAmt;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompany.id,
        customer_id: Number(customerId),
        issue_date: issueDate,
        due_date: dueDate,
        currency_code: currencyCode,
        vat_rate: parseFloat(vatRate) || 0,
        wht_rate: parseFloat(whtRate) || 0,
        notes,
        lines: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            item_id: l.item_id ? Number(l.item_id) : null,
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unit_price: parseFloat(l.unit_price) || 0,
          })),
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setOpenNew(false);
    setLines([{ item_id: "", description: "", quantity: "1", unit_price: "0" }]);
    setNotes("");
    void load();
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payInvoice) return;
    const res = await fetch(`/api/invoices/${payInvoice.id}/pay`, {
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
      showToast("error", err.error || t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setPayInvoice(null);
    void load();
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      PAID: t.common.paid,
      PARTIAL: t.common.partial,
      SENT: t.common.sent,
      OVERDUE: t.common.overdue,
      DRAFT: t.common.draft,
    };
    return map[s] || s;
  };

  return (
    <div>
      <PageHeader
        title={t.sales.invoicesTitle}
        subtitle={t.sales.invoicesSubtitle}
        actions={
          <>
            <CsvButton
              label={t.common.exportCsv}
              onClick={() =>
                exportToCsv(
                  `invoices-${activeCompany?.name || "company"}.csv`,
                  [t.sales.invoiceNumber, t.sales.customer, t.common.date, t.common.dueDate, t.common.currency, t.common.subtotal, t.common.vat, t.common.wht, t.common.total, t.sales.amountPaid, t.common.status],
                  invoices.map((i) => [i.invoice_number, i.customer_name, i.issue_date, i.due_date, i.currency_code, i.subtotal, i.vat_amount, i.wht_amount, i.total, i.amount_paid, i.status])
                )
              }
            />
            {canWrite && (
              <button
                type="button"
                onClick={() => setOpenNew(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.sales.newInvoice}</span>
              </button>
            )}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mb-beige text-xs text-mb-ink uppercase border-b border-mb-line">
              <tr>
                <th className="px-4 py-3 text-start">{t.sales.invoiceNumber}</th>
                <th className="px-4 py-3 text-start">{t.sales.customer}</th>
                <th className="px-4 py-3 text-start">{t.common.date}</th>
                <th className="px-4 py-3 text-start">{t.common.dueDate}</th>
                <th className="px-4 py-3 text-end">{t.common.total}</th>
                <th className="px-4 py-3 text-end">{t.sales.balanceDue}</th>
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
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-mb-ink/70">
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const due = Math.max(0, Number((inv.total - inv.amount_paid).toFixed(2)));
                  return (
                    <tr key={inv.id} className="hover:bg-mb-cream/70">
                      <td className="px-4 py-3 font-mono font-bold text-mb-cocoa">{inv.invoice_number}</td>
                      <td className="px-4 py-3 font-medium text-mb-cocoa">{inv.customer_name}</td>
                      <td className="px-4 py-3 text-xs text-mb-ink whitespace-nowrap">{formatDt(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-xs text-mb-ink whitespace-nowrap">{formatDt(inv.due_date)}</td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums whitespace-nowrap">
                        {formatAmt(inv.total, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-end font-bold tabular-nums whitespace-nowrap text-mb-cocoa">
                        {formatAmt(due, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={inv.status} label={statusLabel(inv.status)} />
                      </td>
                      <td className="px-4 py-3 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewInvoice(inv)}
                            className="p-1.5 rounded-xl border border-mb-line text-mb-ink hover:bg-mb-cream cursor-pointer"
                            title={t.common.print}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canWrite && due > 0.01 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayInvoice(inv);
                                setPayAmount(String(due));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-mb-cream text-mb-cocoa border border-mb-line hover:bg-mb-cream cursor-pointer"
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

      {/* New Invoice Modal */}
      <Modal open={openNew} onClose={() => setOpenNew(false)} title={t.sales.newInvoice} maxWidth="max-w-3xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.customer} *</label>
              <select
                required
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const found = customers.find((c) => String(c.id) === e.target.value);
                  if (found) setCurrencyCode(found.currency_code);
                }}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper"
              >
                <option value="">-- {t.sales.customer} --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currency_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.currency}</label>
              <select
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.date} *</label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.dueDate} *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.applyVat}</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-mb-line text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.applyWht}</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={whtRate}
                  onChange={(e) => setWhtRate(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-mb-line text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border border-mb-line rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-mb-beige text-mb-ink uppercase">
                <tr>
                  <th className="px-3 py-2 text-start w-44">{t.sales.selectItem}</th>
                  <th className="px-3 py-2 text-start">{t.common.description}</th>
                  <th className="px-3 py-2 text-end w-20">{t.common.quantity}</th>
                  <th className="px-3 py-2 text-end w-28">{t.common.unitPrice}</th>
                  <th className="px-3 py-2 text-end w-28">{t.common.lineTotal}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-mb-line/70">
                {lines.map((line, idx) => {
                  const lt = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
                  return (
                    <tr key={idx}>
                      <td className="p-2">
                        <select
                          value={line.item_id}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx].item_id = e.target.value;
                            const found = items.find((it) => String(it.id) === e.target.value);
                            if (found) {
                              next[idx].description = found.name;
                              next[idx].unit_price = String(found.unit_price);
                            }
                            setLines(next);
                          }}
                          className="w-full px-2 py-1.5 rounded-md border border-mb-line bg-mb-paper text-xs"
                        >
                          <option value="">{t.sales.customLine}</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.sku} - {it.name}
                            </option>
                          ))}
                        </select>
                      </td>
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
                          value={line.unit_price}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx].unit_price = e.target.value;
                            setLines(next);
                          }}
                          className="w-full px-2 py-1.5 rounded-md border border-mb-line text-xs text-end tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-end font-semibold tabular-nums">{formatAmt(lt, currencyCode)}</td>
                      <td className="p-2 text-center">
                        {lines.length > 1 && (
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <button
              type="button"
              onClick={() => setLines([...lines, { item_id: "", description: "", quantity: "1", unit_price: "0" }])}
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
                <span>{t.sales.netPayable}</span>
                <span className="tabular-nums">{formatAmt(netPayable, currencyCode)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.notes}</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
            <button
              type="button"
              onClick={() => setOpenNew(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
            >
              {t.common.create}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={!!payInvoice}
        onClose={() => setPayInvoice(null)}
        title={`${t.common.recordPayment} — ${payInvoice?.invoice_number || ""}`}
        maxWidth="max-w-md"
      >
        {payInvoice && (
          <form onSubmit={handlePayment} className="space-y-4">
            <div className="p-3 rounded-xl bg-mb-beige border border-mb-line text-xs flex justify-between">
              <span className="text-mb-ink">{t.sales.balanceDue}</span>
              <span className="font-bold text-mb-cocoa tabular-nums">
                {formatAmt(payInvoice.total - payInvoice.amount_paid, payInvoice.currency_code)}
              </span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">
                {t.sales.paymentAmount} ({payInvoice.currency_code}) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.paymentDate} *</label>
              <input
                type="date"
                required
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.sales.paymentAccount}</label>
              <select
                value={payAcctId}
                onChange={(e) => setPayAcctId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper"
              >
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
              <button
                type="button"
                onClick={() => setPayInvoice(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
              >
                {t.common.confirm}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Printable Tax Invoice Modal */}
      <Modal
        open={!!viewInvoice}
        onClose={() => setViewInvoice(null)}
        title={`${t.sales.taxInvoice} — ${viewInvoice?.invoice_number || ""}`}
        maxWidth="max-w-3xl"
      >
        {viewInvoice && activeCompany && (
          <div className="print-container space-y-6">
            <div className="flex flex-wrap justify-between items-start gap-4 border-b border-mb-line pb-5">
              <div>
                <h3 className="text-xl font-bold text-mb-cocoa">{activeCompany.name}</h3>
                <p className="text-xs text-mb-ink mt-0.5">{activeCompany.legal_name}</p>
                <p className="text-xs text-mb-ink">{activeCompany.address}</p>
                <p className="text-xs font-semibold text-mb-ink mt-1">
                  {t.common.tin}: {activeCompany.tin_number}
                </p>
              </div>
              <div className="text-end">
                <div className="text-lg font-extrabold tracking-wide text-mb-cocoa">{t.sales.taxInvoice}</div>
                <div className="font-mono text-sm font-bold text-mb-cocoa">{viewInvoice.invoice_number}</div>
                <div className="text-xs text-mb-ink mt-1">
                  {t.common.date}: {formatDt(viewInvoice.issue_date)}
                </div>
                <div className="text-xs text-mb-ink">
                  {t.common.dueDate}: {formatDt(viewInvoice.due_date)}
                </div>
              </div>
            </div>

            <div className="bg-mb-beige rounded-xl p-4 border border-mb-line text-xs">
              <div className="font-bold uppercase text-mb-ink/70 mb-1">{t.sales.billTo}</div>
              <div className="text-sm font-bold text-mb-cocoa">{viewInvoice.customer_name}</div>
              <div className="text-mb-ink">{viewInvoice.customer_address}</div>
              {viewInvoice.customer_tin && (
                <div className="text-mb-ink font-medium mt-0.5">
                  {t.common.tin}: {viewInvoice.customer_tin}
                </div>
              )}
            </div>

            <table className="w-full text-sm border border-mb-line rounded-xl overflow-hidden">
              <thead className="bg-mb-cream text-xs text-mb-ink uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t.common.description}</th>
                  <th className="px-4 py-2.5 text-end">{t.common.quantity}</th>
                  <th className="px-4 py-2.5 text-end">{t.common.unitPrice}</th>
                  <th className="px-4 py-2.5 text-end">{t.common.lineTotal}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mb-line">
                {viewInvoice.lines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2.5 text-mb-cocoa">{l.description}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{l.quantity}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {formatAmt(l.unit_price, viewInvoice.currency_code)}
                    </td>
                    <td className="px-4 py-2.5 text-end font-semibold tabular-nums">
                      {formatAmt(l.line_total ?? l.quantity * l.unit_price, viewInvoice.currency_code)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-mb-ink">
                  <span>{t.common.subtotal}</span>
                  <span className="tabular-nums">{formatAmt(viewInvoice.subtotal, viewInvoice.currency_code)}</span>
                </div>
                <div className="flex justify-between text-mb-ink">
                  <span>{t.common.vat} ({viewInvoice.vat_rate}%)</span>
                  <span className="tabular-nums">{formatAmt(viewInvoice.vat_amount, viewInvoice.currency_code)}</span>
                </div>
                {viewInvoice.wht_amount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>{t.common.wht} ({viewInvoice.wht_rate}%)</span>
                    <span className="tabular-nums">-{formatAmt(viewInvoice.wht_amount, viewInvoice.currency_code)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-mb-line font-bold text-base text-mb-cocoa">
                  <span>{t.sales.netPayable}</span>
                  <span className="tabular-nums">{formatAmt(viewInvoice.total, viewInvoice.currency_code)}</span>
                </div>
                <div className="flex justify-between text-xs text-mb-cocoa">
                  <span>{t.sales.amountPaid}</span>
                  <span className="tabular-nums">{formatAmt(viewInvoice.amount_paid, viewInvoice.currency_code)}</span>
                </div>
              </div>
            </div>

            {viewInvoice.notes && (
              <p className="text-xs text-mb-ink border-t border-mb-line pt-3">
                <strong>{t.common.notes}:</strong> {viewInvoice.notes}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-mb-line no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-mb-cocoa text-mb-cream hover:bg-[#3a2418] cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{t.common.print}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
