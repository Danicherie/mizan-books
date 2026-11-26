import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { getTodayIso } from "@/lib/calendar";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const transactions = db
    .prepare("SELECT * FROM payment_transactions WHERE company_id = ? ORDER BY id DESC LIMIT 50")
    .all(companyId);

  const openInvoices = db
    .prepare(`
      SELECT i.id, i.invoice_number, i.currency_code, i.total, i.amount_paid, i.due_date, c.name AS customer_name, c.email AS customer_email
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ? AND i.status IN ('SENT', 'PARTIAL', 'OVERDUE')
      ORDER BY i.due_date ASC
    `)
    .all(companyId);

  return NextResponse.json({
    providers: {
      chapaLive: Boolean(process.env.CHAPA_SECRET_KEY),
      stripeLive: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    transactions,
    openInvoices,
  });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "init_checkout" | "complete_sandbox";
      companyId: number;
      provider?: "CHAPA" | "STRIPE";
      purpose?: "INVOICE" | "SUBSCRIPTION";
      invoiceId?: number;
      planName?: "BUSINESS" | "ENTERPRISE";
      txRef?: string;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const company = getCompanyRecord(companyId);
    const db = getDb();

    if (body.action === "init_checkout") {
      const provider = body.provider || "CHAPA";
      const purpose = body.purpose || "INVOICE";
      let amount = 0;
      let currency = provider === "CHAPA" ? "ETB" : "USD";
      let referenceId: number | null = null;
      let customerEmail = auth.user.email;
      let description = "";
      let meta: Record<string, unknown> = {};

      if (purpose === "INVOICE") {
        const inv = db
          .prepare(`
            SELECT i.*, c.name AS customer_name, c.email AS customer_email
            FROM invoices i JOIN customers c ON c.id = i.customer_id
            WHERE i.id = ? AND i.company_id = ?
          `)
          .get(body.invoiceId ?? 0, companyId) as {
          id: number;
          invoice_number: string;
          currency_code: string;
          total: number;
          amount_paid: number;
          customer_name: string;
          customer_email: string;
        } | undefined;
        if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        amount = Number((inv.total - inv.amount_paid).toFixed(2));
        if (amount <= 0) return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
        currency = provider === "CHAPA" ? "ETB" : inv.currency_code;
        referenceId = inv.id;
        customerEmail = inv.customer_email || auth.user.email;
        description = `Payment for ${inv.invoice_number} (${inv.customer_name})`;
        meta = { invoice_number: inv.invoice_number, customer_name: inv.customer_name };
      } else {
        const plan = body.planName || "BUSINESS";
        amount = plan === "ENTERPRISE" ? (provider === "CHAPA" ? 9800 : 79) : provider === "CHAPA" ? 3600 : 29;
        currency = provider === "CHAPA" ? "ETB" : "USD";
        description = `Mizan Books ${plan} Plan Subscription`;
        meta = { plan_name: plan };
      }

      const txRef = `MZN-${provider}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      let checkoutUrl = "";
      let mode: "LIVE" | "SANDBOX" = "SANDBOX";

      // Live Chapa API (Ethiopia) if CHAPA_SECRET_KEY is configured
      if (provider === "CHAPA" && process.env.CHAPA_SECRET_KEY) {
        try {
          const chapaRes = await fetch("https://api.chapa.co/v1/transaction/initialize", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: String(amount),
              currency: "ETB",
              email: customerEmail,
              first_name: auth.user.name.split(" ")[0] || "Customer",
              last_name: auth.user.name.split(" ").slice(1).join(" ") || "Mizan",
              tx_ref: txRef,
              customization: { title: "Mizan Books", description },
            }),
          });
          const chapaJson = (await chapaRes.json()) as { data?: { checkout_url?: string } };
          if (chapaRes.ok && chapaJson.data?.checkout_url) {
            checkoutUrl = chapaJson.data.checkout_url;
            mode = "LIVE";
          }
        } catch {
          // Fall back cleanly to sandbox checkout if network unavailable
        }
      }

      // Live Stripe Checkout Session if STRIPE_SECRET_KEY is configured
      if (provider === "STRIPE" && process.env.STRIPE_SECRET_KEY) {
        try {
          const params = new URLSearchParams({
            mode: "payment",
            "line_items[0][price_data][currency]": currency.toLowerCase(),
            "line_items[0][price_data][product_data][name]": description,
            "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
            "line_items[0][quantity]": "1",
            success_url: `${process.env.APP_URL || "http://localhost:3000"}/?paid=${txRef}`,
            cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/`,
            client_reference_id: txRef,
          });
          const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });
          const stripeJson = (await stripeRes.json()) as { url?: string };
          if (stripeRes.ok && stripeJson.url) {
            checkoutUrl = stripeJson.url;
            mode = "LIVE";
          }
        } catch {
          // Fall back cleanly to sandbox checkout
        }
      }

      db.prepare(`
        INSERT INTO payment_transactions (company_id, provider, purpose, reference_id, tx_ref, currency_code, amount, status, checkout_url, mode, meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `).run(companyId, provider, purpose, referenceId, txRef, currency, amount, checkoutUrl, mode, JSON.stringify(meta));

      logAudit(companyId, auth.user.id, "INIT_PAYMENT", "PAYMENT", referenceId, `Initialized ${provider} (${mode}) checkout ${txRef} for ${currency} ${amount}`);

      return NextResponse.json({ txRef, provider, purpose, currency, amount, mode, checkoutUrl, description }, { status: 201 });
    }

    if (body.action === "complete_sandbox") {
      const tx = db
        .prepare("SELECT * FROM payment_transactions WHERE tx_ref = ? AND company_id = ?")
        .get(body.txRef ?? "", companyId) as {
        id: number;
        provider: string;
        purpose: string;
        reference_id: number | null;
        tx_ref: string;
        currency_code: string;
        amount: number;
        status: string;
        meta_json: string;
      } | undefined;
      if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      if (tx.status === "COMPLETED") return NextResponse.json({ ok: true, alreadyCompleted: true });

      db.prepare("UPDATE payment_transactions SET status = 'COMPLETED' WHERE id = ?").run(tx.id);

      if (tx.purpose === "INVOICE" && tx.reference_id) {
        const inv = db.prepare("SELECT * FROM invoices WHERE id = ? AND company_id = ?").get(tx.reference_id, companyId) as {
          id: number;
          invoice_number: string;
          total: number;
          amount_paid: number;
          exchange_rate: number;
        } | undefined;
        if (inv) {
          const remaining = Number((inv.total - inv.amount_paid).toFixed(2));
          if (remaining > 0) {
            const basePay = Number((remaining * inv.exchange_rate).toFixed(2));
            const bankAcct = getAccountByCode(companyId, "1010").id;
            const arAcct = getAccountByCode(companyId, "1100").id;
            postJournalEntry({
              company_id: companyId,
              entry_date: getTodayIso(),
              reference: tx.tx_ref,
              description: `${tx.provider} Online Payment for ${inv.invoice_number}`,
              source_type: "INVOICE_PAYMENT",
              source_id: inv.id,
              created_by: auth.user.id,
              currency_code: company.base_currency,
              lines: [
                { account_id: bankAcct, description: `${tx.provider} Settlement ${inv.invoice_number}`, debit: basePay, credit: 0 },
                { account_id: arAcct, description: `Clear AR ${inv.invoice_number}`, debit: 0, credit: basePay },
              ],
            });
            db.prepare("UPDATE invoices SET amount_paid = total, status = 'PAID' WHERE id = ?").run(inv.id);
          }
        }
      } else if (tx.purpose === "SUBSCRIPTION") {
        const meta = JSON.parse(tx.meta_json || "{}") as { plan_name?: string };
        const plan = meta.plan_name || "BUSINESS";
        db.prepare("UPDATE companies SET plan_name = ?, subscription_status = 'ACTIVE' WHERE id = ?").run(plan, companyId);
      }

      logAudit(companyId, auth.user.id, "COMPLETE_PAYMENT", "PAYMENT", tx.reference_id, `Completed ${tx.provider} payment ${tx.tx_ref} (${tx.currency_code} ${tx.amount})`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
