"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Building2, RefreshCw, Shield, Sparkles, CheckCircle2 } from "lucide-react";
import { SUPPORTED_CURRENCIES, TAX_REGIMES } from "@/lib/currency";
import { useApp, type Company } from "../AppContext";
import { Card, Modal, PageHeader, StatusBadge } from "../ui";

interface FxRate {
  id: number;
  currency_code: string;
  rate_to_base: number;
  updated_at: string;
}

interface UserItem {
  id: number;
  name: string;
  email: string;
  role: string;
  preferred_lang: string;
  created_at: string;
}

interface AuditLogItem {
  id: number;
  action: string;
  entity_type: string;
  details: string;
  user_name: string | null;
  created_at: string;
}

export function SettingsModule() {
  const { activeCompany, setActiveCompanyId, t, formatDt, isAdmin, refreshSession, showToast, trialDaysLeft } = useApp();
  const [subTab, setSubTab] = useState<"companies" | "subscription" | "fx" | "users" | "audit">("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rates, setRates] = useState<FxRate[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [openNewComp, setOpenNewComp] = useState(false);
  const [openNewUser, setOpenNewUser] = useState(false);
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});

  const [compForm, setCompForm] = useState({
    name: "",
    legal_name: "",
    tin_number: "",
    base_currency: "ETB",
    country: "Ethiopia",
    tax_regime: "ET_STANDARD",
    default_vat_rate: "15",
    default_wht_rate: "2",
    address: "",
  });

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "accountant" as "admin" | "accountant" | "viewer",
  });

  const load = useCallback(async () => {
    if (!activeCompany) {
      setCompanies([]);
      setRates([]);
      setUsers([]);
      setAuditLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/settings?companyId=${activeCompany.id}`, { cache: "no-store" });
    const data = (await res.json()) as {
      companies: Company[];
      exchangeRates: FxRate[];
      users: UserItem[];
      auditLogs: AuditLogItem[];
    };
    setCompanies(data.companies || []);
    setRates(data.exchangeRates || []);
    setUsers(data.users || []);
    setAuditLogs(data.auditLogs || []);
    const editMap: Record<string, string> = {};
    for (const r of data.exchangeRates || []) {
      editMap[r.currency_code] = String(r.rate_to_base);
    }
    setRateEdits(editMap);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...compForm,
        default_vat_rate: parseFloat(compForm.default_vat_rate) || 0,
        default_wht_rate: parseFloat(compForm.default_wht_rate) || 0,
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return;
    }
    const created = (await res.json()) as { company: Company };
    showToast("success", t.common.success);
    setOpenNewComp(false);
    await refreshSession();
    if (created.company?.id) setActiveCompanyId(created.company.id);
    void load();
  }

  async function handleUpdateRate(code: string) {
    if (!activeCompany) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_rate",
        companyId: activeCompany.id,
        currency_code: code,
        rate_to_base: parseFloat(rateEdits[code]),
      }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    void load();
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_user", companyId: activeCompany.id, ...userForm }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", err.error || t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setOpenNewUser(false);
    setUserForm({ name: "", email: "", password: "", role: "accountant" });
    void load();
  }

  async function handleSelectPlan(planName: "FREE_TRIAL" | "BUSINESS" | "ENTERPRISE") {
    if (!activeCompany) return;
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompany.id, plan_name: planName }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    await refreshSession();
    void load();
  }

  return (
    <div>
      <PageHeader
        title={t.settings.title}
        subtitle={t.settings.subtitle}
        actions={
          isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setOpenNewComp(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.settings.createCompany}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenNewUser(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.settings.addUser}</span>
              </button>
            </>
          )
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ["companies", t.settings.companyTab],
            ["subscription", t.auth.subscriptionTab],
            ["fx", t.settings.currenciesTab],
            ["users", t.settings.usersTab],
            ["audit", t.settings.auditLogTab],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSubTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              subTab === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">{t.common.loading}</div>
      ) : subTab === "companies" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((c) => {
            const isActive = c.id === activeCompany?.id;
            return (
              <Card
                key={c.id}
                className={`p-5 ${isActive ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{c.name}</h3>
                      <p className="text-xs text-slate-500">{c.legal_name}</p>
                    </div>
                  </div>
                  {isActive ? (
                    <StatusBadge status="ACTIVE" label={t.common.active} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveCompanyId(c.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      {t.topbar.company}
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div>
                    <span className="text-slate-400">{t.settings.baseCurrency}:</span> <strong>{c.base_currency}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">{t.common.tin}:</span> <strong>{c.tin_number || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">{t.common.vat}:</span> <strong>{c.default_vat_rate}%</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">{t.common.wht}:</span> <strong>{c.default_wht_rate}%</strong>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : subTab === "subscription" ? (
        <div className="space-y-6">
          <Card className="p-6 bg-gradient-to-r from-emerald-950 to-slate-900 text-white border-emerald-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="w-4 h-4" />
                  <span>{activeCompany?.plan_name || "FREE_TRIAL"}</span>
                </div>
                <h3 className="text-xl font-bold mt-1">
                  {trialDaysLeft !== null
                    ? `${trialDaysLeft} ${t.auth.trialDaysLeft}`
                    : `${t.auth.activePlan}: ${activeCompany?.plan_name}`}
                </h3>
                {activeCompany?.trial_ends_at && trialDaysLeft !== null && (
                  <p className="text-xs text-emerald-200/80 mt-1">
                    {t.auth.trialEndsOn}: {formatDt(activeCompany.trial_ends_at.slice(0, 10))}
                  </p>
                )}
              </div>
              <StatusBadge status="ACTIVE" label={activeCompany?.subscription_status || "TRIALING"} />
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                id: "FREE_TRIAL" as const,
                name: "30-Day Free Trial",
                price: "$0 / 30 days",
                features: ["All accounting modules", "5 Languages + Arabic RTL", "Ethiopian & Gregorian Calendar", "Web + Mobile App"],
              },
              {
                id: "BUSINESS" as const,
                name: "Business Pro",
                price: "$29 / month",
                features: ["Up to 3 companies", "Unlimited invoices, bills & payroll", "Multi-currency + VAT/WHT", "Priority support"],
              },
              {
                id: "ENTERPRISE" as const,
                name: "Enterprise ERP",
                price: "$79 / month",
                features: ["Unlimited companies & users", "Role-based audit controls", "Custom tax regimes & API access", "Dedicated onboarding"],
              },
            ].map((plan) => {
              const current = (activeCompany?.plan_name || "FREE_TRIAL") === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={`p-5 flex flex-col justify-between ${
                    current ? "border-emerald-500 ring-2 ring-emerald-500/20" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900">{plan.name}</h4>
                      {current && <StatusBadge status="ACTIVE" label={t.auth.activePlan} />}
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-700 mt-2">{plan.price}</div>
                    <ul className="mt-4 space-y-2 text-xs text-slate-600">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {isAdmin && !current && (
                    <button
                      type="button"
                      onClick={() => handleSelectPlan(plan.id)}
                      className="mt-5 w-full py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                    >
                      {t.auth.upgradePlan}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ) : subTab === "fx" ? (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            {t.settings.baseCurrency}: <strong className="text-slate-900">{activeCompany?.base_currency}</strong>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-start">{t.common.currency}</th>
                  <th className="px-4 py-3 text-start">{t.settings.rateToBase} (1 Unit → {activeCompany?.base_currency})</th>
                  <th className="px-4 py-3 text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{r.currency_code}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.0001"
                        disabled={!isAdmin || r.currency_code === activeCompany?.base_currency}
                        value={rateEdits[r.currency_code] ?? r.rate_to_base}
                        onChange={(e) => setRateEdits({ ...rateEdits, [r.currency_code]: e.target.value })}
                        className="w-40 px-3 py-1.5 rounded-lg border border-slate-300 text-sm tabular-nums disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-4 py-3 text-end">
                      {isAdmin && r.currency_code !== activeCompany?.base_currency && (
                        <button
                          type="button"
                          onClick={() => handleUpdateRate(r.currency_code)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{t.settings.updateRate}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : subTab === "users" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-start">{t.common.name}</th>
                  <th className="px-4 py-3 text-start">{t.common.email}</th>
                  <th className="px-4 py-3 text-start">{t.settings.role}</th>
                  <th className="px-4 py-3 text-start">{t.topbar.language}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <Shield className="w-3 h-3" />
                        {u.role === "admin" ? t.topbar.roleAdmin : u.role === "accountant" ? t.topbar.roleAccountant : t.topbar.roleViewer}
                      </span>
                    </td>
                    <td className="px-4 py-3 uppercase text-xs font-mono text-slate-500">{u.preferred_lang}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-start">{t.common.date}</th>
                  <th className="px-4 py-3 text-start">{t.common.name}</th>
                  <th className="px-4 py-3 text-start">{t.common.actions}</th>
                  <th className="px-4 py-3 text-start">{t.common.description}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{formatDt(l.created_at.slice(0, 10))}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{l.user_name || "System"}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-emerald-700">{l.action}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Company Modal */}
      <Modal open={openNewComp} onClose={() => setOpenNewComp(false)} title={t.settings.createCompany}>
        <form onSubmit={handleCreateCompany} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.companyName} *</label>
              <input required value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.legalName}</label>
              <input value={compForm.legal_name} onChange={(e) => setCompForm({ ...compForm, legal_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.baseCurrency}</label>
              <select value={compForm.base_currency} onChange={(e) => setCompForm({ ...compForm, base_currency: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.taxRegime}</label>
              <select
                value={compForm.tax_regime}
                onChange={(e) => {
                  const found = TAX_REGIMES.find((tr) => tr.code === e.target.value);
                  setCompForm({
                    ...compForm,
                    tax_regime: e.target.value,
                    default_vat_rate: String(found?.defaultVat ?? 15),
                    default_wht_rate: String(found?.defaultWht ?? 0),
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {TAX_REGIMES.map((tr) => (
                  <option key={tr.code} value={tr.code}>
                    {tr.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.tin}</label>
              <input value={compForm.tin_number} onChange={(e) => setCompForm({ ...compForm, tin_number: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.country}</label>
              <input value={compForm.country} onChange={(e) => setCompForm({ ...compForm, country: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setOpenNewComp(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
              {t.common.create}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add User Modal */}
      <Modal open={openNewUser} onClose={() => setOpenNewUser(false)} title={t.settings.addUser} maxWidth="max-w-md">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.name} *</label>
            <input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t.common.email} *</label>
            <input type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.password} *</label>
            <input type="password" required value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.role}</label>
            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as "admin" | "accountant" | "viewer" })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
              <option value="admin">{t.topbar.roleAdmin}</option>
              <option value="accountant">{t.topbar.roleAccountant}</option>
              <option value="viewer">{t.topbar.roleViewer}</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setOpenNewUser(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
              {t.common.create}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
