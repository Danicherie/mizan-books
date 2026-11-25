import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSessionCookie, isDemoLoginEnabled, verifyPassword } from "@/lib/auth";
import { clientErrorResponse, tooManyAttempts } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { LOGIN_LIMIT, LOGIN_WINDOW_MS, clientAddress, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;

  const limit = rateLimit(`login:${clientAddress(request.headers)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) return tooManyAttempts(limit.retryAfterSec);

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
        return NextResponse.json({ error: "Demo login is disabled" }, { status: 403 });
      }
      const allowedDemos = ["admin@mizanbooks.com", "accountant@mizanbooks.com", "viewer@mizanbooks.com"];
      if (typeof body.demoEmail !== "string" || !allowedDemos.includes(body.demoEmail)) {
        return NextResponse.json({ error: "Invalid demo account" }, { status: 400 });
      }
      userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(body.demoEmail) as typeof userRow;
    } else {
      const email = (body.email ?? "").trim().toLowerCase();
      const password = body.password ?? "";
      if (!email || email.length > 254 || typeof body.password !== "string") {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      userRow = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email) as typeof userRow;
      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
    }

    if (!userRow) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
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
    return clientErrorResponse(err);
  }
}
