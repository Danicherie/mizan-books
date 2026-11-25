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
  Calendar,
  LogOut,
  Menu,
  X,
  Building2,
  Sparkles,
  Download,
} from "lucide-react";
import { MizanLockup, MizanMark } from "@/components/brand/MizanLogo";
import { LanguageSelector } from "@/components/LanguageSelector";
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
import { ReadOnlyBanner, SubscriptionNeeded, TrialBanner } from "./SubscriptionGate";

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
    subscription,
  } = useApp();

  const [mobileMenu, setMobileMenu] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setViewOnly(false);
  }, [activeCompany?.id, subscription?.status]);

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
    <div id="app-sidebar" className="flex flex-col h-full bg-mb-paper text-mb-cocoa w-64 shrink-0 select-none border-e border-mb-line shadow-[8px_0_30px_rgba(74,46,31,0.04)]">
      <div className="px-3 pt-3 pb-3 flex items-center gap-2 border-b border-mb-line">
        <div className="flex-1 min-w-0 rounded-2xl bg-mb-cream px-2.5 py-2">
          <MizanLockup name={t.appName} markClassName="h-9 w-9" nameClassName="text-[15px]" />
        </div>
        <button
          type="button"
          onClick={() => setMobileMenu(false)}
          className="lg:hidden p-2 rounded-xl text-mb-ink hover:bg-mb-cream hover:text-mb-cocoa focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa"
          aria-label={t.marketing.closeMenu}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label={t.appName}>
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-mb-ink">
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
                    aria-current={active ? "page" : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa ${
                      active
                        ? "bg-mb-amber text-mb-cocoa shadow-sm"
                        : "text-mb-ink hover:bg-mb-cream hover:text-mb-cocoa"
                    }`}
                  >
                    <span className="text-mb-cocoa">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-mb-line space-y-2">
        {installPrompt && (
          <button
            type="button"
            onClick={() => void handleInstallPwa()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-2xl bg-mb-cream border border-mb-line text-mb-cocoa hover:bg-mb-amber/40 text-xs font-semibold cursor-pointer"
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
            className="w-full flex items-center gap-2 p-2.5 rounded-2xl bg-mb-cream border border-mb-line text-start hover:border-mb-amber transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-mb-cocoa shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-mb-cocoa truncate">{t.auth.freeTrialBadge}</div>
              <div className="text-[10px] text-mb-ink truncate">
                {trialDaysLeft} {t.auth.trialDaysLeft}
              </div>
            </div>
          </button>
        )}

        <LanguageSelector lang={lang} onChange={setLang} label={t.marketing.languageLabel} fullWidth placement="up" />

        <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-mb-beige">
          <div className="min-w-0">
            <div className="text-xs font-bold text-mb-cocoa truncate">{user?.name}</div>
            <div className="text-[11px] text-mb-ink font-medium">{roleLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title={t.topbar.signOut}
            aria-label={t.topbar.signOut}
            className="p-2 rounded-xl text-mb-ink hover:text-mb-cocoa hover:bg-mb-paper transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa"
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
    <div className="mb-app min-h-screen flex bg-mb-beige text-mb-cocoa">
      <aside className="hidden lg:flex no-print sticky top-0 h-screen">{sidebarContent}</aside>

      {mobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden flex bg-[rgba(74,46,31,0.45)] backdrop-blur-[2px] no-print">
          {sidebarContent}
          <button type="button" className="flex-1 cursor-default" aria-label={t.marketing.closeMenu} onClick={() => setMobileMenu(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 min-h-16 bg-mb-beige/90 backdrop-blur border-b border-mb-line px-3 sm:px-6 py-2 flex items-center justify-between gap-2 sm:gap-3 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenu(true)}
              className="lg:hidden p-2 rounded-xl border border-mb-line bg-mb-paper text-mb-cocoa hover:bg-mb-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa"
              aria-expanded={mobileMenu}
              aria-controls="app-sidebar"
              aria-label={t.marketing.openMenu}
            >
              <Menu className="w-5 h-5" />
            </button>
            <MizanMark className="h-8 w-8 lg:hidden shrink-0" title={t.appName} />

            <div className="flex items-center gap-2 bg-mb-paper border border-mb-line rounded-2xl px-2.5 py-1.5 min-w-0 shadow-sm">
              <Building2 className="w-4 h-4 text-mb-cocoa shrink-0" />
              <select
                value={activeCompany?.id ?? ""}
                onChange={(e) => setActiveCompanyId(Number(e.target.value))}
                aria-label={t.topbar.company}
                className="bg-transparent text-xs sm:text-sm font-bold text-mb-cocoa focus:outline-none max-w-[120px] sm:max-w-[230px] truncate cursor-pointer"
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
                className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-mb-cream text-mb-cocoa border border-mb-line hover:bg-mb-amber/30 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-mb-cocoa" />
                <span>
                  {trialDaysLeft} {t.auth.trialDaysLeft}
                </span>
              </button>
            )}

            {user?.role === "viewer" && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-mb-cream text-mb-cocoa border border-mb-line">
                {t.topbar.readOnlyBadge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="hidden md:flex items-center bg-mb-cream p-0.5 rounded-full border border-mb-line text-xs">
              <Calendar className="w-3.5 h-3.5 text-mb-ink mx-1.5" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setCalendar("gregorian")}
                className={`px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  calendar === "gregorian" ? "bg-mb-paper text-mb-cocoa shadow-sm" : "text-mb-ink hover:text-mb-cocoa"
                }`}
              >
                {t.topbar.gregorian}
              </button>
              <button
                type="button"
                onClick={() => setCalendar("ethiopian")}
                className={`px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  calendar === "ethiopian" ? "bg-mb-amber text-mb-cocoa shadow-sm" : "text-mb-ink hover:text-mb-cocoa"
                }`}
              >
                {t.topbar.ethiopian}
              </button>
            </div>

            <LanguageSelector lang={lang} onChange={setLang} label={t.marketing.languageLabel} compact />
          </div>
        </header>

        <TrialBanner />
        {viewOnly && <ReadOnlyBanner />}

        {/* Active Module Viewport (extra bottom padding on mobile for bottom tab bar) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-7xl w-full mx-auto">
          {subscription && !subscription.canMutate && !viewOnly ? (
            <SubscriptionNeeded
              onContinue={() => {
                setViewOnly(true);
                setActiveTab("reports");
              }}
            />
          ) : (
            <>
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
            </>
          )}
        </main>
      </div>

      {/* Native-feeling Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-mb-paper/95 backdrop-blur border-t border-mb-line px-2 py-1.5 flex items-center justify-around no-print shadow-[0_-8px_24px_rgba(74,46,31,0.06)]" aria-label={t.appName}>
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
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-2xl min-w-[58px] transition-colors ${
                isActive ? "text-mb-cocoa font-bold bg-mb-cream" : "text-mb-ink font-medium"
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
