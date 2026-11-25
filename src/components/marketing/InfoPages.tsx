"use client";

import React, { useState } from "react";
import { MarketingShell, marketingFocusRing, useMarketing } from "./MarketingShell";

function DraftNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-mb-amber bg-mb-cream px-4 py-3 text-sm font-medium leading-relaxed text-mb-cocoa">
      {children}
    </p>
  );
}

function AboutContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-semibold text-mb-cocoa">{m.navAbout}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">{m.aboutTitle}</h1>
      <p className="mt-4 text-lg leading-relaxed text-mb-ink">{m.aboutLead}</p>
      <div className="mt-8 space-y-4 text-base leading-relaxed text-mb-cocoa">
        {m.aboutParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a href="/app?signup=1" className={`inline-flex justify-center rounded-full bg-mb-amber px-5 py-3 font-semibold text-mb-cocoa hover:bg-mb-amber-deep ${marketingFocusRing}`}>
          {m.getStarted}
        </a>
        <a href="/contact" className={`inline-flex justify-center rounded-full border border-mb-line bg-mb-paper px-5 py-3 font-semibold hover:bg-mb-cream ${marketingFocusRing}`}>
          {m.navContact}
        </a>
      </div>
    </article>
  );
}

function ContactContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  const [notice, setNotice] = useState(false);

  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-semibold text-mb-cocoa">{m.draft}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">{m.contactTitle}</h1>
      <div className="mt-5">
        <DraftNote>{m.contactLead}</DraftNote>
      </div>
      <p className="mt-4 text-base leading-relaxed text-mb-ink">{m.contactBody}</p>
      <form
        className="mt-8 space-y-4 rounded-[1.5rem] border border-mb-line bg-mb-paper p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setNotice(true);
        }}
      >
        <div>
          <label htmlFor="contact-name" className="block text-sm font-semibold">
            {m.contactName}
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className={`mt-1.5 w-full rounded-2xl border border-mb-line bg-white px-3.5 py-3 text-base ${marketingFocusRing}`}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-sm font-semibold">
            {m.contactEmail}
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`mt-1.5 w-full rounded-2xl border border-mb-line bg-white px-3.5 py-3 text-base ${marketingFocusRing}`}
          />
        </div>
        <div>
          <label htmlFor="contact-message" className="block text-sm font-semibold">
            {m.contactMessage}
          </label>
          <textarea
            id="contact-message"
            name="message"
            required
            rows={5}
            className={`mt-1.5 w-full rounded-2xl border border-mb-line bg-white px-3.5 py-3 text-base ${marketingFocusRing}`}
          />
        </div>
        <button
          type="submit"
          className={`inline-flex rounded-full bg-mb-amber px-5 py-3 font-semibold text-mb-cocoa hover:bg-mb-amber-deep ${marketingFocusRing}`}
        >
          {m.contactSubmit}
        </button>
        {notice ? (
          <p role="status" className="text-sm font-medium text-mb-cocoa">
            {m.contactNotice}
          </p>
        ) : null}
      </form>
    </article>
  );
}

function PolicyContent({
  title,
  draft,
  intro,
  blocks,
}: {
  title: string;
  draft: string;
  intro: string;
  blocks: Array<{ title: string; body: string }>;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-semibold text-mb-cocoa">{draft}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">{title}</h1>
      <div className="mt-5">
        <DraftNote>{draft}</DraftNote>
      </div>
      <p className="mt-4 text-base leading-relaxed text-mb-ink">{intro}</p>
      <div className="mt-8 space-y-6">
        {blocks.map((block) => (
          <section key={block.title}>
            <h2 className="text-xl font-semibold">{block.title}</h2>
            <p className="mt-2 text-base leading-relaxed text-mb-ink">{block.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

function PrivacyContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  return <PolicyContent title={m.privacyTitle} draft={m.privacyDraft} intro={m.privacyIntro} blocks={m.privacyBlocks} />;
}

function TermsContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  return <PolicyContent title={m.termsTitle} draft={m.termsDraft} intro={m.termsIntro} blocks={m.termsBlocks} />;
}

export function AboutPage() {
  return (
    <MarketingShell current="about">
      <AboutContent />
    </MarketingShell>
  );
}

export function ContactPage() {
  return (
    <MarketingShell current="contact">
      <ContactContent />
    </MarketingShell>
  );
}

export function PrivacyPage() {
  return (
    <MarketingShell current="privacy">
      <PrivacyContent />
    </MarketingShell>
  );
}

export function TermsPage() {
  return (
    <MarketingShell current="terms">
      <TermsContent />
    </MarketingShell>
  );
}
