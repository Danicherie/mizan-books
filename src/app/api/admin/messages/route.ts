import { NextResponse } from "next/server";
import { deleteContactMessage, listContactMessages, markContactMessageRead } from "@/lib/contact-store";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { requestHasOperatorSession } from "@/lib/operator-auth";

export async function GET(request: Request) {
  if (!requestHasOperatorSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ messages: listContactMessages() });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  if (!requestHasOperatorSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { action?: unknown; id?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Choose a message." }, { status: 400 });
    }
    if (body.action === "mark_read") {
      if (!markContactMessageRead(id)) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    if (body.action === "delete") {
      if (!deleteContactMessage(id)) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
