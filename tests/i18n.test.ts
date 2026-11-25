import assert from "node:assert/strict";
import test from "node:test";
import { DICTIONARIES, type Lang } from "../src/lib/i18n/index.ts";
import { localizeApiError } from "../src/lib/i18n/errors.ts";

const LOCALES: Lang[] = ["en", "am", "om", "so", "ar"];

function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => paths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.keys(value).flatMap((key) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return paths((value as Record<string, unknown>)[key], next);
    });
  }
  return [prefix];
}

test("every locale has every English key and no empty copy", () => {
  const english = paths(DICTIONARIES.en);
  assert.ok(english.length > 100);
  for (const lang of LOCALES) {
    const local = paths(DICTIONARIES[lang]);
    const localSet = new Set(local);
    const missing = english.filter((key) => !localSet.has(key));
    const extra = local.filter((key) => !english.includes(key));
    assert.deepEqual(missing, [], `${lang} is missing English keys`);
    assert.deepEqual(extra, [], `${lang} has keys English does not`);
    for (const key of local) {
      const value = key.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((current, part) => {
        if (current == null) return current;
        const index = Number(part);
        if (Array.isArray(current) && String(index) === part) return current[index];
        return (current as Record<string, unknown>)[part];
      }, DICTIONARIES[lang]);
      if (typeof value === "string") {
        assert.ok(value.trim().length > 0, `${lang} ${key} is empty`);
      }
    }
  }
});

test("Amharic, Oromo, Somali, and Arabic are not the English fallback", () => {
  for (const lang of ["am", "om", "so", "ar"] as const) {
    assert.notEqual(DICTIONARIES[lang].marketing.heroTitle, DICTIONARIES.en.marketing.heroTitle);
    assert.notEqual(DICTIONARIES[lang].marketing.privacyTitle, DICTIONARIES.en.marketing.privacyTitle);
    assert.notEqual(DICTIONARIES[lang].marketing.termsTitle, DICTIONARIES.en.marketing.termsTitle);
    assert.notEqual(DICTIONARIES[lang].marketing.contactSuccess, DICTIONARIES.en.marketing.contactSuccess);
    assert.notEqual(DICTIONARIES[lang].errors.passwordShort, DICTIONARIES.en.errors.passwordShort);
    assert.equal(DICTIONARIES[lang].marketing.privacyBlocks.length, DICTIONARIES.en.marketing.privacyBlocks.length);
    assert.equal(DICTIONARIES[lang].marketing.termsBlocks.length, DICTIONARIES.en.marketing.termsBlocks.length);
  }
});

test("legal pages no longer describe themselves as drafts", () => {
  for (const lang of LOCALES) {
    const blob = JSON.stringify({
      contact: DICTIONARIES[lang].marketing.contactLead,
      privacy: DICTIONARIES[lang].marketing.privacyIntro,
      terms: DICTIONARIES[lang].marketing.termsIntro,
      updated: DICTIONARIES[lang].marketing.lastUpdated,
    });
    assert.doesNotMatch(blob, /draft/i);
    assert.match(DICTIONARIES[lang].marketing.lastUpdated, /2026/);
    assert.match(DICTIONARIES[lang].marketing.operatorLine, /Daniel Fessehaye/);
  }
});

test("known API errors are translated and unknown text is left as sent", () => {
  const am = localizeApiError(DICTIONARIES.am, "Password must be at least 8 characters.");
  assert.equal(am, DICTIONARIES.am.errors.passwordShort);
  assert.notEqual(am, DICTIONARIES.en.errors.passwordShort);

  const payment = localizeApiError(DICTIONARIES.om, "Payment must be between 0 and 12.50");
  assert.match(payment, /12\.50/);
  assert.notEqual(payment, "Payment must be between 0 and 12.50");

  const balance = localizeApiError(
    DICTIONARIES.so,
    "Journal entry is out of balance: Debits (10.00) != Credits (9.00). Debits and credits must match to the cent."
  );
  assert.match(balance, /10\.00/);
  assert.match(balance, /9\.00/);

  assert.equal(localizeApiError(DICTIONARIES.ar, "Something the server invented"), "Something the server invented");
  assert.equal(localizeApiError(DICTIONARIES.en, ""), DICTIONARIES.en.common.error);
});
