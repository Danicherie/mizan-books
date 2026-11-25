import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { calculateIncomeTax, computeFinancialStatements, getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

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

  // Preview monthly calculation per employee
  const employeesWithPreview = employees.map((e) => {
    const gross = Number((e.base_salary + e.transport_allowance + e.housing_allowance).toFixed(2));
    const transportExempt = company.tax_regime === "ET_STANDARD" ? Math.min(e.transport_allowance, 600) : 0;
    const taxable = Math.max(0, gross - transportExempt);
    const incomeTax = Number(calculateIncomeTax(taxable, company.tax_regime).toFixed(2));
    const empPension = company.tax_regime === "ET_STANDARD" ? Number((e.base_salary * 0.07).toFixed(2)) : 0;
    const coPension = company.tax_regime === "ET_STANDARD" ? Number((e.base_salary * 0.11).toFixed(2)) : 0;
    const net = Number((gross - incomeTax - empPension).toFixed(2));
    return {
      ...e,
      preview: { gross, taxable, incomeTax, empPension, coPension, net },
    };
  });

  const runs = db
    .prepare("SELECT * FROM payroll_runs WHERE company_id = ? ORDER BY pay_date DESC, id DESC")
    .all(companyId) as Array<Record<string, unknown>>;

  const itemsStmt = db.prepare(`
    SELECT pi.*, e.full_name, e.employee_code, e.department
    FROM payroll_items pi
    JOIN employees e ON e.id = pi.employee_id
    WHERE pi.payroll_run_id = ?
  `);
  const hydratedRuns = runs.map((r) => ({
    ...r,
    items: itemsStmt.all(r.id as number),
  }));

  const statements = computeFinancialStatements(companyId);

  return NextResponse.json({
    company,
    employees: employeesWithPreview,
    payrollRuns: hydratedRuns,
    taxSummary: statements.taxSummary,
  });
}

export async function POST(request: Request) {
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
    const company = getCompanyRecord(companyId);
    const db = getDb();

    if (body.action === "add_employee") {
      if (!body.full_name?.trim()) {
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
          Number(body.base_salary || 0),
          Number(body.transport_allowance || 0),
          Number(body.housing_allowance || 0),
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

      let totGross = 0;
      let totTax = 0;
      let totEmpPen = 0;
      let totCoPen = 0;
      let totNet = 0;

      const computed = employees.map((e) => {
        const gross = Number((e.base_salary + e.transport_allowance + e.housing_allowance).toFixed(2));
        const transportExempt = company.tax_regime === "ET_STANDARD" ? Math.min(e.transport_allowance, 600) : 0;
        const taxable = Math.max(0, gross - transportExempt);
        const tax = Number(calculateIncomeTax(taxable, company.tax_regime).toFixed(2));
        const empPen = company.tax_regime === "ET_STANDARD" ? Number((e.base_salary * 0.07).toFixed(2)) : 0;
        const coPen = company.tax_regime === "ET_STANDARD" ? Number((e.base_salary * 0.11).toFixed(2)) : 0;
        const net = Number((gross - tax - empPen).toFixed(2));
        totGross += gross;
        totTax += tax;
        totEmpPen += empPen;
        totCoPen += coPen;
        totNet += net;
        return { employee_id: e.id, gross, taxable, tax, empPen, coPen, net };
      });

      totGross = Number(totGross.toFixed(2));
      totTax = Number(totTax.toFixed(2));
      totEmpPen = Number(totEmpPen.toFixed(2));
      totCoPen = Number(totCoPen.toFixed(2));
      totNet = Number(totNet.toFixed(2));

      const salAcct = getAccountByCode(companyId, "6000").id;
      const penExpAcct = getAccountByCode(companyId, "6010").id;
      const payeAcct = getAccountByCode(companyId, "2200").id;
      const penPayAcct = getAccountByCode(companyId, "2210").id;
      const bankAcct = getAccountByCode(companyId, "1010").id;

      const lines = [
        { account_id: salAcct, description: `Gross Salaries - ${body.period_label}`, debit: totGross, credit: 0 },
        { account_id: bankAcct, description: `Net Payroll Disbursement - ${body.period_label}`, debit: 0, credit: totNet },
      ];
      if (totCoPen > 0) {
        lines.push({ account_id: penExpAcct, description: `Employer Pension (11%) - ${body.period_label}`, debit: totCoPen, credit: 0 });
      }
      if (totTax > 0) {
        lines.push({ account_id: payeAcct, description: `PAYE Income Tax Payable - ${body.period_label}`, debit: 0, credit: totTax });
      }
      if (totEmpPen + totCoPen > 0) {
        lines.push({
          account_id: penPayAcct,
          description: `Pension Contributions Payable (7%+11%) - ${body.period_label}`,
          debit: 0,
          credit: Number((totEmpPen + totCoPen).toFixed(2)),
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
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
