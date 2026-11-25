"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGUAGES, type Lang } from "@/lib/i18n";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa";

/**
 * Shared language menu. Callers keep their own saved-choice handler
 * (localStorage on the marketing site, localStorage plus the profile
 * update inside the signed-in app).
 */
export function LanguageSelector({
  lang,
  onChange,
  label,
  compact = false,
  fullWidth = false,
  placement = "down",
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
  label: string;
  compact?: boolean;
  fullWidth?: boolean;
  placement?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = LANGUAGES.find((item) => item.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.focus();
  }, [open]);

  function options(): HTMLElement[] {
    return [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
  }

  function focusOption(index: number) {
    const items = options();
    if (!items.length) return;
    const next = (index + items.length) % items.length;
    items[next]?.focus();
  }

  function choose(code: Lang) {
    onChange(code);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    const items = options();
    const index = items.findIndex((item) => item === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index < 0 ? 0 : index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index < 0 ? items.length - 1 : index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(items.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const code = (document.activeElement as HTMLElement | null)?.dataset.code as Lang | undefined;
      if (code) choose(code);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${fullWidth ? "w-full" : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${current.nativeLabel}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border border-mb-line bg-mb-paper px-2.5 py-1.5 text-sm font-semibold text-mb-cocoa shadow-sm transition-colors hover:bg-mb-cream ${focusRing} ${
          fullWidth ? "w-full justify-between" : ""
        }`}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span lang={current.code} dir={current.dir} className={`truncate ${compact ? "hidden sm:inline" : ""} ${fullWidth ? "inline" : "max-w-[8.5rem]"}`}>
            {current.nativeLabel}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className={`absolute z-50 max-h-[min(20rem,70vh)] w-56 overflow-y-auto rounded-2xl border border-mb-line bg-mb-paper p-1.5 shadow-[0_16px_40px_rgba(74,46,31,0.16)] ${
            fullWidth ? "start-0 w-full" : "end-0"
          } ${placement === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {LANGUAGES.map((item) => {
            const selected = item.code === lang;
            return (
              <li key={item.code} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-code={item.code}
                  lang={item.code}
                  dir={item.dir}
                  onClick={() => choose(item.code)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-medium ${focusRing} ${
                    selected ? "bg-mb-cream text-mb-cocoa" : "text-mb-ink hover:bg-mb-beige"
                  }`}
                >
                  <span>{item.nativeLabel}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
