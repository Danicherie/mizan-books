"use client";

import { localizeApiError } from "@/lib/i18n/errors";
import React, { useCallback, useEffect, useState } from "react";
import { Plus, Play, Users, Landmark, ReceiptText, FileText, Printer } from "lucide-react";
import { getTodayIso } from "@/lib/calendar";
import { useApp } from "../AppContext";
import { Card, CsvButton, exportToCsv, KpiCard, Modal, PageHeader, StatusBadge } from "../ui";

interface EmployeeRow {
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
  preview: {
    gross: number;
    taxable: number;
    incomeTax: number;
    empPension: number;
    coPension: number;
    net: number;
  };
}

interface PayrollRunItem {
  id: number;
  employee_code: string;
  full_name: string;
  department?: string;
  job_title?: string;
  tin_number?: string;
  bank_account?: string;
  base_salary?: number;
  transport_allowance?: number;
  housing_allowance?: number;
  gross_salary: number;
  income_tax: number;
  employee_pension: number;
  employer_pension: number;
  net_salary: number;
}

interface PayrollRun {
  id: number;
  period_label: string;
  pay_date: string;
  total_gross: number;
  total_income_tax: number;
  total_employee_pension: number;
  total_employer_pension: number;
  total_net: number;
  status: string;
  items: PayrollRunItem[];
}

interface TaxSummary {
  vatOutput: number;
  vatInput: number;
  netVatPayable: number;
  whtPayable: number;
  whtReceivable: number;
  payePayable: number;
  pensionPayable: number;
}

interface TaxFilingDoc {
  invoice_number?: string;
  bill_number?: string;
  issue_date: string;
  party_name: string;
  tin_number: string;
  base_subtotal: number;
  base_vat: number;
  base_wht: number;
}

