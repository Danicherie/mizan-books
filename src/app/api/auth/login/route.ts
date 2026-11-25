import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSessionCookie, isDemoLoginEnabled, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string; demoEmail?: string };
    const db = getDb();

    let userRow:
      | {
          id: number;
          name: string;
          email: string;
          password_hash: string;
          role: string;
          preferred_lang: string;
          preferred_calendar: string;
        }
      | undefined;

    if (body.demoEmail) {
      if (!isDemoLoginEnabled()) {
        return NextResponse.json({ error: "Demo login is disabled in production" }, { status: 403 });
      }
      // Allow 1-click demo login for pre-seeded demo accounts only
      const allowedDemos = ["admin@mizanbooks.com", "accountant@mizanbooks.com", "viewer@mizanbooks.com"];
      if (!allowedDemos.includes(body.demoEmail)) {
        return NextResponse.json({ error: "Invalid demo account" }, { status: 400 });
      }
      userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(body.demoEmail) as typeof userRow;
    } else {
      const email = (body.email ?? "").trim().toLowerCase();
      const password = body.password ?? "";
      userRow = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email) as typeof userRow;
      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
    }

    if (!userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const token = await createSessionCookie(userRow.id);
    return NextResponse.json({
      token,
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        preferred_lang: userRow.preferred_lang,
        preferred_calendar: userRow.preferred_calendar,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
