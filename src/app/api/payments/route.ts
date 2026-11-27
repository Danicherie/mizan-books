import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { getTodayIso } from "@/lib/calendar";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { customerReceiptLines, rateToBaseOn } from "@/lib/fx";
import { fromMinor, INVOICE_MONEY_FIELDS, minorFromSql, withMajorMoney } from "@/lib/money";

/**
 * Sandbox completion is a developer test switch. It must stay off in production,
 * otherwise anyone signed in could mark a payment as received without paying.
 */
function sandboxPaymentsEnabled(): boolean {
  return (process.env.ENABLE_SANDBOX_PAYMENTS ?? "").trim().toLowerCase() === "true";
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const transactions = (
    db
      .prepare("SELECT * FROM payment_transactions WHERE company_id = ? ORDER BY id DESC LIMIT 50")
      .all(companyId) as Array<Record<string, unknown>>
  ).map((tx) => withMajorMoney(tx, ["amount"]));

  const openInvoices = (db
    .prepare(`
      SELECT i.id, i.invoice_number, i.currency_code, i.total, i.amount_paid, i.due_date, c.name AS customer_name, c.email AS customer_email
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ? AND i.status IN ('SENT', 'PARTIAL', 'OVERDUE')
      ORDER BY i.due_date ASC
    `)
    .all(companyId) as Array<Record<string, unknown>>).map((inv) => withMajorMoney(inv, INVOICE_MONEY_FIELDS));

  return NextResponse.json({
    providers: {
      chapaLive: Boolean(process.env.CHAPA_SECRET_KEY),
      stripeLive: Boolean(process.env.STRIPE_SECRET_KEY),
      sandboxEnabled: sandboxPaymentsEnabled(),
    },
    transactions,
    openInvoices,
  });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "init_checkout" | "complete_sandbox";
      companyId: number;
      provider?: "CHAPA" | "STRIPE";
      purpose?: "INVOICE" | "SUBSCRIPTION";
      invoiceId?: number;
      txRef?: string;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    const company = getCompanyRecord(companyId);
    const db = getDb();

    if (body.action === "init_checkout") {
      if (body.provider !== "CHAPA" && body.provider !== "STRIPE") {
        return NextResponse.json({ error: "Choose Chapa or Stripe." }, { status: 400 });
      }
      const provider = body.provider;
      if ((body.purpose ?? "INVOICE") !== "INVOICE") {
        // Subscription prices are not set yet, and a subscription must only be activated by the owner or a verified payment.
        return NextResponse.json({ error: "Paying for a Mizan Books subscription online is not available yet." }, { status: 400 });
      }

      const inv = db
        .prepare(`
          SELECT i.*, c.name AS customer_name, c.email AS customer_email
          FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE i.id = ? AND i.company_id = ?
        `)
        .get(Number(body.invoiceId ?? 0), companyId) as {
        id: number;
        invoice_number: string;
        currency_code: string;
        total: number;
        amount_paid: number;
        customer_name: string;
        customer_email: string;
      } | undefined;
      if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      const amountMinor = minorFromSql(inv.total) - minorFromSql(inv.amount_paid);
      if (amountMinor <= 0) return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
      if (provider === "CHAPA" && inv.currency_code !== "ETB") {
        return NextResponse.json({ error: "Chapa only takes Ethiopian birr (ETB) invoices." }, { status: 400 });
      }
      const currency = inv.currency_code;
      const customerEmail = inv.customer_email || auth.user.email;
      const description = `Payment for ${inv.invoice_number} (${inv.customer_name})`;
      const meta = { invoice_number: inv.invoice_number, customer_name: inv.customer_name };

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
              amount: String(fromMinor(amountMinor)),
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
          // Fall back cleanly to a sandbox record if the network is unavailable
        }
      }

      // Live Stripe Checkout Session if STRIPE_SECRET_KEY is configured
      if (provider === "STRIPE" && process.env.STRIPE_SECRET_KEY) {
        try {
          const appUrl = process.env.APP_URL || process.env.ALLOWED_ORIGIN || "http://localhost:3000";
          const params = new URLSearchParams({
            mode: "payment",
            "line_items[0][price_data][currency]": currency.toLowerCase(),
            "line_items[0][price_data][product_data][name]": description,
            "line_items[0][price_data][unit_amount]": String(amountMinor),
            "line_items[0][quantity]": "1",
            success_url: `${appUrl}/app?paid=${txRef}`,
            cancel_url: `${appUrl}/app`,
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
          // Fall back cleanly to a sandbox record
        }
      }

      db.prepare(`
        INSERT INTO payment_transactions (company_id, provider, purpose, reference_id, tx_ref, currency_code, amount, status, checkout_url, mode, meta_json)
        VALUES (?, ?, 'INVOICE', ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `).run(companyId, provider, inv.id, txRef, currency, amountMinor, checkoutUrl, mode, JSON.stringify(meta));

      logAudit(companyId, auth.user.id, "INIT_PAYMENT", "PAYMENT", inv.id, `Initialized ${provider} (${mode}) checkout ${txRef} for ${currency} ${fromMinor(amountMinor)}`);

      return NextResponse.json(
        { txRef, provider, purpose: "INVOICE", currency, amount: fromMinor(amountMinor), mode, checkoutUrl, description },
        { status: 201 }
      );
    }

    if (body.action === "complete_sandbox") {
      if (!sandboxPaymentsEnabled()) {
        return NextResponse.json(
          { error: "Test payments are turned off. Online payments are confirmed by the payment provider only." },
          { status: 403 }
        );
      }
      const tx = db
        .prepare("SELECT * FROM payment_transactions WHERE tx_ref = ? AND company_id = ?")
        .get(String(body.txRef ?? ""), companyId) as {
        id: number;
        provider: string;
        purpose: string;
        reference_id: number | null;
        tx_ref: string;
        currency_code: string;
        amount: number;
        status: string;
        mode: string;
      } | undefined;
      if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      if (tx.mode !== "SANDBOX") {
        return NextResponse.json({ error: "Only test payments can be completed this way." }, { status: 400 });
      }
      if (tx.status === "COMPLETED") return NextResponse.json({ ok: true, alreadyCompleted: true });
      if (tx.purpose !== "INVOICE" || !tx.reference_id) {
        return NextResponse.json({ error: "This payment cannot be completed." }, { status: 400 });
      }

      const inv = db.prepare("SELECT * FROM invoices WHERE id = ? AND company_id = ?").get(tx.reference_id, companyId) as {
        id: number;
        invoice_number: string;
        total: number;
        amount_paid: number;
        exchange_rate: number;
      } | undefined;
      if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

      const totalMinor = minorFromSql(inv.total);
      const paidMinor = minorFromSql(inv.amount_paid);
      const payMinor = Math.min(minorFromSql(tx.amount), totalMinor - paidMinor);
      if (payMinor > 0) {
        const payDate = getTodayIso();
        const payRate = rateToBaseOn(companyId, tx.currency_code, company.base_currency, payDate);
        const bankAcct = getAccountByCode(companyId, "1010").id;
        const arAcct = getAccountByCode(companyId, "1100").id;
        const fxAcct = getAccountByCode(companyId, "4200").id;
        postJournalEntry({
          company_id: companyId,
          entry_date: payDate,
          reference: tx.tx_ref,
          description: `${tx.provider} test payment for ${inv.invoice_number}`,
          source_type: "INVOICE_PAYMENT",
          source_id: inv.id,
          created_by: auth.user.id,
          currency_code: company.base_currency,
          lines: customerReceiptLines({
            foreignMinor: payMinor,
            bookedRate: inv.exchange_rate,
            payRate,
            bankAccountId: bankAcct,
            arAccountId: arAcct,
            fxAccountId: fxAcct,
            description: `${tx.provider} settlement ${inv.invoice_number}`,
          }),
        });
        const newPaid = paidMinor + payMinor;
        db.prepare("UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?").run(
          newPaid,
          newPaid >= totalMinor ? "PAID" : "PARTIAL",
          inv.id
        );
      }
      db.prepare("UPDATE payment_transactions SET status = 'COMPLETED' WHERE id = ?").run(tx.id);

      logAudit(companyId, auth.user.id, "COMPLETE_PAYMENT", "PAYMENT", tx.reference_id, `Completed test ${tx.provider} payment ${tx.tx_ref} (${tx.currency_code} ${fromMinor(minorFromSql(tx.amount))})`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
