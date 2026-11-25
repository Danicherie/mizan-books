"use client";

import React from "react";
import { useApp } from "./AppContext";

export function TrialBanner() {
  const { t, subscription } = useApp();
  if (!subscription || subscription.status !== "trial" || subscription.daysLeft == null) return null;
  const text =
    subscription.daysLeft === 1
      ? t.auth.trialBannerOne
      : t.auth.trialBanner.replaceAll("{days}", String(subscription.daysLeft));
  return (
    <div role="status" className="bg-mb-cream border-b border-mb-line text-mb-cocoa px-4 sm:px-6 py-2.5 text-sm">
      {text}
    </div>
  );
}

export function ReadOnlyBanner() {
  const { t, subscription } = useApp();
  if (!subscription || subscription.canMutate) return null;
  return (
    <div role="status" className="bg-rose-50 border-b border-rose-200 text-rose-950 px-4 sm:px-6 py-2.5 text-sm">
      {t.auth.subscriptionReadOnlyBanner}
    </div>
  );
}

export function SubscriptionNeeded({ onContinue }: { onContinue: () => void }) {
  const { t, activeCompany, subscription } = useApp();
  const paused = subscription?.status === "paused";
  const companyName = activeCompany?.name || "";
  const title = paused ? t.auth.subscriptionPausedTitle : t.auth.subscriptionNeededTitle;
  const lead = (paused ? t.auth.subscriptionPausedLead : t.auth.subscriptionNeededLead).replaceAll("{company}", companyName);

  return (
    <section className="max-w-xl mx-auto mt-6 sm:mt-12 bg-mb-paper border border-mb-line rounded-3xl shadow-[0_16px_40px_rgba(74,46,31,0.08)] p-6 sm:p-8 text-start">
      <p className="text-xs font-bold uppercase tracking-wider text-rose-800">{title}</p>
      <h1 className="text-2xl font-bold text-mb-cocoa mt-2">{lead}</h1>
      <p className="text-sm text-mb-ink mt-4 leading-relaxed">{t.auth.subscriptionNeededBody}</p>
      <p className="text-sm text-mb-cocoa mt-3 leading-relaxed">{t.auth.subscriptionContact}</p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-6 w-full sm:w-auto px-4 py-2.5 rounded-full text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa"
      >
        {t.auth.subscriptionViewOnly}
      </button>
    </section>
  );
}
