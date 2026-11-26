"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, Printer, CheckCircle2, Search } from "lucide-react";
import { useApp } from "../AppContext";
import { Card, Modal, PageHeader, StatusBadge } from "../ui";

interface CatalogItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  item_type: "PRODUCT" | "SERVICE";
  unit_price: number;
  quantity_on_hand: number;
  unit: string;
}

interface CartLine {
  item_id: number;
  description: string;
  unit_price: number;
  quantity: number;
}

interface PosSale {
  id: number;
  receipt_number: string;
  sale_date: string;
  customer_name: string;
  payment_method: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  lines: Array<{ description: string; quantity: number; unit_price: number; line_total: number }>;
}

export function PosModule() {
  const { activeCompany, t, formatAmt, formatDt, canWrite, showToast } = useApp();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "MOBILE_MONEY" | "BANK">("CASH");
  const [vatRate, setVatRate] = useState("15");
  const [submitting, setSubmitting] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<PosSale | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    const res = await fetch(`/api/pos?companyId=${activeCompany.id}`, { cache: "no-store" });
    const data = (await res.json()) as { items: CatalogItem[]; sales: PosSale[] };
    setItems(data.items || []);
    setSales(data.sales || []);
    setVatRate(String(activeCompany.default_vat_rate));
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  function addToCart(it: CatalogItem) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.item_id === it.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { item_id: it.id, description: it.name, unit_price: it.unit_price, quantity: 1 }];
    });
  }

  function updateQty(itemId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => (c.item_id === itemId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const vatAmt = (subtotal * (parseFloat(vatRate) || 0)) / 100;
  const total = subtotal + vatAmt;

  async function handleCompleteSale() {
    if (!activeCompany || cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompany.id,
          customer_name: customerName.trim() || t.extras.walkInCustomer,
          payment_method: paymentMethod,
          vat_rate: parseFloat(vatRate) || 0,
          lines: cart,
        }),
      });
      const json = (await res.json()) as { sale?: PosSale; error?: string };
      if (!res.ok || !json.sale) {
        showToast("error", json.error || t.common.error);
        return;
      }
      showToast("success", `${json.sale.receipt_number} — ${t.common.posted}`);
      setCart([]);
      setCustomerName("");
      setActiveReceipt(json.sale);
      void load();
    } finally {
      setSubmitting(false);
    }
  }

  const filteredItems = items.filter(
    (i) =>
      !search.trim() ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title={t.extras.posTitle} subtitle={t.extras.posSubtitle} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left: Product Grid */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-mb-ink/60 absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t.common.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 rounded-xl bg-mb-paper border border-mb-line text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredItems.map((it) => (
              <button
                key={it.id}
                type="button"
                disabled={!canWrite}
                onClick={() => addToCart(it)}
                className="p-4 rounded-xl bg-mb-paper border border-mb-line hover:border-mb-amber hover:shadow-sm transition-all text-start flex flex-col justify-between gap-2 cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-mb-cocoa text-sm leading-snug">{it.name}</div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-mb-cream text-mb-ink shrink-0">
                    {it.sku}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-mb-line">
                  <span className="text-base font-extrabold text-emerald-700 tabular-nums">
                    {formatAmt(it.unit_price)}
                  </span>
                  <span className="text-xs text-mb-ink">
                    {it.item_type === "PRODUCT" ? `${it.quantity_on_hand} ${it.unit}` : t.inventory.service}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Active Cart & Checkout */}
        <Card className="lg:col-span-5 p-5 flex flex-col justify-between h-fit sticky top-20">
          <div>
            <div className="flex items-center justify-between border-b border-mb-line pb-3 mb-4">
              <h2 className="text-base font-bold text-mb-cocoa flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-mb-amber-deep" />
                <span>{t.extras.cart}</span>
              </h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-mb-cream text-emerald-700">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-xs text-mb-ink/60">{t.extras.emptyCart}</div>
            ) : (
              <div className="space-y-2.5 mb-4 max-h-64 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.item_id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-mb-beige border border-mb-line">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-mb-cocoa truncate">{line.description}</div>
                      <div className="text-[11px] text-mb-ink tabular-nums">{formatAmt(line.unit_price)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQty(line.item_id, -1)}
                        className="p-1 rounded-md border border-mb-line bg-mb-paper hover:bg-mb-cream cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(line.item_id, 1)}
                        className="p-1 rounded-md border border-mb-line bg-mb-paper hover:bg-mb-cream cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCart(cart.filter((c) => c.item_id !== line.item_id))}
                        className="p-1 text-mb-ink/60 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 pt-3 border-t border-mb-line">
              <input
                placeholder={t.extras.walkInCustomer}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-mb-line text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-mb-ink mb-1">{t.extras.paymentMethod}</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                    className="w-full px-2.5 py-2 rounded-lg border border-mb-line text-xs bg-mb-paper font-semibold"
                  >
                    <option value="CASH">Cash (1000)</option>
                    <option value="MOBILE_MONEY">Telebirr / Mobile Money</option>
                    <option value="CARD">Card / POS Terminal</option>
                    <option value="BANK">Bank Transfer (1010)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-mb-ink mb-1">{t.sales.applyVat}</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-mb-line text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="bg-mb-cocoa text-mb-cream rounded-xl p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-mb-cream/70">
                  <span>{t.common.subtotal}</span>
                  <span className="tabular-nums">{formatAmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-mb-cream/70">
                  <span>{t.common.vat} ({vatRate}%)</span>
                  <span className="tabular-nums">{formatAmt(vatAmt)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-mb-cream/20 text-base font-extrabold text-mb-amber">
                  <span>{t.common.total}</span>
                  <span className="tabular-nums">{formatAmt(total)}</span>
                </div>
              </div>

              {canWrite && (
                <button
                  type="button"
                  disabled={cart.length === 0 || submitting}
                  onClick={() => void handleCompleteSale()}
                  className="w-full py-3 rounded-xl bg-mb-amber-deep hover:bg-mb-amber text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.extras.completeSale}</span>
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Recent POS Receipts */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-mb-line">
          <h2 className="text-sm font-bold text-mb-cocoa">{t.extras.recentPosSales}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mb-beige text-xs text-mb-ink uppercase border-b border-mb-line">
              <tr>
                <th className="px-4 py-2.5 text-start">{t.common.reference}</th>
                <th className="px-4 py-2.5 text-start">{t.common.date}</th>
                <th className="px-4 py-2.5 text-start">{t.sales.customer}</th>
                <th className="px-4 py-2.5 text-start">{t.extras.paymentMethod}</th>
                <th className="px-4 py-2.5 text-end">{t.common.total}</th>
                <th className="px-4 py-2.5 text-end">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mb-line">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-mb-ink/60">
                    {t.common.noData}
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="hover:bg-mb-cream/70">
                    <td className="px-4 py-3 font-mono font-bold text-mb-cocoa">{s.receipt_number}</td>
                    <td className="px-4 py-3 text-xs text-mb-ink">{formatDt(s.sale_date)}</td>
                    <td className="px-4 py-3 font-medium text-mb-cocoa">{s.customer_name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status="PAID" label={s.payment_method} />
                    </td>
                    <td className="px-4 py-3 text-end font-bold tabular-nums">{formatAmt(s.total)}</td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => setActiveReceipt(s)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-mb-line text-mb-cocoa hover:bg-mb-cream cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{t.common.print}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Thermal POS Receipt Modal */}
      <Modal
        open={!!activeReceipt}
        onClose={() => setActiveReceipt(null)}
        title={`${t.extras.posReceipt} — ${activeReceipt?.receipt_number || ""}`}
        maxWidth="max-w-sm"
      >
        {activeReceipt && activeCompany && (
          <div className="print-container font-mono text-xs space-y-3">
            <div className="text-center border-b border-dashed border-mb-line pb-3">
              <div className="text-base font-bold text-mb-cocoa">{activeCompany.name}</div>
              <div className="text-mb-ink">{t.common.tin}: {activeCompany.tin_number || "—"}</div>
              <div className="text-mb-ink mt-1">{activeReceipt.receipt_number} · {formatDt(activeReceipt.sale_date)}</div>
            </div>
            <div className="space-y-1.5 border-b border-dashed border-mb-line pb-3">
              {activeReceipt.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>{l.quantity}x {l.description}</span>
                  <span className="tabular-nums font-bold">{formatAmt(l.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>{t.common.subtotal}</span>
                <span>{formatAmt(activeReceipt.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.common.vat} ({activeReceipt.vat_rate}%)</span>
                <span>{formatAmt(activeReceipt.vat_amount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-mb-line">
                <span>{t.common.total}</span>
                <span>{formatAmt(activeReceipt.total)}</span>
              </div>
              <div className="text-center text-mb-ink pt-2">
                {t.extras.paymentMethod}: {activeReceipt.payment_method}
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full py-2 rounded-lg bg-mb-cocoa text-mb-cream font-sans font-semibold no-print cursor-pointer"
            >
              {t.common.print}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
