import { NextResponse } from "next/server";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { hasOperatorSession } from "@/lib/operator-auth";
import { endOfUtcDay } from "@/lib/subscription";
import { extendTrial, pauseCompany, setPaidUntil, unpauseCompany } from "@/lib/subscription-admin";

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  if (!(await hasOperatorSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      companyId?: unknown;
      days?: unknown;
      paidUntil?: unknown;
      notes?: unknown;
    };
    const companyId = Number(body.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "Choose a company." }, { status: 400 });
    }
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (body.action === "extend_trial") {
      const days = Number(body.days);
      const trialEndsAt = extendTrial(companyId, days, new Date(), notes);
      return NextResponse.json({ ok: true, trial_ends_at: trialEndsAt });
    }
    if (body.action === "mark_paid") {
      if (typeof body.paidUntil !== "string") {
        return NextResponse.json({ error: "Choose the date the payment covers." }, { status: 400 });
      }
      const paidUntil = endOfUtcDay(body.paidUntil);
      if (!paidUntil) {
        return NextResponse.json({ error: "Use a real calendar date." }, { status: 400 });
      }
      setPaidUntil(companyId, paidUntil, notes);
      return NextResponse.json({ ok: true, paid_until: paidUntil.toISOString() });
    }
    if (body.action === "pause") {
      pauseCompany(companyId, notes);
      return NextResponse.json({ ok: true, status: "paused" });
    }
    if (body.action === "unpause") {
      const status = unpauseCompany(companyId, new Date(), notes);
      return NextResponse.json({ ok: true, status });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
