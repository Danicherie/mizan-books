"use client";

import React, { useState } from "react";
import { MarketingShell, marketingFocusRing, useMarketing } from "./MarketingShell";

function AboutContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-semibold text-mb-cocoa">{m.navAbout}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight break-words sm:text-4xl">{m.aboutTitle}</h1>
      <p className="mt-4 text-lg leading-relaxed text-mb-ink break-words">{m.aboutLead}</p>
      <div className="mt-8 space-y-4 text-base leading-relaxed text-mb-cocoa">
        {m.aboutParagraphs.map((paragraph) => (
          <p key={paragraph} className="break-words">
            {paragraph}
          </p>
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

function ContactContent({ publicEmail }: { publicEmail: string }) {
  const { t } = useMarketing();
  const m = t.marketing;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "invalid" | "limited" | "error">("idle");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 1 || name.trim().length > 120 || email.trim().length > 254 || message.trim().length < 1 || message.trim().length > 4000) {
      setStatus("invalid");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website }),
      });
      if (res.status === 429) {
        setStatus("limited");
        return;
      }
      if (res.status === 400) {
        setStatus("invalid");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setName("");
      setEmail("");
      setMessage("");
      setWebsite("");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  const notice =
    status === "sent"
      ? m.contactSuccess
      : status === "invalid"
        ? m.contactInvalid
        : status === "limited"
          ? m.contactRateLimited
          : status === "error"
            ? m.contactError
            : "";

  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-semibold text-mb-cocoa">{m.lastUpdated}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight break-words sm:text-4xl">{m.contactTitle}</h1>
      <p className="mt-4 text-lg leading-relaxed text-mb-ink break-words">{m.contactLead}</p>
      <p className="mt-4 text-base leading-relaxed text-mb-ink break-words">{m.contactBody}</p>
      <p className="mt-4 rounded-2xl border border-mb-line bg-mb-paper px-4 py-3 text-sm leading-relaxed break-words">{m.operatorLine}</p>
      {publicEmail ? (
        <p className="mt-4 text-sm leading-relaxed break-words">
          <span className="font-semibold">{m.contactEmailHeading}: </span>
          <a className={`text-mb-cocoa underline ${marketingFocusRing}`} href={`mailto:${publicEmail}`}>
            {publicEmail}
          </a>
        </p>
      ) : null}
      <form className="relative mt-8 space-y-4 rounded-[1.5rem] border border-mb-line bg-mb-paper p-5 sm:p-6" onSubmit={(event) => void onSubmit(event)}>
        <div className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-hidden="true">
          <label htmlFor="contact-website">{m.contactWebsite}</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
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
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
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
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            maxLength={4000}
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className={`mt-1.5 w-full rounded-2xl border border-mb-line bg-white px-3.5 py-3 text-base ${marketingFocusRing}`}
          />
        </div>
        <button
          type="submit"
          disabled={status === "sending"}
          className={`inline-flex rounded-full bg-mb-amber px-5 py-3 font-semibold text-mb-cocoa hover:bg-mb-amber-deep disabled:opacity-60 ${marketingFocusRing}`}
        >
          {status === "sending" ? m.contactSending : m.contactSubmit}
        </button>
        {notice ? (
          <p role="status" className="text-sm font-medium leading-relaxed text-mb-cocoa break-words">
            {notice}
          </p>
        ) : null}
      </form>
    </article>
  );
}

function PolicyContent({
  title,
  updated,
  intro,
  operator,
  blocks,
}: {
  title: string;
  updated: string;
  intro: string;
  operator: string;
  blocks: Array<{ title: string; body: string }>;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-semibold text-mb-cocoa">{updated}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight break-words sm:text-4xl">{title}</h1>
      <p className="mt-4 text-base leading-relaxed text-mb-ink break-words">{intro}</p>
      <p className="mt-4 rounded-2xl border border-mb-line bg-mb-paper px-4 py-3 text-sm leading-relaxed break-words">{operator}</p>
      <div className="mt-8 space-y-6">
        {blocks.map((block) => (
          <section key={block.title}>
            <h2 className="text-xl font-semibold break-words">{block.title}</h2>
            <p className="mt-2 text-base leading-relaxed text-mb-ink break-words">{block.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

function PrivacyContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  return (
    <PolicyContent
      title={m.privacyTitle}
      updated={m.lastUpdated}
      intro={m.privacyIntro}
      operator={m.operatorLine}
      blocks={m.privacyBlocks}
    />
  );
}

function TermsContent() {
  const { t } = useMarketing();
  const m = t.marketing;
  return (
    <PolicyContent
      title={m.termsTitle}
      updated={m.lastUpdated}
      intro={m.termsIntro}
      operator={m.operatorLine}
      blocks={m.termsBlocks}
    />
  );
}

export function AboutPage() {
  return (
    <MarketingShell current="about">
      <AboutContent />
    </MarketingShell>
  );
}

export function ContactPage({ publicEmail = "" }: { publicEmail?: string }) {
  return (
    <MarketingShell current="contact">
      <ContactContent publicEmail={publicEmail} />
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
