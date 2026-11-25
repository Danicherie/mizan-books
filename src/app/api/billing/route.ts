import { NextResponse } from "next/server";
import { requireAuth, resolveScopedCompanyId } from "@/lib/api-helpers";
import { assertMutationOrigin } from "@/lib/origin";

/**
 * Companies cannot mark themselves paid. A payment provider should call setPaidUntil()
 * in src/lib/subscription-admin.ts, which is what the operator page uses today.
 */
export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;

  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let body: { companyId?: number };
  try {
    body = (await request.json()) as { companyId?: number };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
  if ("error" in scoped) return scoped.error;

  return NextResponse.json(
    {
      error: "Subscription changes are made by the app owner. Contact them to subscribe.",
      code: "SUBSCRIPTION_OWNER_ONLY",
    },
    { status: 403 }
  );
}
