import { cleanEmail, cleanText } from "./passwords";

export const CONTACT_NAME_MAX = 120;
export const CONTACT_MESSAGE_MAX = 4000;

const PUBLIC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactFields {
  name: string;
  email: string;
  message: string;
}

export function parseContactSubmission(input: {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown;
}): { ok: true; dropped: true } | { ok: true; dropped: false; fields: ContactFields } | { ok: false } {
  if (typeof input.website === "string" && input.website.trim() !== "") {
    return { ok: true, dropped: true };
  }
  if (input.website != null && input.website !== "" && typeof input.website !== "string") {
    return { ok: false };
  }
  const name = cleanText(input.name, CONTACT_NAME_MAX);
  const email = cleanEmail(input.email);
  const message = cleanText(input.message, CONTACT_MESSAGE_MAX);
  if (!name || !email || !message) return { ok: false };
  return { ok: true, dropped: false, fields: { name, email, message } };
}

/** Address shown on the public Contact page. Empty when unset or not a single email. */
export function publicContactEmail(value = process.env.CONTACT_EMAIL): string {
  const email = (value ?? "").trim();
  if (!email || email.length > 254 || !PUBLIC_EMAIL.test(email)) return "";
  return email;
}
