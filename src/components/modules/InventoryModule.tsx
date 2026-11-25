"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, SlidersHorizontal, Package, AlertTriangle, DollarSign } from "lucide-react";
import { useApp } from "../AppContext";
import { Card, KpiCard, Modal, PageHeader, StatusBadge } from "../ui";

interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  item_type: "PRODUCT" | "SERVICE";
  unit: string;
  unit_cost: number;
  unit_price: number;
  quantity_on_hand: number;
  reorder_level: number;
}

export function InventoryModule() {
  const { activeCompany, t, formatAmt, canWrite, showToast } = useApp();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);

  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "General",
    item_type: "PRODUCT" as "PRODUCT" | "SERVICE",
    unit: "pcs",
    unit_cost: "0",
    unit_price: "0",
    quantity_on_hand: "0",
    reorder_level: "5",
  });

  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const res = await fetch(`/api/inventory?companyId=${activeCompany.id}`, { cache: "no-store" });
    const data = (await res.json()) as { items: InventoryItem[] };
    setItems(data.items || []);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalStockValue = items
    .filter((i) => i.item_type === "PRODUCT")
    .reduce((s, i) => s + i.quantity_on_hand * i.unit_cost, 0);
  const lowStockCount = items.filter((i) => i.item_type === "PRODUCT" && i.quantity_on_hand <= i.reorder_level).length;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompany.id,
        ...form,
        unit_cost: parseFloat(form.unit_cost) || 0,
        unit_price: parseFloat(form.unit_price) || 0,
        quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
        reorder_level: parseFloat(form.reorder_level) || 0,
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setOpenAdd(false);
    setForm({ sku: "", name: "", category: "General", item_type: "PRODUCT", unit: "pcs", unit_cost: "0", unit_price: "0", quantity_on_hand: "0", reorder_level: "5" });
    void load();
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustItem) return;
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: adjustItem.id, delta: parseFloat(delta), reason }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setAdjustItem(null);
    setDelta("0");
    setReason("");
    void load();
  }

  return (
    <div>
      <PageHeader
        title={t.inventory.title}
        subtitle={t.inventory.subtitle}
        actions={
          canWrite && (
            <button
              type="button"
              onClick={() => setOpenAdd(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.inventory.newItem}</span>
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label={t.inventory.title} value={String(items.length)} icon={<Package className="w-5 h-5" />} tone="blue" />
        <KpiCard label={t.inventory.stockValue} value={formatAmt(totalStockValue)} icon={<DollarSign className="w-5 h-5" />} tone="emerald" />
        <KpiCard label={t.dashboard.lowStockItems} value={String(lowStockCount)} icon={<AlertTriangle className="w-5 h-5" />} tone={lowStockCount > 0 ? "rose" : "emerald"} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mb-beige text-xs text-mb-ink uppercase border-b border-mb-line">
              <tr>
                <th className="px-4 py-3 text-start">{t.inventory.sku}</th>
                <th className="px-4 py-3 text-start">{t.common.name}</th>
                <th className="px-4 py-3 text-start">{t.inventory.itemType}</th>
                <th className="px-4 py-3 text-end">{t.common.unitCost}</th>
                <th className="px-4 py-3 text-end">{t.common.unitPrice}</th>
                <th className="px-4 py-3 text-end">{t.inventory.qtyOnHand}</th>
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
              ) : (
                items.map((it) => {
                  const isLow = it.item_type === "PRODUCT" && it.quantity_on_hand <= it.reorder_level;
                  return (
                    <tr key={it.id} className="hover:bg-mb-cream/70">
                      <td className="px-4 py-3 font-mono font-bold text-mb-cocoa">{it.sku}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-mb-cocoa">{it.name}</div>
                        <div className="text-xs text-mb-ink/70">{it.category}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-mb-ink">
                        {it.item_type === "PRODUCT" ? t.inventory.product : t.inventory.service}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{formatAmt(it.unit_cost)}</td>
                      <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatAmt(it.unit_price)}</td>
                      <td className="px-4 py-3 text-end font-bold tabular-nums">
                        {it.item_type === "PRODUCT" ? `${it.quantity_on_hand} ${it.unit}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {it.item_type === "PRODUCT" ? (
                          <StatusBadge
                            status={isLow ? "LOW_STOCK" : "IN_STOCK"}
                            label={isLow ? t.inventory.lowStock : t.inventory.inStock}
                          />
                        ) : (
                          <StatusBadge status="ACTIVE" label={t.inventory.service} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {canWrite && it.item_type === "PRODUCT" && (
                          <button
                            type="button"
                            onClick={() => setAdjustItem(it)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-mb-line text-mb-ink hover:bg-mb-cream cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>{t.inventory.adjustStock}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Item Modal */}
      <Modal open={openAdd} onClose={() => setOpenAdd(false)} title={t.inventory.newItem}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.sku} *</label>
              <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.itemType}</label>
              <select value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value as "PRODUCT" | "SERVICE" })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm bg-mb-paper">
                <option value="PRODUCT">{t.inventory.product}</option>
                <option value="SERVICE">{t.inventory.service}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.name} *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.category}</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.unit}</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.unitCost}</label>
              <input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.common.unitPrice}</label>
              <input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            {form.item_type === "PRODUCT" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.qtyOnHand}</label>
                  <input type="number" step="0.01" value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.reorderLevel}</label>
                  <input type="number" step="0.01" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
            <button type="button" onClick={() => setOpenAdd(false)} className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer">
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal open={!!adjustItem} onClose={() => setAdjustItem(null)} title={`${t.inventory.adjustStock} — ${adjustItem?.name || ""}`} maxWidth="max-w-md">
        {adjustItem && (
          <form onSubmit={handleAdjust} className="space-y-4">
            <div className="text-xs text-mb-ink">
              {t.inventory.qtyOnHand}: <strong>{adjustItem.quantity_on_hand} {adjustItem.unit}</strong>
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.adjustmentQty}</label>
              <input type="number" step="1" required value={delta} onChange={(e) => setDelta(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.inventory.adjustmentReason}</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Restock / Physical count" className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
              <button type="button" onClick={() => setAdjustItem(null)} className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer">
                {t.common.cancel}
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer">
                {t.common.confirm}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
