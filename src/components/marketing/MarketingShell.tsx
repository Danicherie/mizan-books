"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getDictionary, isRtl, type Dictionary, type Lang } from "@/lib/i18n";
import { MizanLockup } from "@/components/brand/MizanLogo";
import { LanguageSelector } from "@/components/LanguageSelector";

interface MarketingContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  dir: "ltr" | "rtl";
  t: Dictionary;
}

const MarketingContext = createContext<MarketingContextValue | null>(null);

export function useMarketing() {
  const value = useContext(MarketingContext);
  if (!value) throw new Error("useMarketing must be used inside MarketingShell");
  return value;
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa";

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useMarketing();
  return <LanguageSelector lang={lang} onChange={setLang} label={t.marketing.languageLabel} compact={compact} />;
}

export function MarketingShell({
  children,
  current = "home",
}: {
  children: React.ReactNode;
  current?: "home" | "about" | "contact" | "privacy" | "terms";
}) {
  const [lang, setLangState] = useState<Lang>("en");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("mizan_lang");
    if (saved === "en" || saved === "am" || saved === "om" || saved === "so" || saved === "ar") {
      setLangState(saved);
    }
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem("mizan_lang", next);
  };

  const dir: "ltr" | "rtl" = isRtl(lang) ? "rtl" : "ltr";
  const t = getDictionary(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const featureHref = current === "home" ? "#features" : "/#features";
  const howHref = current === "home" ? "#how" : "/#how";
  const faqHref = current === "home" ? "#faq" : "/#faq";

  const links = [
    { href: featureHref, label: t.marketing.navFeatures },
    { href: howHref, label: t.marketing.navHow },
    { href: faqHref, label: t.marketing.navFaq },
    { href: "/about", label: t.marketing.navAbout, key: "about" as const },
    { href: "/contact", label: t.marketing.navContact, key: "contact" as const },
  ];

  return (
    <MarketingContext.Provider value={{ lang, setLang, dir, t }}>
      <div className="min-h-screen bg-mb-beige text-mb-cocoa">
        <a
          href="#content"
          className={`sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-mb-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold ${focusRing}`}
        >
          {t.marketing.skipToContent}
        </a>
        <header className="sticky top-0 z-40 border-b border-mb-line/80 bg-mb-beige/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0 max-w-[46%] sm:max-w-none">
              <MizanLockup name={t.appName} href="/" markClassName="h-10 w-10" nameClassName="text-base sm:text-lg" />
            </div>
            <nav aria-label={t.appName} className="hidden items-center gap-1 lg:flex">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={link.key && link.key === current ? "page" : undefined}
                  className={`rounded-full px-3 py-2 text-sm font-medium text-mb-ink hover:bg-mb-cream hover:text-mb-cocoa ${focusRing}`}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <LanguageSwitcher compact />
              <a
                href="/app"
                className={`hidden rounded-full px-3 py-2 text-sm font-semibold text-mb-cocoa hover:bg-mb-cream sm:inline-flex ${focusRing}`}
              >
                {t.marketing.signIn}
              </a>
              <a
                href="/app?signup=1"
                className={`inline-flex items-center rounded-full bg-mb-amber px-4 py-2.5 text-sm font-semibold text-mb-cocoa shadow-sm hover:bg-mb-amber-deep ${focusRing}`}
              >
                {t.marketing.getStarted}
              </a>
              <button
                type="button"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-mb-line bg-mb-paper lg:hidden ${focusRing}`}
                aria-expanded={menuOpen}
                aria-controls="marketing-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="sr-only">{menuOpen ? t.marketing.closeMenu : t.marketing.openMenu}</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  {menuOpen ? (
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  ) : (
                    <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                  )}
                </svg>
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div id="marketing-menu" className="border-t border-mb-line px-5 py-4 lg:hidden">
              <nav aria-label={t.appName} className="flex flex-col gap-1">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`rounded-2xl px-3 py-3 text-base font-medium text-mb-cocoa break-words hover:bg-mb-cream ${focusRing}`}
                  >
                    {link.label}
                  </a>
                ))}
                <a
                  href="/app"
                  className={`rounded-2xl px-3 py-3 text-base font-semibold text-mb-cocoa hover:bg-mb-cream ${focusRing}`}
                >
                  {t.marketing.signIn}
                </a>
              </nav>
              <div className="mt-4">
                <LanguageSwitcher />
              </div>
            </div>
          ) : null}
        </header>
        <main id="content">{children}</main>
        <footer className="border-t border-mb-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <MizanLockup name={t.appName} href="/" markClassName="h-9 w-9" nameClassName="text-base" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-mb-ink">{t.marketing.footerBlurb}</p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-mb-cocoa">{t.marketing.footerProduct}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href={featureHref}>
                    {t.marketing.navFeatures}
                  </a>
                </li>
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href={howHref}>
                    {t.marketing.navHow}
                  </a>
                </li>
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href="/app">
                    {t.marketing.signIn}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-mb-cocoa">{t.marketing.footerCompany}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href="/about">
                    {t.marketing.navAbout}
                  </a>
                </li>
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href="/contact">
                    {t.marketing.navContact}
                  </a>
                </li>
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href="/privacy">
                    {t.marketing.privacy}
                  </a>
                </li>
                <li>
                  <a className={`text-mb-ink hover:text-mb-cocoa ${focusRing}`} href="/terms">
                    {t.marketing.terms}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-mb-line/80">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-mb-ink">
              <p>
                © {new Date().getFullYear()} {t.marketing.rights}
              </p>
              <p>mizanbooks.tech</p>
            </div>
          </div>
        </footer>
      </div>
    </MarketingContext.Provider>
  );
}

export const marketingFocusRing = focusRing;