export function PayrollTaxModule() {
  const { activeCompany, t, formatAmt, formatDt, canKeepBooks, showToast } = useApp();
  const [subTab, setSubTab] = useState<"employees" | "runs" | "tax" | "filings">("employees");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [tax, setTax] = useState<TaxSummary | null>(null);
  const [filings, setFilings] = useState<{ vatOutputInvoices: TaxFilingDoc[]; vatInputBills: TaxFilingDoc[] }>({
    vatOutputInvoices: [],
    vatInputBills: [],
  });
  const [loading, setLoading] = useState(true);

  const [openEmp, setOpenEmp] = useState(false);
  const [openRun, setOpenRun] = useState(false);
  const [payslip, setPayslip] = useState<{ run: PayrollRun; item: PayrollRunItem } | null>(null);

  const [empForm, setEmpForm] = useState({
    full_name: "",
    job_title: "",
    department: "Operations",
    tin_number: "",
    base_salary: "15000",
    transport_allowance: "1500",
    housing_allowance: "2000",
    bank_account: "",
  });

  const [periodLabel, setPeriodLabel] = useState("November 2026 (Hidar 2019)");
  const [payDate, setPayDate] = useState(getTodayIso());

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const res = await fetch(`/api/payroll?companyId=${activeCompany.id}`, { cache: "no-store" });
    const data = (await res.json()) as {
      employees: EmployeeRow[];
      payrollRuns: PayrollRun[];
      taxSummary: TaxSummary;
      taxFilings?: { vatOutputInvoices: TaxFilingDoc[]; vatInputBills: TaxFilingDoc[] };
    };
    setEmployees(data.employees || []);
    setRuns(data.payrollRuns || []);
    setTax(data.taxSummary || null);
    setFilings(data.taxFilings || { vatOutputInvoices: [], vatInputBills: [] });
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_employee",
        companyId: activeCompany.id,
        ...empForm,
        base_salary: parseFloat(empForm.base_salary) || 0,
        transport_allowance: parseFloat(empForm.transport_allowance) || 0,
        housing_allowance: parseFloat(empForm.housing_allowance) || 0,
      }),
    });
    if (!res.ok) {
      showToast("error", t.common.error);
      return;
    }
    showToast("success", t.common.success);
    setOpenEmp(false);
    setEmpForm({ full_name: "", job_title: "", department: "Operations", tin_number: "", base_salary: "15000", transport_allowance: "1500", housing_allowance: "2000", bank_account: "" });
    void load();
  }

  async function handleRunPayroll(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompany) return;
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run_payroll",
        companyId: activeCompany.id,
        period_label: periodLabel,
        pay_date: payDate,
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      showToast("error", localizeApiError(t, err.error));
      return;
    }
    showToast("success", t.common.success);
    setOpenRun(false);
    setSubTab("runs");
    void load();
  }

  return (
    <div>
      <PageHeader
        title={t.payroll.title}
        subtitle={t.payroll.subtitle}
        actions={
          canKeepBooks && (
            <>
              <button
                type="button"
                onClick={() => setOpenEmp(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border border-mb-line bg-mb-paper text-mb-ink hover:bg-mb-cream cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.payroll.addEmployee}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenRun(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>{t.payroll.runPayroll}</span>
              </button>
            </>
          )
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 no-print">
        {(
          [
            ["employees", t.payroll.employeesTab],
            ["runs", t.payroll.payrollRunsTab],
            ["tax", t.payroll.taxCenterTab],
            ["filings", t.extras.taxFilingTab],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              subTab === key
                ? "bg-mb-cocoa text-mb-cream"
                : "bg-mb-paper border border-mb-line text-mb-ink hover:bg-mb-cream"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-mb-ink/70">{t.common.loading}</div>
      ) : subTab === "employees" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-mb-beige text-xs text-mb-ink uppercase border-b border-mb-line">
                <tr>
                  <th className="px-4 py-3 text-start">{t.payroll.employeeCode}</th>
                  <th className="px-4 py-3 text-start">{t.payroll.fullName}</th>
                  <th className="px-4 py-3 text-end">{t.payroll.baseSalary}</th>
                  <th className="px-4 py-3 text-end">{t.payroll.grossSalary}</th>
                  <th className="px-4 py-3 text-end">{t.payroll.incomeTax}</th>
                  <th className="px-4 py-3 text-end">{t.payroll.employeePension}</th>
                  <th className="px-4 py-3 text-end">{t.payroll.employerPension}</th>
                  <th className="px-4 py-3 text-end">{t.payroll.netPay}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mb-line/70">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-mb-cream/70">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-mb-ink">{e.employee_code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-mb-cocoa">{e.full_name}</div>
                      <div className="text-xs text-mb-ink/70">
                        {e.job_title} · {e.department}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">{formatAmt(e.base_salary)}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatAmt(e.preview.gross)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-rose-700">{formatAmt(e.preview.incomeTax)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-amber-700">{formatAmt(e.preview.empPension)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-mb-ink">{formatAmt(e.preview.coPension)}</td>
                    <td className="px-4 py-3 text-end font-bold tabular-nums text-mb-cocoa">{formatAmt(e.preview.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : subTab === "runs" ? (
        <div className="space-y-4">
          {runs.length === 0 ? (
            <Card className="p-10 text-center text-sm text-mb-ink/70">{t.common.noData}</Card>
          ) : (
            runs.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <div className="px-5 py-4 bg-mb-beige border-b border-mb-line flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-mb-cocoa">{r.period_label}</h3>
                    <p className="text-xs text-mb-ink">{t.payroll.payDate}: {formatDt(r.pay_date)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span>{t.payroll.grossSalary}: <strong className="tabular-nums">{formatAmt(r.total_gross)}</strong></span>
                    <span>{t.payroll.incomeTax}: <strong className="tabular-nums text-rose-700">{formatAmt(r.total_income_tax)}</strong></span>
                    <span>{t.payroll.netPay}: <strong className="tabular-nums text-mb-cocoa">{formatAmt(r.total_net)}</strong></span>
                    <StatusBadge status={r.status} label={t.common.posted} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-mb-ink uppercase border-b border-mb-line/70">
                      <tr>
                        <th className="px-4 py-2 text-start">{t.payroll.fullName}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.grossSalary}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.incomeTax}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.employeePension}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.employerPension}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.netPay}</th>
                        <th className="px-4 py-2 text-end">{t.common.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mb-line/70">
                      {r.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-4 py-2.5 font-medium text-mb-cocoa">
                            <span className="font-mono text-mb-ink/70 me-2">{it.employee_code}</span>
                            {it.full_name}
                          </td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatAmt(it.gross_salary)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-rose-700">{formatAmt(it.income_tax)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatAmt(it.employee_pension)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatAmt(it.employer_pension)}</td>
                          <td className="px-4 py-2.5 text-end font-bold tabular-nums text-emerald-700">{formatAmt(it.net_salary)}</td>
                          <td className="px-4 py-2.5 text-end">
                            <button
                              type="button"
                              onClick={() => setPayslip({ run: r, item: it })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-mb-cream hover:bg-mb-cream hover:text-emerald-700 text-mb-cocoa font-semibold cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>{t.extras.viewPayslip}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : subTab === "tax" ? (
        tax && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard label={t.payroll.vatOutput} value={formatAmt(tax.vatOutput)} icon={<ReceiptText className="w-5 h-5" />} tone="amber" />
              <KpiCard label={t.payroll.vatInput} value={formatAmt(tax.vatInput)} icon={<ReceiptText className="w-5 h-5" />} tone="blue" />
              <KpiCard label={t.payroll.netVatPayable} value={formatAmt(tax.netVatPayable)} icon={<Landmark className="w-5 h-5" />} tone={tax.netVatPayable > 0 ? "rose" : "emerald"} />
              <KpiCard label={t.payroll.whtPayable} value={formatAmt(tax.whtPayable)} icon={<Landmark className="w-5 h-5" />} tone="amber" />
              <KpiCard label={t.payroll.whtReceivable} value={formatAmt(tax.whtReceivable)} icon={<Landmark className="w-5 h-5" />} tone="emerald" />
              <KpiCard label={t.payroll.payePayable} value={formatAmt(tax.payePayable)} icon={<Users className="w-5 h-5" />} tone="rose" />
            </div>
            <Card className="p-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-mb-cocoa">{t.payroll.pensionPayable}</div>
                <div className="text-xs text-mb-ink mt-0.5">{t.payroll.taxSummaryNote}</div>
              </div>
              <div className="text-xl font-bold tabular-nums text-mb-cocoa">{formatAmt(tax.pensionPayable)}</div>
            </Card>
          </div>
        )
      ) : (
        /* Ready-Made Tax Filing Reports (VAT Return, WHT Schedule, Payroll Declaration) */
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-mb-cocoa">{t.extras.vatReturnTitle}</h3>
                <p className="text-xs text-mb-ink">
                  {activeCompany?.name} · {t.common.tin}: {activeCompany?.tin_number || "—"}
                </p>
              </div>
              <div className="flex gap-2 no-print">
                <CsvButton
                  label={t.common.exportCsv}
                  onClick={() =>
                    exportToCsv(
                      `vat-return-${activeCompany?.name || "company"}.csv`,
                      ["Type", "Document #", "Date", "Counterparty", "TIN", "Taxable Base", "VAT", "WHT"],
                      [
                        ...filings.vatOutputInvoices.map((d) => ["OUTPUT_SALE", d.invoice_number || "", d.issue_date, d.party_name, d.tin_number, d.base_subtotal, d.base_vat, d.base_wht]),
                        ...filings.vatInputBills.map((d) => ["INPUT_PURCHASE", d.bill_number || "", d.issue_date, d.party_name, d.tin_number, d.base_subtotal, d.base_vat, d.base_wht]),
                      ]
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-mb-cocoa text-mb-cream cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>{t.common.print}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-mb-beige text-mb-ink uppercase border-y border-mb-line">
                  <tr>
                    <th className="px-3 py-2.5 text-start">{t.common.reference}</th>
                    <th className="px-3 py-2.5 text-start">{t.common.date}</th>
                    <th className="px-3 py-2.5 text-start">{t.common.name}</th>
                    <th className="px-3 py-2.5 text-start">{t.common.tin}</th>
                    <th className="px-3 py-2.5 text-end">{t.common.subtotal}</th>
                    <th className="px-3 py-2.5 text-end">{t.common.vat}</th>
                    <th className="px-3 py-2.5 text-end">{t.common.wht}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mb-line">
                  {filings.vatOutputInvoices.map((d, i) => (
                    <tr key={`o-${i}`}>
                      <td className="px-3 py-2 font-mono font-bold text-emerald-700">{d.invoice_number}</td>
                      <td className="px-3 py-2 text-mb-ink">{formatDt(d.issue_date)}</td>
                      <td className="px-3 py-2 font-medium">{d.party_name}</td>
                      <td className="px-3 py-2 font-mono text-mb-ink">{d.tin_number || "—"}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{formatAmt(d.base_subtotal)}</td>
                      <td className="px-3 py-2 text-end tabular-nums font-bold text-amber-700">+{formatAmt(d.base_vat)}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-emerald-700">{formatAmt(d.base_wht)}</td>
                    </tr>
                  ))}
                  {filings.vatInputBills.map((d, i) => (
                    <tr key={`i-${i}`} className="bg-mb-beige/40">
                      <td className="px-3 py-2 font-mono font-bold text-mb-cocoa">{d.bill_number}</td>
                      <td className="px-3 py-2 text-mb-ink">{formatDt(d.issue_date)}</td>
                      <td className="px-3 py-2 font-medium">{d.party_name}</td>
                      <td className="px-3 py-2 font-mono text-mb-ink">{d.tin_number || "—"}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{formatAmt(d.base_subtotal)}</td>
                      <td className="px-3 py-2 text-end tabular-nums font-bold text-mb-cocoa">-{formatAmt(d.base_vat)}</td>
                      <td className="px-3 py-2 text-end tabular-nums text-rose-700">{formatAmt(d.base_wht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tax && (
              <div className="mt-4 p-4 rounded-xl bg-mb-cream border border-mb-line flex flex-wrap justify-between gap-4 text-xs font-bold text-emerald-950">
                <span>{t.payroll.netVatPayable}: {formatAmt(tax.netVatPayable)}</span>
                <span>{t.payroll.whtPayable}: {formatAmt(tax.whtPayable)}</span>
                <span>{t.payroll.payePayable}: {formatAmt(tax.payePayable)}</span>
                <span>{t.payroll.pensionPayable}: {formatAmt(tax.pensionPayable)}</span>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-mb-cocoa">{t.extras.payrollDeclTitle}</h3>
              {runs[0] && (
                <CsvButton
                  label={t.common.exportCsv}
                  onClick={() =>
                    exportToCsv(
                      `payroll-tax-declaration-${runs[0].period_label}.csv`,
                      ["Emp ID", "Employee", "TIN", "Gross", "Income Tax (PAYE)", "Emp Pension (7%)", "Co Pension (11%)", "Net Pay"],
                      runs[0].items.map((it) => [it.employee_code, it.full_name, it.tin_number || "", it.gross_salary, it.income_tax, it.employee_pension, it.employer_pension, it.net_salary])
                    )
                  }
                />
              )}
            </div>
            {runs[0] ? (
              <div className="text-xs text-mb-ink">
                Latest period: <strong>{runs[0].period_label}</strong> · PAYE Payable: <strong className="text-rose-700">{formatAmt(runs[0].total_income_tax)}</strong> · Total Pension (7%+11%): <strong>{formatAmt(runs[0].total_employee_pension + runs[0].total_employer_pension)}</strong>
              </div>
            ) : (
              <div className="text-xs text-mb-ink/60">{t.common.noData}</div>
            )}
          </Card>
        </div>
      )}

      {/* Printable Individual Employee Payslip Modal */}
      <Modal
        open={!!payslip}
        onClose={() => setPayslip(null)}
        title={`${t.extras.payslip} — ${payslip?.item.full_name || ""}`}
        maxWidth="max-w-xl"
      >
        {payslip && activeCompany && (
          <div className="print-container space-y-5">
            <div className="flex justify-between items-start border-b border-mb-line pb-4">
              <div>
                <h3 className="text-lg font-bold text-mb-cocoa">{activeCompany.name}</h3>
                <p className="text-xs text-mb-ink">{t.common.tin}: {activeCompany.tin_number || "—"}</p>
              </div>
              <div className="text-end">
                <div className="text-sm font-extrabold text-mb-cocoa">{t.extras.payslip}</div>
                <div className="text-xs text-mb-ink">{payslip.run.period_label}</div>
                <div className="text-xs text-mb-ink">{t.payroll.payDate}: {formatDt(payslip.run.pay_date)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-mb-beige p-4 rounded-xl border border-mb-line text-xs">
              <div><span className="text-mb-ink/60">{t.payroll.fullName}:</span> <strong>{payslip.item.full_name}</strong></div>
              <div><span className="text-mb-ink/60">{t.payroll.employeeCode}:</span> <strong className="font-mono">{payslip.item.employee_code}</strong></div>
              <div><span className="text-mb-ink/60">{t.payroll.jobTitle}:</span> <strong>{payslip.item.job_title || "—"}</strong></div>
              <div><span className="text-mb-ink/60">{t.common.tin}:</span> <strong className="font-mono">{payslip.item.tin_number || "—"}</strong></div>
              <div className="col-span-2"><span className="text-mb-ink/60">{t.payroll.bankAccount}:</span> <strong className="font-mono">{payslip.item.bank_account || "—"}</strong></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="border border-mb-line rounded-xl p-4 space-y-2">
                <div className="font-bold uppercase text-mb-cocoa border-b border-mb-line pb-1.5">{t.extras.earnings}</div>
                <div className="flex justify-between"><span>{t.payroll.baseSalary}</span><span className="tabular-nums font-semibold">{formatAmt(payslip.item.base_salary ?? payslip.item.gross_salary)}</span></div>
                <div className="flex justify-between"><span>{t.payroll.transportAllowance}</span><span className="tabular-nums">{formatAmt(payslip.item.transport_allowance ?? 0)}</span></div>
                <div className="flex justify-between"><span>{t.payroll.housingAllowance}</span><span className="tabular-nums">{formatAmt(payslip.item.housing_allowance ?? 0)}</span></div>
                <div className="flex justify-between pt-2 border-t border-mb-line font-bold text-mb-cocoa"><span>{t.payroll.grossSalary}</span><span className="tabular-nums">{formatAmt(payslip.item.gross_salary)}</span></div>
              </div>

              <div className="border border-mb-line rounded-xl p-4 space-y-2">
                <div className="font-bold uppercase text-rose-800 border-b border-mb-line pb-1.5">{t.extras.deductions}</div>
                <div className="flex justify-between"><span>{t.payroll.incomeTax}</span><span className="tabular-nums text-rose-700 font-semibold">-{formatAmt(payslip.item.income_tax)}</span></div>
                <div className="flex justify-between"><span>{t.payroll.employeePension}</span><span className="tabular-nums text-amber-700 font-semibold">-{formatAmt(payslip.item.employee_pension)}</span></div>
                <div className="flex justify-between text-mb-ink/60"><span>{t.payroll.employerPension}</span><span className="tabular-nums">{formatAmt(payslip.item.employer_pension)}</span></div>
                <div className="flex justify-between pt-2 border-t border-mb-line font-bold text-rose-800"><span>{t.common.total}</span><span className="tabular-nums">-{formatAmt(payslip.item.income_tax + payslip.item.employee_pension)}</span></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-mb-cocoa text-mb-cream flex justify-between items-center">
              <span className="text-sm font-bold">{t.payroll.netPay}</span>
              <span className="text-xl font-extrabold text-mb-amber tabular-nums">{formatAmt(payslip.item.net_salary)}</span>
            </div>

            <div className="flex justify-end no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-mb-cocoa text-mb-cream cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{t.common.print}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Employee Modal */}
      <Modal open={openEmp} onClose={() => setOpenEmp(false)} title={t.payroll.addEmployee}>
        <form onSubmit={handleAddEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.fullName} *</label>
              <input required value={empForm.full_name} onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.jobTitle}</label>
              <input value={empForm.job_title} onChange={(e) => setEmpForm({ ...empForm, job_title: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.department}</label>
              <input value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.baseSalary} *</label>
              <input type="number" step="0.01" required value={empForm.base_salary} onChange={(e) => setEmpForm({ ...empForm, base_salary: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.transportAllowance}</label>
              <input type="number" step="0.01" value={empForm.transport_allowance} onChange={(e) => setEmpForm({ ...empForm, transport_allowance: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.housingAllowance}</label>
              <input type="number" step="0.01" value={empForm.housing_allowance} onChange={(e) => setEmpForm({ ...empForm, housing_allowance: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.bankAccount}</label>
              <input value={empForm.bank_account} onChange={(e) => setEmpForm({ ...empForm, bank_account: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
            <button type="button" onClick={() => setOpenEmp(false)} className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer">
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Run Payroll Modal */}
      <Modal open={openRun} onClose={() => setOpenRun(false)} title={t.payroll.runPayroll} maxWidth="max-w-md">
        <form onSubmit={handleRunPayroll} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.periodLabel} *</label>
            <input required value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-mb-ink mb-1">{t.payroll.payDate} *</label>
            <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-mb-line text-sm" />
          </div>
          <div className="p-3 rounded-xl bg-mb-cream border border-mb-line text-xs space-y-1">
            <div className="flex justify-between">
              <span>{t.payroll.employeesTab}:</span>
              <strong>{employees.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>{t.payroll.grossSalary}:</span>
              <strong className="tabular-nums">{formatAmt(employees.reduce((s, e) => s + e.preview.gross, 0))}</strong>
            </div>
            <div className="flex justify-between">
              <span>{t.payroll.netPay}:</span>
              <strong className="tabular-nums text-mb-cocoa">{formatAmt(employees.reduce((s, e) => s + e.preview.net, 0))}</strong>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-mb-line">
            <button type="button" onClick={() => setOpenRun(false)} className="px-4 py-2 rounded-xl text-sm font-medium border border-mb-line text-mb-ink cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-mb-amber text-mb-cocoa hover:bg-mb-amber-deep cursor-pointer">
              {t.common.confirm}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
