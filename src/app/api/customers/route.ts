import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { fromMinor, mulMinor, toMinor, withMajorMoney } from "@/lib/money";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const customers = db
    .prepare("SELECT * FROM customers WHERE company_id = ? ORDER BY name ASC")
    .all(companyId) as Array<Record<string, unknown>>;
  const invoices = db
    .prepare("SELECT customer_id, total, amount_paid, exchange_rate, status FROM invoices WHERE company_id = ?")
    .all(companyId) as Array<{
    customer_id: number;
    total: number;
    amount_paid: number;
    exchange_rate: number;
    status: string;
  }>;
  const openMinor = new Map<number, number>();
  const invoiceCount = new Map<number, number>();
  for (const invoice of invoices) {
    invoiceCount.set(invoice.customer_id, (invoiceCount.get(invoice.customer_id) ?? 0) + 1);
    if (invoice.status === "DRAFT") continue;
    const open = mulMinor(invoice.total - invoice.amount_paid, invoice.exchange_rate);
    openMinor.set(invoice.customer_id, (openMinor.get(invoice.customer_id) ?? 0) + open);
  }

  return NextResponse.json({
    customers: customers.map((customer) => ({
      ...withMajorMoney(customer, ["credit_limit"]),
      open_balance: fromMinor(openMinor.get(Number(customer.id)) ?? 0),
      invoice_count: invoiceCount.get(Number(customer.id)) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;
  try {
    const body = (await request.json()) as {
      companyId: number;
      name: string;
      email?: string;
      phone?: string;
      tin_number?: string;
      address?: string;
      currency_code?: string;
      credit_limit?: number;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO customers (company_id, name, email, phone, tin_number, address, currency_code, credit_limit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        companyId,
        body.name.trim(),
        body.email || "",
        body.phone || "",
        body.tin_number || "",
        body.address || "",
        body.currency_code || "ETB",
        toMinor(body.credit_limit || 0)
      );
    const id = Number(res.lastInsertRowid);
    logAudit(companyId, auth.user.id, "CREATE_CUSTOMER", "CUSTOMER", id, `Added customer ${body.name}`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
