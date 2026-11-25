import { NextResponse } from "next/server";
import { clearOperatorCookie } from "@/lib/operator-auth";
import { assertMutationOrigin } from "@/lib/origin";

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  await clearOperatorCookie();
  return NextResponse.json({ ok: true });
}
