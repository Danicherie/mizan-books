import { NextResponse } from "next/server";
import { getCurrentUser, isDemoLoginEnabled } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUserCompanies } from "@/lib/api-helpers";
import { isSignupEnabled } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";

const LANGS = new Set(["en", "am", "om", "so", "ar"]);
const CALENDARS = new Set(["gregorian", "ethiopian"]);

export async function GET() {
  getDb();
  const user = await getCurrentUser();
  const demoLoginEnabled = isDemoLoginEnabled();
  const signupEnabled = isSignupEnabled();
  if (!user) {
    return NextResponse.json({ user: null, companies: [], demoLoginEnabled, signupEnabled });
  }
  const companies = getUserCompanies(user.id);
  return NextResponse.json({ user, companies, demoLoginEnabled, signupEnabled });
}

export async function PATCH(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { preferred_lang?: unknown; preferred_calendar?: unknown };
  try {
    body = (await request.json()) as { preferred_lang?: unknown; preferred_calendar?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const db = getDb();
  if (typeof body.preferred_lang === "string" && LANGS.has(body.preferred_lang)) {
    db.prepare("UPDATE users SET preferred_lang = ? WHERE id = ?").run(body.preferred_lang, user.id);
  }
  if (typeof body.preferred_calendar === "string" && CALENDARS.has(body.preferred_calendar)) {
    db.prepare("UPDATE users SET preferred_calendar = ? WHERE id = ?").run(body.preferred_calendar, user.id);
  }
  const updated = db
    .prepare("SELECT id, name, email, role, preferred_lang, preferred_calendar FROM users WHERE id = ?")
    .get(user.id);
  return NextResponse.json({ user: updated });
}
