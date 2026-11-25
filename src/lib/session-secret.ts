import crypto from "node:crypto";

export const MIN_SESSION_SECRET_LENGTH = 32;

/** Phrases that have been printed in this repository. They must never sign a session. */
const PUBLISHED_SECRETS = new Set([
  "mizan-accounting-local-dev-secret-v1",
  "change-me-to-a-64-char-random-secret",
  "replace-with-strong-64-char-random-hex-secret",
]);

let ephemeralDevSecret: string | null = null;

export function sessionSecretProblem(secret: string | undefined): string | null {
  const value = secret?.trim() ?? "";
  if (!value) return "MIZAN_SESSION_SECRET is not set.";
  if (PUBLISHED_SECRETS.has(value)) return "MIZAN_SESSION_SECRET is a published sample value.";
  if (value.length < MIN_SESSION_SECRET_LENGTH) {
    return `MIZAN_SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`;
  }
  return null;
}

/**
 * Production refuses a missing, short, or published secret.
 * Development uses a random secret for this process only, never a phrase from the source code.
 */
export function getSessionSecret(): string {
  const problem = sessionSecretProblem(process.env.MIZAN_SESSION_SECRET);
  if (!problem) return process.env.MIZAN_SESSION_SECRET!.trim();

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${problem} Refusing to start. Generate one with: openssl rand -hex 32`);
  }

  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      `[Mizan Books] ${problem} Using a random secret for this process only. Set MIZAN_SESSION_SECRET to keep logins across restarts.`
    );
  }
  return ephemeralDevSecret;
}

/** Called when the server process starts. Build steps must not call this. */
export function assertProductionSessionSecret(): void {
  if (process.env.NODE_ENV !== "production") return;
  const problem = sessionSecretProblem(process.env.MIZAN_SESSION_SECRET);
  if (problem) {
    throw new Error(`${problem} Refusing to start. Generate one with: openssl rand -hex 32`);
  }
}
