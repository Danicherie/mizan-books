import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { computeEmployeePay, computeFinancialStatements, getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import {
  EMPLOYEE_MONEY_FIELDS,
  fromMinor,
  minorFromSql,
  mulMinor,
  PAYROLL_ITEM_MONEY_FIELDS,
  PAYROLL_RUN_MONEY_FIELDS,
  toMinor,
  withMajorMoney,
} from "@/lib/money";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const company = getCompanyRecord(companyId);
  const db = getDb();

  const employees = db
    .prepare("SELECT * FROM employees WHERE company_id = ? AND active = 1 ORDER BY employee_code ASC")
    .all(companyId) as Array<{
    id: number;
    employee_code: string;
    full_name: string;
    job_title: string;
    department: string;
    tin_number: string;
    base_salary: number;
    transport_allowance: number;
    housing_allowance: number;
    bank_account: string;
  }>;

  const employeesWithPreview = employees.map((e) => {
    const pay = computeEmployeePay(
      {
        base_salary: minorFromSql(e.base_salary),
        transport_allowance: minorFromSql(e.transport_allowance),
        housing_allowance: minorFromSql(e.housing_allowance),
      },
      company.tax_regime
    );
    return {
      ...withMajorMoney(e, EMPLOYEE_MONEY_FIELDS),
      preview: {
        gross: fromMinor(pay.gross),
        taxable: fromMinor(pay.taxable),
        incomeTax: fromMinor(pay.tax),
        empPension: fromMinor(pay.empPen),
        coPension: fromMinor(pay.coPen),
        net: fromMinor(pay.net),
      },
    };
  });

  const runs = db
    .prepare("SELECT * FROM payroll_runs WHERE company_id = ? ORDER BY pay_date DESC, id DESC")
    .all(companyId) as Array<Record<string, unknown>>;

  const itemsStmt = db.prepare(`
    SELECT pi.*, e.full_name, e.employee_code, e.department, e.job_title, e.tin_number, e.bank_account,
           e.base_salary, e.transport_allowance, e.housing_allowance
    FROM payroll_items pi
    JOIN employees e ON e.id = pi.employee_id AND e.company_id = ?
    WHERE pi.payroll_run_id = ?
  `);
  const hydratedRuns = runs.map((r) => ({
    ...withMajorMoney(r, PAYROLL_RUN_MONEY_FIELDS),
    items: (itemsStmt.all(companyId, r.id as number) as Array<Record<string, unknown>>).map((item) =>
      withMajorMoney(withMajorMoney(item, PAYROLL_ITEM_MONEY_FIELDS), EMPLOYEE_MONEY_FIELDS)
    ),
  }));

  const statements = computeFinancialStatements(companyId);

  const toBaseMajor = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => {
      const rate = Number(row.exchange_rate ?? 1);
      const { exchange_rate: _rate, subtotal, vat_amount, wht_amount, ...rest } = row;
      void _rate;
      return {
        ...rest,
        base_subtotal: fromMinor(mulMinor(minorFromSql(subtotal), rate)),
        base_vat: fromMinor(mulMinor(minorFromSql(vat_amount), rate)),
        base_wht: fromMinor(mulMinor(minorFromSql(wht_amount), rate)),
      };
    });

  const vatOutputInvoices = toBaseMajor(
    db
      .prepare(`
        SELECT i.invoice_number, i.issue_date, c.name AS party_name, c.tin_number,
               i.subtotal, i.vat_amount, i.wht_amount, i.exchange_rate
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        WHERE i.company_id = ? AND (i.vat_amount > 0 OR i.wht_amount > 0)
        ORDER BY i.issue_date DESC
      `)
      .all(companyId) as Array<Record<string, unknown>>
  );

  const vatInputBills = toBaseMajor(
    db
      .prepare(`
        SELECT b.bill_number, b.issue_date, v.name AS party_name, v.tin_number,
               b.subtotal, b.vat_amount, b.wht_amount, b.exchange_rate
        FROM bills b
        JOIN vendors v ON v.id = b.vendor_id
        WHERE b.company_id = ? AND (b.vat_amount > 0 OR b.wht_amount > 0)
        ORDER BY b.issue_date DESC
      `)
      .all(companyId) as Array<Record<string, unknown>>
  );

  return NextResponse.json({
    company,
    employees: employeesWithPreview,
    payrollRuns: hydratedRuns,
    taxSummary: statements.taxSummary,
    taxFilings: {
      vatOutputInvoices,
      vatInputBills,
    },
  });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "add_employee" | "run_payroll";
      companyId: number;
      // Employee fields
      employee_code?: string;
      full_name?: string;
      job_title?: string;
      department?: string;
      tin_number?: string;
      base_salary?: number;
      transport_allowance?: number;
      housing_allowance?: number;
      bank_account?: string;
      // Payroll run fields
      period_label?: string;
      pay_date?: string;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const blocked = guardCompanyMutation(auth.user, companyId);
    if (blocked) return blocked;
    const company = getCompanyRecord(companyId);
    const db = getDb();

    if (body.action === "add_employee") {
      if (!body.full_name?.trim() || body.full_name.trim().length > 200) {
        return NextResponse.json({ error: "Employee full name is required" }, { status: 400 });
      }
      const count = (db.prepare("SELECT COUNT(*) as c FROM employees WHERE company_id = ?").get(companyId) as { c: number }).c;
      const empCode = body.employee_code?.trim() || `EMP-${String(count + 1).padStart(3, "0")}`;
      const res = db
        .prepare(`
          INSERT INTO employees (company_id, employee_code, full_name, job_title, department, tin_number, base_salary, transport_allowance, housing_allowance, bank_account)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          companyId,
          empCode,
          body.full_name.trim(),
          body.job_title || "",
          body.department || "General",
          body.tin_number || "",
          toMinor(body.base_salary || 0),
          toMinor(body.transport_allowance || 0),
          toMinor(body.housing_allowance || 0),
          body.bank_account || ""
        );
      const id = Number(res.lastInsertRowid);
      logAudit(companyId, auth.user.id, "ADD_EMPLOYEE", "EMPLOYEE", id, `Added employee ${body.full_name} (${empCode})`);
      return NextResponse.json({ id }, { status: 201 });
    }

    if (body.action === "run_payroll") {
      if (!body.period_label?.trim() || !body.pay_date) {
        return NextResponse.json({ error: "Period label and pay date are required" }, { status: 400 });
      }
      const employees = db
        .prepare("SELECT * FROM employees WHERE company_id = ? AND active = 1")
        .all(companyId) as Array<{
        id: number;
        base_salary: number;
        transport_allowance: number;
        housing_allowance: number;
      }>;
      if (!employees.length) {
        return NextResponse.json({ error: "No active employees found" }, { status: 400 });
      }

      const computed = employees.map((e) => {
        const pay = computeEmployeePay(
          {
            base_salary: minorFromSql(e.base_salary),
            transport_allowance: minorFromSql(e.transport_allowance),
            housing_allowance: minorFromSql(e.housing_allowance),
          },
          company.tax_regime
        );
        return { employee_id: e.id, ...pay };
      });

      const totGross = computed.reduce((sum, row) => sum + row.gross, 0);
      const totTax = computed.reduce((sum, row) => sum + row.tax, 0);
      const totEmpPen = computed.reduce((sum, row) => sum + row.empPen, 0);
      const totCoPen = computed.reduce((sum, row) => sum + row.coPen, 0);
      const totNet = computed.reduce((sum, row) => sum + row.net, 0);

      const salAcct = getAccountByCode(companyId, "6000").id;
      const penExpAcct = getAccountByCode(companyId, "6010").id;
      const payeAcct = getAccountByCode(companyId, "2200").id;
      const penPayAcct = getAccountByCode(companyId, "2210").id;
      const bankAcct = getAccountByCode(companyId, "1010").id;

      const lines = [
        { account_id: salAcct, description: `Gross Salaries - ${body.period_label}`, debit: fromMinor(totGross), credit: 0 },
        { account_id: bankAcct, description: `Net Payroll Disbursement - ${body.period_label}`, debit: 0, credit: fromMinor(totNet) },
      ];
      if (totCoPen > 0) {
        lines.push({ account_id: penExpAcct, description: `Employer Pension (11%) - ${body.period_label}`, debit: fromMinor(totCoPen), credit: 0 });
      }
      if (totTax > 0) {
        lines.push({ account_id: payeAcct, description: `PAYE Income Tax Payable - ${body.period_label}`, debit: 0, credit: fromMinor(totTax) });
      }
      if (totEmpPen + totCoPen > 0) {
        lines.push({
          account_id: penPayAcct,
          description: `Pension Contributions Payable (7%+11%) - ${body.period_label}`,
          debit: 0,
          credit: fromMinor(totEmpPen + totCoPen),
        });
      }

      const jeId = postJournalEntry({
        company_id: companyId,
        entry_date: body.pay_date,
        reference: `PAY-${body.pay_date}`,
        description: `Payroll Run - ${body.period_label}`,
        source_type: "PAYROLL",
        created_by: auth.user.id,
        currency_code: company.base_currency,
        lines,
      });

      const runRes = db
        .prepare(`
          INSERT INTO payroll_runs (company_id, period_label, pay_date, total_gross, total_income_tax, total_employee_pension, total_employer_pension, total_net, status, journal_entry_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)
        `)
        .run(companyId, body.period_label.trim(), body.pay_date, totGross, totTax, totEmpPen, totCoPen, totNet, jeId);

      const runId = Number(runRes.lastInsertRowid);
      const insItem = db.prepare(`
        INSERT INTO payroll_items (payroll_run_id, employee_id, gross_salary, taxable_income, income_tax, employee_pension, employer_pension, net_salary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of computed) {
        insItem.run(runId, c.employee_id, c.gross, c.taxable, c.tax, c.empPen, c.coPen, c.net);
      }

      logAudit(companyId, auth.user.id, "RUN_PAYROLL", "PAYROLL", runId, `Posted payroll for ${body.period_label}: Gross ${totGross}, Net ${totNet}`);
      return NextResponse.json({ id: runId, journal_entry_id: jeId }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
