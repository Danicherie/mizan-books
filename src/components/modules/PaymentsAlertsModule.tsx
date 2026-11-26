"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CreditCard, Send, CheckCircle2, ExternalLink, MessageSquare, Sparkles } from "lucide-react";
import { useApp } from "../AppContext";
import { Card, Modal, PageHeader, StatusBadge } from "../ui";

interface PaymentTx {
  id: number;
  provider: "CHAPA" | "STRIPE";
  purpose: string;
  tx_ref: string;
  currency_code: string;
  amount: number;
  status: string;
  mode: string;
  checkout_url: string;
  created_at: string;
}

interface OpenInv {
  id: number;
  invoice_number: string;
  currency_code: string;
  total: number;
  amount_paid: number;
  due_date: string;
  customer_name: string;
}

interface AlertLog {
  id: number;
  channel: "TELEGRAM" | "SMS";
  recipient: string;
  entity_type: string;
  message: string;
  status: string;
  created_at: string;
}

export function PaymentsAlertsModule() {
  const { activeCompany, t, formatAmt, formatDt, canWrite, showToast, refreshSession } = useApp();
  const [subTab, setSubTab] = useState<"payments" | "alerts">("payments");

  const [providers, setProviders] = useState({ chapaLive: false, stripeLive: false });
  const [transactions, setTransactions] = useState<PaymentTx[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInv[]>([]);
  const [pendingCheckout, setPendingCheckout] = useState<{
    txRef: string;
    provider: string;
    currency: string;
    amount: number;
    mode: string;
    checkoutUrl: string;
    description: string;
  } | null>(null);

  const [alertConfig, setAlertConfig] = useState({
    telegramConfigured: false,
    smsConfigured: false,
    telegram_chat_id: "",
    sms_sender_id: "MizanBooks",
  });
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [channel, setChannel] = useState<"TELEGRAM" | "SMS">("TELEGRAM");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!activeCompany) return;
    const [pRes, aRes] = await Promise.all([
      fetch(`/api/payments?companyId=${activeCompany.id}`, { cache: "no-store" }),
      fetch(`/api/alerts?companyId=${activeCompany.id}`, { cache: "no-store" }),
    ]);
    const pData = (await pRes.json()) as {
      providers: { chapaLive: boolean; stripeLive: boolean };
      transactions: PaymentTx[];
      openInvoices: OpenInv[];
    };
    const aData = (await aRes.json()) as { config: typeof alertConfig; logs: AlertLog[] };
    setProviders(pData.providers || { chapaLive: false, stripeLive: false });
    setTransactions(pData.transactions || []);
    setOpenInvoices(pData.openInvoices || []);
    if (aData.config) {
      setAlertConfig(aData.config);
      if (!recipient && aData.config.telegram_chat_id) setRecipient(aData.config.telegram_chat_id);
    }
    setAlertLogs(aData.logs || []);
  }, [activeCompany, recipient]);

  useEffect(() => {
    void load();
  }, [load]);

  async function initPayment(params: {
    provider: "CHAPA" | "STRIPE";
    purpose: "INVOICE" | "SUBSCRIPTION";
    invoiceId?: number;
    planName?: "BUSINESS" | "ENTERPRISE";
  }) {
    if (!activeCompany) return;
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init_checkout", companyId: activeCompany.id, ...params }),
    });
    const json = (await res.json()) as {
      txRef?: string;
      provider?: string;
      currency?: string;
      amount?: number;
      mode?: string;
      checkoutUrl?: string;
      description?: string;
      error?: string;
    };
    if (!res.ok || !json.txRef) {
      showToast("error", json.error || t.common.error);
      return;
    }
    setPendingCheckout({
      txRef: json.txRef,
      provider: json.provider || params.provider,
      currency: json.currency || "ETB",
      amount: json.amount || 0,
      mode: json.mode || "SANDBOX",
      checkoutUrl: json.checkoutUrl || "",
      description: json.description || "",
    });
    void load();
  }

  async function completeSandboxPayment(txRef: string) {
    if (!activeCompany) return;
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete_sandbox", companyId: activeCompany.id, txRef }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setPendingCheckout(null);
    await refreshSession();
    void load();
  }

  async function saveAlertConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_config",
        companyId: activeCompany.id,
        telegram_chat_id: alertConfig.telegram_chat_id,
        sms_sender_id: alertConfig.sms_sender_id,
      }),
    });
    if (res.ok) {
      showToast("success", t.common.success);
      void load();
    }
  }

  async function sendAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_alert",
        companyId: activeCompany.id,
        channel,
        recipient,
        message,
        entity_type: "REMINDER",
      }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setMessage("");
    void load();
  }

  return (
    <div>
      <PageHeader title={t.extras.payAlertsTitle} subtitle={t.extras.payAlertsSubtitle} />

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setSubTab("payments")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
            subTab === "payments" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
          }`}
        >
          {t.extras.onlinePaymentsTab}
        </button>
        <button
          type="button"
          onClick={() => setSubTab("alerts")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
            subTab === "alerts" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"
          }`}
        >
          {t.extras.alertsTab}
        </button>
      </div>

      {subTab === "payments" ? (
        <div className="space-y-6">
          {/* Provider Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 border-emerald-200 bg-emerald-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Chapa (Ethiopia · ETB)</h3>
                  <p className="text-xs text-slate-600 mt-0.5">Telebirr, CBE Birr, Amole, Awash & Local Cards</p>
                </div>
                <StatusBadge
                  status={providers.chapaLive ? "PAID" : "PARTIAL"}
                  label={providers.chapaLive ? t.extras.liveMode : t.extras.sandboxMode}
                />
              </div>
              {canWrite && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void initPayment({ provider: "CHAPA", purpose: "SUBSCRIPTION", planName: "BUSINESS" })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Business Pro · Br 3,600/mo</span>
                  </button>
                </div>
              )}
            </Card>

            <Card className="p-5 border-indigo-200 bg-indigo-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Stripe (Global Cards · USD / EUR / AED)</h3>
                  <p className="text-xs text-slate-600 mt-0.5">Visa, Mastercard, Apple Pay & Subscriptions</p>
                </div>
                <StatusBadge
                  status={providers.stripeLive ? "PAID" : "PARTIAL"}
                  label={providers.stripeLive ? t.extras.liveMode : t.extras.sandboxMode}
                />
              </div>
              {canWrite && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void initPayment({ provider: "STRIPE", purpose: "SUBSCRIPTION", planName: "BUSINESS" })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Business Pro · $29/mo</span>
                  </button>
                </div>
              )}
            </Card>
          </div>

          {/* Open Invoices Ready for Online Payment */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">{t.dashboard.overdueInvoices}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-start">{t.sales.invoiceNumber}</th>
                    <th className="px-4 py-3 text-start">{t.sales.customer}</th>
                    <th className="px-4 py-3 text-end">{t.sales.balanceDue}</th>
                    <th className="px-4 py-3 text-end">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    openInvoices.map((inv) => {
                      const due = Math.max(0, Number((inv.total - inv.amount_paid).toFixed(2)));
                      return (
                        <tr key={inv.id}>
                          <td className="px-4 py-3 font-mono font-bold">{inv.invoice_number}</td>
                          <td className="px-4 py-3 font-medium">{inv.customer_name}</td>
                          <td className="px-4 py-3 text-end font-bold tabular-nums">{formatAmt(due, inv.currency_code)}</td>
                          <td className="px-4 py-3 text-end whitespace-nowrap">
                            {canWrite && (
                              <div className="inline-flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void initPayment({ provider: "CHAPA", purpose: "INVOICE", invoiceId: inv.id })}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                                >
                                  {t.extras.payWithChapa}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void initPayment({ provider: "STRIPE", purpose: "INVOICE", invoiceId: inv.id })}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                                >
                                  {t.extras.payWithStripe}
                                </button>
                              </div>
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

          {/* Payment Transactions Log */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">{t.extras.onlinePaymentsTab}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-start">{t.common.reference}</th>
                    <th className="px-4 py-2.5 text-start">Provider</th>
                    <th className="px-4 py-2.5 text-end">{t.common.amount}</th>
                    <th className="px-4 py-2.5 text-center">{t.common.status}</th>
                    <th className="px-4 py-2.5 text-end">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        {t.common.noData}
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">{tx.tx_ref}</td>
                        <td className="px-4 py-3 font-bold">
                          {tx.provider} <span className="text-slate-400 font-normal">({tx.mode})</span>
                        </td>
                        <td className="px-4 py-3 text-end font-bold tabular-nums">
                          {formatAmt(tx.amount, tx.currency_code)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={tx.status === "COMPLETED" ? "PAID" : "PARTIAL"} label={tx.status} />
                        </td>
                        <td className="px-4 py-3 text-end">
                          {canWrite && tx.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => void completeSandboxPayment(tx.tx_ref)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold cursor-pointer"
                            >
                              {t.extras.simulateSuccess}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Config + Send Alert */}
          <div className="space-y-6">
            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>{t.extras.telegramSettings}</span>
              </h3>
              <form onSubmit={saveAlertConfig} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t.extras.telegramChatId}</label>
                  <input
                    value={alertConfig.telegram_chat_id}
                    onChange={(e) => setAlertConfig({ ...alertConfig, telegram_chat_id: e.target.value })}
                    placeholder="@my_company_channel or 123456789"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Telegram Bot: <strong>{alertConfig.telegramConfigured ? t.extras.liveMode : t.extras.sandboxMode}</strong> ·
                    SMS Gateway: <strong>{alertConfig.smsConfigured ? t.extras.liveMode : t.extras.sandboxMode}</strong>
                  </span>
                  {canWrite && (
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer"
                    >
                      {t.common.save}
                    </button>
                  )}
                </div>
              </form>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3">{t.extras.sendTestAlert}</h3>
              <form onSubmit={sendAlert} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Channel</label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as "TELEGRAM" | "SMS")}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    >
                      <option value="TELEGRAM">Telegram</option>
                      <option value="SMS">SMS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {channel === "SMS" ? t.extras.smsPhone : t.extras.telegramChatId}
                    </label>
                    <input
                      required
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder={channel === "SMS" ? "+251 911 000 000" : "@customer_chat"}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.description}</label>
                  <textarea
                    required
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Reminder: Your invoice is due. Pay online via Chapa or Bank Transfer."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                {canWrite && (
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{t.extras.sendTestAlert}</span>
                  </button>
                )}
              </form>
            </Card>
          </div>

          {/* Sent Notification Log */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">{t.extras.sentAlertsLog}</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {alertLogs.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">{t.common.noData}</div>
              ) : (
                alertLogs.map((l) => (
                  <div key={l.id} className="p-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-900">
                        {l.channel} → {l.recipient}
                      </span>
                      <StatusBadge status={l.status === "SENT" ? "PAID" : "SENT"} label={l.status} />
                    </div>
                    <p className="text-xs text-slate-600">{l.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{formatDt(l.created_at.slice(0, 10))}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Checkout Modal (Live link or 1-click Sandbox Settlement) */}
      <Modal
        open={!!pendingCheckout}
        onClose={() => setPendingCheckout(null)}
        title={`${pendingCheckout?.provider || ""} Checkout`}
        maxWidth="max-w-md"
      >
        {pendingCheckout && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-sm">
              <div className="text-xs font-mono text-slate-500">{pendingCheckout.txRef}</div>
              <div className="font-bold text-slate-900">{pendingCheckout.description}</div>
              <div className="text-2xl font-extrabold text-emerald-700 tabular-nums pt-1">
                {formatAmt(pendingCheckout.amount, pendingCheckout.currency)}
              </div>
            </div>

            {pendingCheckout.checkoutUrl ? (
              <a
                href={pendingCheckout.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <span>Open Live {pendingCheckout.provider} Checkout</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void completeSandboxPayment(pendingCheckout.txRef)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.extras.simulateSuccess}</span>
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
