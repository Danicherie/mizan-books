import { NextResponse } from "next/server";
import { getCurrentUser, isDemoLoginEnabled } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getUserCompanies } from "@/lib/api-helpers";

export async function GET() {
  getDb(); // Ensure schema & migrations have run
  const user = await getCurrentUser();
  const demoLoginEnabled = isDemoLoginEnabled();
  if (!user) {
    return NextResponse.json({ user: null, companies: [], demoLoginEnabled });
  }
  const companies = getUserCompanies(user.id);
  return NextResponse.json({ user, companies, demoLoginEnabled });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { preferred_lang?: string; preferred_calendar?: string };
  const db = getDb();
  if (body.preferred_lang) {
    db.prepare("UPDATE users SET preferred_lang = ? WHERE id = ?").run(body.preferred_lang, user.id);
  }
  if (body.preferred_calendar) {
    db.prepare("UPDATE users SET preferred_calendar = ? WHERE id = ?").run(body.preferred_calendar, user.id);
  }
  const updated = db
    .prepare("SELECT id, name, email, role, preferred_lang, preferred_calendar FROM users WHERE id = ?")
    .get(user.id);
  return NextResponse.json({ user: updated });
}
