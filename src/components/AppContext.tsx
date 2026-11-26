"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getDictionary, isRtl, type Dictionary, type Lang } from "@/lib/i18n";
import { formatDate, type CalendarSystem } from "@/lib/calendar";
import { formatMoney } from "@/lib/currency";

export interface Company {
  id: number;
  name: string;
  legal_name: string;
  tin_number: string;
  base_currency: string;
  country: string;
  tax_regime: string;
  default_vat_rate: number;
  default_wht_rate: number;
  address: string;
  phone: string;
  email: string;
  plan_name?: string;
  subscription_status?: string;
  trial_starts_at?: string;
  trial_ends_at?: string;
}

export interface UserSession {
  id: number;
  name: string;
  email: string;
  role: "admin" | "accountant" | "viewer";
  preferred_lang: string;
  preferred_calendar: string;
}

export type ActiveTab =
  | "dashboard"
  | "coa"
  | "journals"
  | "reconciliation"
  | "customers"
  | "invoices"
  | "pos"
  | "vendors"
  | "bills"
  | "inventory"
  | "payroll"
  | "budgets"
  | "paymentsAlerts"
  | "reports"
  | "settings";

interface AppContextValue {
  user: UserSession | null;
  loadingAuth: boolean;
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (id: number) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
  calendar: CalendarSystem;
  setCalendar: (cal: CalendarSystem) => void;
  dir: "ltr" | "rtl";
  t: Dictionary;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  formatAmt: (val: number | null | undefined, currency?: string, compact?: boolean) => string;
  formatDt: (iso: string | null | undefined) => string;
  canWrite: boolean;
  isAdmin: boolean;
  toast: { type: "success" | "error"; message: string } | null;
  showToast: (type: "success" | "error", message: string) => void;
  trialDaysLeft: number | null;
  demoLoginEnabled: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<number>(1);
  const [lang, setLangState] = useState<Lang>("en");
  const [calendar, setCalendarState] = useState<CalendarSystem>("gregorian");
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [demoLoginEnabled, setDemoLoginEnabled] = useState(true);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const savedLang = window.localStorage.getItem("mizan_lang") as Lang | null;
    const savedCal = window.localStorage.getItem("mizan_cal") as CalendarSystem | null;
    const savedComp = window.localStorage.getItem("mizan_company_id");
    if (savedLang && ["en", "am", "om", "so", "ar"].includes(savedLang)) {
      setLangState(savedLang);
    }
    if (savedCal && ["gregorian", "ethiopian"].includes(savedCal)) {
      setCalendarState(savedCal);
    }
    if (savedComp && Number(savedComp)) {
      setActiveCompanyIdState(Number(savedComp));
    }
  }, []);

  const dir: "ltr" | "rtl" = isRtl(lang) ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as {
        user: UserSession | null;
        companies: Company[];
        demoLoginEnabled?: boolean;
      };
      setUser(data.user);
      setCompanies(data.companies || []);
      if (typeof data.demoLoginEnabled === "boolean") {
        setDemoLoginEnabled(data.demoLoginEnabled);
      }
      if (data.companies?.length) {
        setActiveCompanyIdState((prev) =>
          data.companies.some((c) => c.id === prev) ? prev : data.companies[0].id
        );
      }
    } catch {
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const setLang = useCallback(
    (nextLang: Lang) => {
      setLangState(nextLang);
      window.localStorage.setItem("mizan_lang", nextLang);
      if (user) {
        void fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferred_lang: nextLang }),
        });
      }
    },
    [user]
  );

  const setCalendar = useCallback(
    (nextCal: CalendarSystem) => {
      setCalendarState(nextCal);
      window.localStorage.setItem("mizan_cal", nextCal);
      if (user) {
        void fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferred_calendar: nextCal }),
        });
      }
    },
    [user]
  );

  const setActiveCompanyId = useCallback((id: number) => {
    setActiveCompanyIdState(id);
    window.localStorage.setItem("mizan_company_id", String(id));
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setActiveTab("dashboard");
  }, []);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;
  const t = getDictionary(lang);

  const trialDaysLeft = (() => {
    if (!activeCompany?.trial_ends_at) return 30;
    if (activeCompany.subscription_status === "ACTIVE" && activeCompany.plan_name !== "FREE_TRIAL") {
      return null;
    }
    const ms = new Date(activeCompany.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  })();

  const formatAmt = useCallback(
    (val: number | null | undefined, currency?: string, compact = false) =>
      formatMoney(val, currency || activeCompany?.base_currency || "ETB", compact),
    [activeCompany]
  );

  const formatDt = useCallback(
    (iso: string | null | undefined) => formatDate(iso, calendar, lang),
    [calendar, lang]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        loadingAuth,
        companies,
        activeCompany,
        setActiveCompanyId,
        lang,
        setLang,
        calendar,
        setCalendar,
        dir,
        t,
        activeTab,
        setActiveTab,
        refreshSession,
        logout,
        formatAmt,
        formatDt,
        canWrite: user?.role === "admin" || user?.role === "accountant",
        isAdmin: user?.role === "admin",
        toast,
        showToast,
        trialDaysLeft,
        demoLoginEnabled,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
