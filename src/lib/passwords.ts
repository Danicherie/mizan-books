export const MIN_USER_PASSWORD_LENGTH = 8;

export const PUBLISHED_PASSWORDS = new Set(["password123", "admin", "changeme", "change-me"]);

export function userPasswordProblem(password: string): string | null {
  if (password.length < MIN_USER_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_USER_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return "Password is too long.";
  if (PUBLISHED_PASSWORDS.has(password)) {
    return "Choose a password that is not a published sample.";
  }
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}
