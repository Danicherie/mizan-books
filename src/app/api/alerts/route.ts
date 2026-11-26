import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse, tooManyAttempts } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";

const ALERT_LIMIT = 20;
const ALERT_WINDOW_MS = 60 * 60 * 1000;
const ENTITY_TYPES = new Set(["INVOICE", "BILL", "REMINDER"]);

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const company = db
    .prepare("SELECT telegram_chat_id, sms_sender_id FROM companies WHERE id = ?")
    .get(companyId) as { telegram_chat_id: string; sms_sender_id: string } | undefined;

  const logs = db
    .prepare("SELECT * FROM notification_logs WHERE company_id = ? ORDER BY id DESC LIMIT 50")
    .all(companyId);

  return NextResponse.json({
    config: {
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      smsConfigured: Boolean(process.env.SMS_WEBHOOK_URL),
      telegram_chat_id: company?.telegram_chat_id || "",
      sms_sender_id: company?.sms_sender_id || "MizanBooks",
    },
    logs,
  });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "save_config" | "send_alert";
      companyId: number;
      telegram_chat_id?: string;
      sms_sender_id?: string;
      channel?: "TELEGRAM" | "SMS";
      recipient?: string;
      entity_type?: string;
      entity_id?: number | null;
      message?: string;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    const db = getDb();

    if (body.action === "save_config") {
      db.prepare("UPDATE companies SET telegram_chat_id = ?, sms_sender_id = ? WHERE id = ?").run(
        clean(body.telegram_chat_id, 80),
        clean(body.sms_sender_id, 11) || "MizanBooks",
        companyId
      );
      logAudit(companyId, auth.user.id, "UPDATE_ALERTS_CONFIG", "SETTINGS", companyId, "Updated Telegram / SMS alert settings");
      return NextResponse.json({ ok: true });
    }

    if (body.action === "send_alert") {
      const limit = rateLimit(`alerts:${companyId}`, ALERT_LIMIT, ALERT_WINDOW_MS);
      if (!limit.ok) return tooManyAttempts(limit.retryAfterSec);

      const channel = body.channel === "SMS" ? "SMS" : "TELEGRAM";
      const company = getCompanyRecord(companyId) as ReturnType<typeof getCompanyRecord> & {
        telegram_chat_id?: string;
      };
      const recipient = clean(body.recipient, 80) || clean(company.telegram_chat_id, 80) || "Customer";
      const message = clean(body.message, 500);
      if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
      const entityType = ENTITY_TYPES.has(String(body.entity_type)) ? String(body.entity_type) : "REMINDER";

      let status: "SENT" | "SIMULATED" | "FAILED" = "SIMULATED";

      // Real Telegram Bot API dispatch if TELEGRAM_BOT_TOKEN is configured
      if (channel === "TELEGRAM" && process.env.TELEGRAM_BOT_TOKEN && recipient) {
        try {
          const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: recipient, text: message }),
          });
          status = tgRes.ok ? "SENT" : "FAILED";
        } catch {
          status = "FAILED";
        }
      }

      // Real SMS webhook dispatch if SMS_WEBHOOK_URL is configured by the operator (not by users)
      if (channel === "SMS" && process.env.SMS_WEBHOOK_URL && recipient) {
        try {
          const smsRes = await fetch(process.env.SMS_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}),
            },
            body: JSON.stringify({ to: recipient, message }),
          });
          status = smsRes.ok ? "SENT" : "FAILED";
        } catch {
          status = "FAILED";
        }
      }

      const res = db
        .prepare(`
          INSERT INTO notification_logs (company_id, channel, recipient, entity_type, entity_id, message, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(companyId, channel, recipient, entityType, body.entity_id ?? null, message, status);

      logAudit(companyId, auth.user.id, `SEND_${channel}`, "ALERT", Number(res.lastInsertRowid), `Dispatched ${channel} alert to ${recipient} (${status})`);
      return NextResponse.json({ id: Number(res.lastInsertRowid), status }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
