import { NextResponse } from "next/server";
import { parseContactSubmission } from "@/lib/contact";
import { saveContactMessage } from "@/lib/contact-store";
import { clientErrorResponse, tooManyAttempts } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { CONTACT_LIMIT, CONTACT_WINDOW_MS, clientAddress, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;

  const limit = rateLimit(`contact:${clientAddress(request.headers)}`, CONTACT_LIMIT, CONTACT_WINDOW_MS);
  if (!limit.ok) return tooManyAttempts(limit.retryAfterSec);

  try {
    const body = (await request.json()) as {
      name?: unknown;
      email?: unknown;
      message?: unknown;
      website?: unknown;
    };
    const parsed = parseContactSubmission(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: "Check your name, email, and message.", code: "VALIDATION" }, { status: 400 });
    }
    if (!parsed.dropped) {
      saveContactMessage(parsed.fields);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
