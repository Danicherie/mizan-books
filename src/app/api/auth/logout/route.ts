import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { assertMutationOrigin } from "@/lib/origin";

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
