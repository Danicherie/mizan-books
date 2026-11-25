import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, requireWrite, userHasCompanyAccess } from "@/lib/api-helpers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const invoiceId = Number(id);
    const body = (await request.json()) as {
      amount: number;
      payment_date: string;
      account_id?: number;
      reference?: string;
    };

    const db = getDb();
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as {
      id: number;
      company_id: number;
      invoice_number: string;
      currency_code: string;
      exchange_rate: number;
      total: number;
      amount_paid: number;
      status: string;
    } | undefined;

    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (!userHasCompanyAccess(auth.user.id, inv.company_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const remaining = Number((inv.total - inv.amount_paid).toFixed(2));
    const payAmount = Number(Number(body.amount).toFixed(2));
    if (payAmount <= 0 || payAmount > remaining + 0.05) {
      return NextResponse.json({ error: `Payment must be between 0 and ${remaining}` }, { status: 400 });
    }

    const company = getCompanyRecord(inv.company_id);
    const depositAcctId = body.account_id || getAccountByCode(inv.company_id, "1010").id;
    const arAcctId = getAccountByCode(inv.company_id, "1100").id;
    const basePayAmount = Number((payAmount * inv.exchange_rate).toFixed(2));

    const jeId = postJournalEntry({
      company_id: inv.company_id,
      entry_date: body.payment_date,
      reference: body.reference || `PAY-${inv.invoice_number}`,
      description: `Customer payment for ${inv.invoice_number}`,
      source_type: "INVOICE_PAYMENT",
      source_id: inv.id,
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: [
        { account_id: depositAcctId, description: `Deposit for ${inv.invoice_number}`, debit: basePayAmount, credit: 0 },
        { account_id: arAcctId, description: `Clear AR ${inv.invoice_number}`, debit: 0, credit: basePayAmount },
      ],
    });

    const newPaid = Number((inv.amount_paid + payAmount).toFixed(2));
    const newStatus = newPaid >= inv.total - 0.02 ? "PAID" : "PARTIAL";
    db.prepare("UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?").run(newPaid, newStatus, inv.id);

    logAudit(inv.company_id, auth.user.id, "INVOICE_PAYMENT", "INVOICE", inv.id, `Recorded payment of ${inv.currency_code} ${payAmount} on ${inv.invoice_number}`);
    return NextResponse.json({ ok: true, status: newStatus, amount_paid: newPaid, journal_entry_id: jeId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
