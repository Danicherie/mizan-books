"use client";

import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  FileSpreadsheet,
  Users,
  FileText,
  Truck,
  Receipt,
  Package,
  BadgeDollarSign,
  BarChart3,
  Settings,
  Scale,
  Calendar,
  LogOut,
  Menu,
  X,
  Building2,
  Sparkles,
  Download,
} from "lucide-react";
import { LANGUAGES } from "@/lib/i18n";
import { useApp, type ActiveTab } from "./AppContext";
import { ToastBanner } from "./ui";
import { DashboardModule } from "./modules/DashboardModule";
import { ChartOfAccountsModule } from "./modules/ChartOfAccountsModule";
import { JournalEntriesModule } from "./modules/JournalEntriesModule";
import { ContactsModule } from "./modules/ContactsModule";
import { InvoicesModule } from "./modules/InvoicesModule";
import { BillsModule } from "./modules/BillsModule";
import { InventoryModule } from "./modules/InventoryModule";
import { PayrollTaxModule } from "./modules/PayrollTaxModule";
import { ReportsModule } from "./modules/ReportsModule";
import { SettingsModule } from "./modules/SettingsModule";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function AppShell() {
  const {
    user,
    companies,
    activeCompany,
    setActiveCompanyId,
    lang,
    setLang,
    calendar,
    setCalendar,
    t,
    activeTab,
    setActiveTab,
    logout,
    toast,
    trialDaysLeft,
  } = useApp();

  const [mobileMenu, setMobileMenu] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstallPwa() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  const navGroups: Array<{
    label: string;
    items: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }>;
  }> = [
    {
      label: t.nav.overview,
      items: [{ id: "dashboard", label: t.nav.dashboard, icon: <LayoutDashboard className="w-4 h-4" /> }],
    },
    {
      label: t.nav.bankingGl,
      items: [
        { id: "coa", label: t.nav.chartOfAccounts, icon: <FileSpreadsheet className="w-4 h-4" /> },
        { id: "journals", label: t.nav.journalEntries, icon: <BookOpen className="w-4 h-4" /> },
      ],
    },
    {
      label: t.nav.sales,
      items: [
        { id: "customers", label: t.nav.customers, icon: <Users className="w-4 h-4" /> },
        { id: "invoices", label: t.nav.invoices, icon: <FileText className="w-4 h-4" /> },
      ],
    },
    {
      label: t.nav.purchases,
      items: [
        { id: "vendors", label: t.nav.vendors, icon: <Truck className="w-4 h-4" /> },
        { id: "bills", label: t.nav.bills, icon: <Receipt className="w-4 h-4" /> },
      ],
    },
    {
      label: t.nav.operations,
      items: [
        { id: "inventory", label: t.nav.inventory, icon: <Package className="w-4 h-4" /> },
        { id: "payroll", label: t.nav.payrollTax, icon: <BadgeDollarSign className="w-4 h-4" /> },
      ],
    },
    {
      label: t.nav.reports,
      items: [
        { id: "reports", label: t.nav.financialReports, icon: <BarChart3 className="w-4 h-4" /> },
        { id: "settings", label: t.nav.settings, icon: <Settings className="w-4 h-4" /> },
      ],
    },
  ];

  const roleLabel =
    user?.role === "admin"
      ? t.topbar.roleAdmin
      : user?.role === "accountant"
      ? t.topbar.roleAccountant
      : t.topbar.roleViewer;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 w-64 shrink-0 select-none">
      {/* Brand */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Scale className="w-5 h-5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-base leading-tight truncate">{t.appName}</div>
            <div className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">Sage-Class ERP</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenu(false)}
          className="lg:hidden p-1 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                      active
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-950/50"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    <span className={active ? "text-white" : "text-slate-400"}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Install PWA Prompt (if available) + Trial Pill + User Card */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        {installPrompt && (
          <button
            type="button"
            onClick={() => void handleInstallPwa()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.auth.installMobileApp}</span>
          </button>
        )}

        {trialDaysLeft !== null && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("settings");
              setMobileMenu(false);
            }}
            className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800/70 text-start hover:border-emerald-500 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-emerald-300 truncate">{t.auth.freeTrialBadge}</div>
              <div className="text-[10px] text-emerald-200/80 truncate">
                {trialDaysLeft} {t.auth.trialDaysLeft}
              </div>
            </div>
          </button>
        )}

        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{user?.name}</div>
            <div className="text-[11px] text-emerald-400 font-medium">{roleLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title={t.topbar.signOut}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const mobileBottomItems: Array<{ id: ActiveTab | "menu"; label: string; icon: React.ReactNode }> = [
    { id: "dashboard", label: t.nav.dashboard, icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: "invoices", label: t.nav.invoices, icon: <FileText className="w-5 h-5" /> },
    { id: "bills", label: t.nav.bills, icon: <Receipt className="w-5 h-5" /> },
    { id: "reports", label: t.nav.financialReports, icon: <BarChart3 className="w-5 h-5" /> },
    { id: "menu", label: t.nav.settings, icon: <Menu className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex no-print sticky top-0 h-screen">{sidebarContent}</aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden flex bg-slate-950/60 backdrop-blur-[1px] no-print">
          {sidebarContent}
          <div className="flex-1" onClick={() => setMobileMenu(false)} />
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Utility Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenu(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Company Switcher */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 min-w-0">
              <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <select
                value={activeCompany?.id ?? ""}
                onChange={(e) => setActiveCompanyId(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-none max-w-[140px] sm:max-w-[230px] truncate cursor-pointer"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.base_currency})
                  </option>
                ))}
              </select>
            </div>

            {trialDaysLeft !== null && (
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>
                  {trialDaysLeft} {t.auth.trialDaysLeft}
                </span>
              </button>
            )}

            {user?.role === "viewer" && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                {t.topbar.readOnlyBadge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Calendar Toggle (Gregorian / Ethiopian) */}
            <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500 mx-1.5" />
              <button
                type="button"
                onClick={() => setCalendar("gregorian")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  calendar === "gregorian" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.topbar.gregorian}
              </button>
              <button
                type="button"
                onClick={() => setCalendar("ethiopian")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  calendar === "ethiopian" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.topbar.ethiopian}
              </button>
            </div>

            {/* 5-Language Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] sm:text-xs">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  title={l.label}
                  className={`px-1.5 sm:px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    lang === l.code
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {l.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Active Module Viewport (extra bottom padding on mobile for bottom tab bar) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
          {activeTab === "dashboard" && <DashboardModule />}
          {activeTab === "coa" && <ChartOfAccountsModule />}
          {activeTab === "journals" && <JournalEntriesModule />}
          {activeTab === "customers" && <ContactsModule mode="customers" />}
          {activeTab === "invoices" && <InvoicesModule />}
          {activeTab === "vendors" && <ContactsModule mode="vendors" />}
          {activeTab === "bills" && <BillsModule />}
          {activeTab === "inventory" && <InventoryModule />}
          {activeTab === "payroll" && <PayrollTaxModule />}
          {activeTab === "reports" && <ReportsModule />}
          {activeTab === "settings" && <SettingsModule />}
        </main>
      </div>

      {/* Native-feeling Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-2 py-1.5 flex items-center justify-around no-print shadow-lg">
        {mobileBottomItems.map((item) => {
          const isActive = item.id !== "menu" && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "menu") {
                  setMobileMenu(true);
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl min-w-[58px] transition-colors ${
                isActive ? "text-emerald-700 font-bold" : "text-slate-500 font-medium"
              }`}
            >
              {item.icon}
              <span className="text-[10px] truncate max-w-[64px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <ToastBanner toast={toast} />
    </div>
  );
}
