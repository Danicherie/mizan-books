import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireWrite, userHasCompanyAccess } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { rateToBaseOn, supplierPaymentLines } from "@/lib/fx";
import { fromMinor, minorFromSql, toMinor } from "@/lib/money";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const billId = Number(id);
    const body = (await request.json()) as {
      amount: number;
      payment_date: string;
      account_id?: number;
      reference?: string;
    };

    const db = getDb();
    const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId) as {
      id: number;
      company_id: number;
      bill_number: string;
      currency_code: string;
      exchange_rate: number;
      total: number;
      amount_paid: number;
    } | undefined;

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    if (!userHasCompanyAccess(auth.user.id, bill.company_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const blocked = guardCompanyMutation(auth.user, bill.company_id);
    if (blocked) return blocked;

    const totalMinor = minorFromSql(bill.total);
    const paidMinor = minorFromSql(bill.amount_paid);
    const remaining = totalMinor - paidMinor;
    const payAmount = toMinor(body.amount);
    if (payAmount <= 0 || payAmount > remaining) {
      return NextResponse.json({ error: `Payment must be between 0 and ${fromMinor(remaining)}` }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.payment_date || "")) {
      return NextResponse.json({ error: "Choose a valid payment date." }, { status: 400 });
    }
    const company = getCompanyRecord(bill.company_id);
    const cashAcctId = body.account_id || getAccountByCode(bill.company_id, "1010").id;
    const apAcctId = getAccountByCode(bill.company_id, "2000").id;
    const fxAcctId = getAccountByCode(bill.company_id, "4200").id;
    const payRate = rateToBaseOn(bill.company_id, bill.currency_code, company.base_currency, body.payment_date);

    const jeId = postJournalEntry({
      company_id: bill.company_id,
      entry_date: body.payment_date,
      reference: body.reference || `PAY-${bill.bill_number}`,
      description: `Vendor payment for ${bill.bill_number}`,
      source_type: "BILL_PAYMENT",
      source_id: bill.id,
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: supplierPaymentLines({
        foreignMinor: payAmount,
        bookedRate: bill.exchange_rate,
        payRate,
        bankAccountId: cashAcctId,
        apAccountId: apAcctId,
        fxAccountId: fxAcctId,
        description: `Vendor payment ${bill.bill_number}`,
      }),
    });

    const newPaid = paidMinor + payAmount;
    const newStatus = newPaid >= totalMinor ? "PAID" : "PARTIAL";
    db.prepare("UPDATE bills SET amount_paid = ?, status = ? WHERE id = ?").run(newPaid, newStatus, bill.id);

    logAudit(bill.company_id, auth.user.id, "BILL_PAYMENT", "BILL", bill.id, `Paid ${bill.currency_code} ${fromMinor(payAmount)} on ${bill.bill_number}`);
    return NextResponse.json({ ok: true, status: newStatus, amount_paid: fromMinor(newPaid), journal_entry_id: jeId });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
