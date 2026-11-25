"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  Globe,
  ArrowRight,
  Calculator,
  Eye,
  Sparkles,
  CheckCircle2,
  Smartphone,
} from "lucide-react";
import { MizanLockup } from "@/components/brand/MizanLogo";
import { LANGUAGES } from "@/lib/i18n";
import { SUPPORTED_CURRENCIES, TAX_REGIMES } from "@/lib/currency";
import { useApp } from "./AppContext";

export function LoginView() {
  const { lang, setLang, t, refreshSession, setActiveCompanyId, demoLoginEnabled } = useApp();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("signup") === "1") {
      setMode("signup");
    }
  }, []);

  // Sign In state
  const [email, setEmail] = useState("admin@mizanbooks.com");
  const [password, setPassword] = useState("password123");

  // Sign Up (30-Day Free Trial) state
  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("ETB");
  const [taxRegime, setTaxRegime] = useState("ET_STANDARD");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t.auth.invalidCreds);
        return;
      }
      await refreshSession();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          email: signupEmail,
          password: signupPassword,
          company_name: companyName,
          base_currency: baseCurrency,
          tax_regime: taxRegime,
          preferred_lang: lang,
        }),
      });
      const data = (await res.json()) as { error?: string; company?: { id: number } };
      if (!res.ok) {
        setError(data.error || t.common.error);
        return;
      }
      if (data.company?.id) {
        setActiveCompanyId(data.company.id);
      }
      await refreshSession();
    } finally {
      setSubmitting(false);
    }
  }

  async function quickLogin(demoEmail: string) {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoEmail }),
      });
      if (res.ok) {
        await refreshSession();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-mb-beige flex flex-col justify-between p-4 sm:p-8">
      {/* Top Language Bar */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-4">
        <MizanLockup name={t.appName} tagline={t.appTagline} href="/" markClassName="h-11 w-11" nameClassName="text-lg" />

        <div className="flex flex-wrap items-center gap-1 bg-mb-paper border border-mb-line p-1 rounded-xl max-w-full">
          <Globe className="w-4 h-4 text-mb-ink mx-1.5 shrink-0" aria-hidden="true" />
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                lang === l.code
                  ? "bg-mb-amber text-mb-cocoa shadow-xs"
                  : "text-mb-ink hover:text-mb-cocoa hover:bg-mb-cream"
              }`}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Main Card */}
      <div className="max-w-5xl w-full mx-auto my-6 grid lg:grid-cols-12 gap-0 bg-white rounded-3xl shadow-2xl overflow-hidden border border-mb-line">
        {/* Left: Sign In or 30-Day Free Trial Sign Up */}
        <div className="lg:col-span-7 p-6 sm:p-10">
          {/* Mode Tabs */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mode === "signin" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.auth.signInTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mode === "signup"
                  ? "bg-mb-amber text-mb-cocoa shadow-xs"
                  : "text-mb-cocoa hover:bg-mb-cream"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.auth.signUpTab}</span>
            </button>
          </div>

          {mode === "signin" ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">{t.auth.title}</h1>
              <p className="text-sm text-slate-500 mt-1.5">{t.auth.subtitle}</p>

              <form onSubmit={handleSignIn} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t.auth.email}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber focus:border-mb-amber"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    {t.auth.password}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber focus:border-mb-amber"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-mb-amber hover:bg-mb-amber-deep text-mb-cocoa font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <span>{submitting ? t.auth.signingIn : t.auth.signIn}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </button>
              </form>

              <div className="mt-5 text-xs text-slate-500 flex items-center gap-1.5">
                <span>{t.auth.newToMizan}</span>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-bold text-mb-cocoa hover:underline cursor-pointer"
                >
                  {t.auth.signUpTab} ({t.auth.freeTrialBadge})
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-mb-cream text-mb-cocoa border border-mb-line mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t.auth.freeTrialBadge}</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{t.auth.freeTrialTitle}</h1>
              <p className="text-sm text-slate-500 mt-1">{t.auth.freeTrialSubtitle}</p>

              <form onSubmit={handleSignUp} className="mt-5 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t.auth.fullName} *</label>
                    <input
                      required
                      placeholder="e.g. Dawit Alemu"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t.auth.companyName} *</label>
                    <input
                      required
                      placeholder="e.g. Rift Valley Trading PLC"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t.auth.email} *</label>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t.auth.password} *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="Min. 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-mb-amber"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t.settings.baseCurrency}</label>
                    <select
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
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
                      value={taxRegime}
                      onChange={(e) => setTaxRegime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      {TAX_REGIMES.map((tr) => (
                        <option key={tr.code} value={tr.code}>
                          {tr.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-mb-amber hover:bg-mb-amber-deep text-mb-cocoa font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <span>{submitting ? t.auth.creatingAccount : t.auth.startFreeTrial}</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </button>
                <p className="text-[11px] text-center text-slate-500">{t.auth.noCardRequired}</p>
              </form>

              <div className="mt-4 text-xs text-slate-500 flex items-center gap-1.5">
                <span>{t.auth.alreadyHaveAccount}</span>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="font-bold text-mb-cocoa hover:underline cursor-pointer"
                >
                  {t.auth.signInTab}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: Free Trial Benefits + Instant Demo Access */}
        <div className="lg:col-span-5 bg-slate-50 p-6 sm:p-8 border-t lg:border-t-0 lg:border-s border-slate-200 flex flex-col justify-between gap-6">
          {/* 30-Day Free Trial Highlights */}
          <div className="bg-mb-cocoa text-mb-cream rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-mb-cream uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                {t.auth.freeTrialBadge}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] bg-mb-amber text-mb-cocoa px-2 py-0.5 rounded-full">
                <Smartphone className="w-3 h-3" /> iOS & Android
              </span>
            </div>
            <ul className="space-y-2 text-xs text-mb-cream/90">
              {[t.auth.trialFeature1, t.auth.trialFeature2, t.auth.trialFeature3, t.auth.trialFeature4].map(
                (feat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-mb-amber shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Quick Demo Roles (hidden automatically when ENABLE_DEMO_LOGIN=false in production) */}
          {demoLoginEnabled && (
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-mb-cream text-mb-cocoa">
              {t.auth.quickDemo}
            </span>
            <p className="text-xs text-slate-600 mt-2">{t.auth.quickDemoHint}</p>

            <div className="mt-3 space-y-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => quickLogin("admin@mizanbooks.com")}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:border-mb-amber hover:shadow-sm transition-all text-start cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-mb-cream text-mb-cocoa flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">{t.auth.adminDemo}</div>
                    <div className="text-[11px] text-slate-500 truncate">admin@mizanbooks.com</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 rtl:rotate-180 shrink-0" />
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => quickLogin("accountant@mizanbooks.com")}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:border-mb-amber hover:shadow-sm transition-all text-start cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">{t.auth.accountantDemo}</div>
                    <div className="text-[11px] text-slate-500 truncate">accountant@mizanbooks.com</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 rtl:rotate-180 shrink-0" />
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => quickLogin("viewer@mizanbooks.com")}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:border-mb-amber hover:shadow-sm transition-all text-start cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">{t.auth.viewerDemo}</div>
                    <div className="text-[11px] text-slate-500 truncate">viewer@mizanbooks.com</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 rtl:rotate-180 shrink-0" />
              </button>
            </div>
          </div>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-mb-ink">
        English · አማርኛ · Afaan Oromoo · Soomaali · العربية
      </div>
    </div>
  );
}
