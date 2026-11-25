"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/i18n";
import { MizanMark } from "@/components/brand/MizanLogo";
import { MarketingShell, marketingFocusRing, useMarketing } from "./MarketingShell";

function SignedInRedirect() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { user?: unknown }) => {
        if (!cancelled && data.user) router.replace("/app");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-mb-cocoa">
      <span className="h-2 w-2 shrink-0 rounded-full bg-mb-amber" aria-hidden="true" />
      {children}
    </p>
  );
}

function HeroArt() {
  const { t } = useMarketing();
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute inset-x-8 top-6 h-48 rounded-full bg-mb-cream blur-2xl" />
      <div className="relative">
        <MizanMark className="mx-auto h-36 w-36 sm:h-44 sm:w-44" />
        <div className="relative z-10 -mt-6 rounded-[1.75rem] border border-mb-line bg-mb-paper p-5 shadow-[0_18px_40px_rgba(74,46,31,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-mb-ink">{t.reports.trialBalance}</p>
            <span className="rounded-full bg-mb-cream px-2.5 py-1 text-[11px] font-semibold text-mb-cocoa">{t.marketing.exampleLabel}</span>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-sm">
            <span className="text-mb-ink">{t.journal.account}</span>
            <span className="text-end text-mb-ink">{t.journal.debit}</span>
            <span className="text-end text-mb-ink">{t.journal.credit}</span>
            <span className="font-medium">{t.dashboard.cashBalance}</span>
            <span className="text-end tabular-nums">1,200</span>
            <span />
            <span className="font-medium">{t.dashboard.totalRevenue}</span>
            <span />
            <span className="text-end tabular-nums">1,200</span>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-mb-cream px-3 py-1 text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-mb-amber" />
            {t.journal.balanced}
          </p>
        </div>
      </div>
    </div>
  );
}

const featureIcons = [
  "M7 3.5h10v17H7z M10 8h4 M10 12h4 M10 16h3",
  "M4 6.5h16 M4 12h16 M4 17.5h10",
  "M5 19V10 M10 19V6 M15 19v-7 M20 19V4",
  "M6 3.5h8l4 4V20.5H6z M14 3.5v4h4 M9 12h6 M9 16h4",
  "M4 20V9l8-5 8 5v11 M10 20v-6h4v6",
  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.4 2.6 3.4 5.6 3.4 9s-1 6.4-3.4 9c-2.4-2.6-3.4-5.6-3.4-9s1-6.4 3.4-9z",
];

export function LandingPage() {
  const { t } = useMarketing();
  const m = t.marketing;

  return (
    <>
      <SignedInRedirect />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-16">
        <div>
          <Eyebrow>{m.heroEyebrow}</Eyebrow>
          <h1 className="mt-4 max-w-xl text-3xl font-bold leading-tight tracking-tight break-words sm:text-5xl sm:leading-[1.1] lg:text-6xl">{m.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mb-ink break-words">{m.heroBody}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/app?signup=1"
              className={`inline-flex items-center justify-center rounded-full bg-mb-amber px-6 py-3.5 text-base font-semibold text-mb-cocoa shadow-sm hover:bg-mb-amber-deep ${marketingFocusRing}`}
            >
              {m.getStarted}
            </a>
            <a
              href="/app"
              className={`inline-flex items-center justify-center rounded-full border border-mb-line bg-mb-paper px-6 py-3.5 text-base font-semibold hover:bg-mb-cream ${marketingFocusRing}`}
            >
              {m.signIn}
            </a>
          </div>
          <p className="mt-4 text-sm text-mb-ink">{m.heroPriceNote}</p>
          <ul className="mt-8 flex flex-wrap gap-2" aria-label={m.languageLabel}>
            {LANGUAGES.map((item) => (
              <li key={item.code} lang={item.code} className="rounded-full border border-mb-line bg-mb-paper px-3 py-1.5 text-sm font-medium">
                {item.nativeLabel}
                {item.dir === "rtl" ? <span className="ms-1 text-xs text-mb-ink">RTL</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <HeroArt />
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-mb-line bg-mb-paper p-7 sm:p-9">
            <Eyebrow>{m.whatEyebrow}</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight break-words">{m.whatTitle}</h2>
            <p className="mt-4 text-base leading-relaxed text-mb-ink">{m.whatBody}</p>
          </article>
          <article className="rounded-[1.75rem] bg-mb-cocoa p-7 text-mb-cream sm:p-9">
            <h2 className="text-3xl font-bold tracking-tight break-words">{m.whoTitle}</h2>
            <p className="mt-4 text-base leading-relaxed text-mb-cream/90">{m.whoBody}</p>
          </article>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 mx-auto max-w-6xl px-5 pb-16">
        <Eyebrow>{m.featuresEyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{m.featuresTitle}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {m.features.map((feature, index) => (
            <article key={feature.title} className="rounded-[1.5rem] border border-mb-line bg-mb-paper p-6 shadow-[0_10px_30px_rgba(74,46,31,0.04)]">
              <svg viewBox="0 0 24 24" className="h-9 w-9 text-mb-cocoa" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d={featureIcons[index]} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mb-ink">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-24 bg-mb-cream/70">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <Eyebrow>{m.howEyebrow}</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{m.howTitle}</h2>
          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            {m.steps.map((step, index) => (
              <li key={step.title} className="rounded-[1.5rem] border border-mb-line bg-mb-paper p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-mb-amber text-lg font-bold text-mb-cocoa">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mb-ink">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Eyebrow>{m.trustEyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{m.trustTitle}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {m.trust.map((item) => (
            <article key={item.title} className="rounded-[1.5rem] border border-mb-line bg-mb-paper p-6">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mb-ink">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 mx-auto max-w-3xl px-5 pb-16">
        <Eyebrow>{m.faqEyebrow}</Eyebrow>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{m.faqTitle}</h2>
        <div className="mt-6 border-t border-mb-line">
          {m.faqs.map((item) => (
            <details key={item.q} className="group border-b border-mb-line py-1">
              <summary className={`flex cursor-pointer items-center justify-between gap-4 py-4 text-lg font-semibold break-words ${marketingFocusRing}`}>
                {item.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mb-cream text-xl leading-none transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="pb-4 text-base leading-relaxed text-mb-ink">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="flex flex-col items-start gap-6 rounded-[2rem] bg-mb-cocoa px-7 py-10 text-mb-cream sm:px-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold tracking-tight">{m.ctaTitle}</h2>
            <p className="mt-3 text-base leading-relaxed text-mb-cream/90">{m.ctaBody}</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href="/app?signup=1"
              className={`inline-flex items-center justify-center rounded-full bg-mb-amber px-6 py-3.5 text-base font-semibold text-mb-cocoa hover:bg-mb-amber-deep ${marketingFocusRing}`}
            >
              {m.getStarted}
            </a>
            <a
              href="/contact"
              className={`inline-flex items-center justify-center rounded-full border border-mb-cream/30 px-6 py-3.5 text-base font-semibold text-mb-cream hover:bg-white/10 ${marketingFocusRing}`}
            >
              {m.navContact}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

export function MarketingHome() {
  return (
    <MarketingShell current="home">
      <LandingPage />
    </MarketingShell>
  );
}
