"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Play, Users, Landmark, ReceiptText } from "lucide-react";
import { getTodayIso } from "@/lib/calendar";
import { useApp } from "../AppContext";
import { Card, KpiCard, Modal, PageHeader, StatusBadge } from "../ui";

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
  items: Array<{
    id: number;
    employee_code: string;
    full_name: string;
    gross_salary: number;
    income_tax: number;
    employee_pension: number;
    employer_pension: number;
    net_salary: number;
  }>;
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

export function PayrollTaxModule() {
  const { activeCompany, t, formatAmt, formatDt, canWrite, showToast } = useApp();
  const [subTab, setSubTab] = useState<"employees" | "runs" | "tax">("employees");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [tax, setTax] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [openEmp, setOpenEmp] = useState(false);
  const [openRun, setOpenRun] = useState(false);

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
    };
    setEmployees(data.employees || []);
    setRuns(data.payrollRuns || []);
    setTax(data.taxSummary || null);
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
      showToast("error", err.error || t.common.error);
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
          canWrite && (
            <>
              <button
                type="button"
                onClick={() => setOpenEmp(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t.payroll.addEmployee}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenRun(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>{t.payroll.runPayroll}</span>
              </button>
            </>
          )
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(
          [
            ["employees", t.payroll.employeesTab],
            ["runs", t.payroll.payrollRunsTab],
            ["tax", t.payroll.taxCenterTab],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              subTab === key
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">{t.common.loading}</div>
      ) : subTab === "employees" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{e.employee_code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{e.full_name}</div>
                      <div className="text-xs text-slate-400">
                        {e.job_title} · {e.department}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">{formatAmt(e.base_salary)}</td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums">{formatAmt(e.preview.gross)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-rose-700">{formatAmt(e.preview.incomeTax)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-amber-700">{formatAmt(e.preview.empPension)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-500">{formatAmt(e.preview.coPension)}</td>
                    <td className="px-4 py-3 text-end font-bold tabular-nums text-emerald-700">{formatAmt(e.preview.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : subTab === "runs" ? (
        <div className="space-y-4">
          {runs.length === 0 ? (
            <Card className="p-10 text-center text-sm text-slate-400">{t.common.noData}</Card>
          ) : (
            runs.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{r.period_label}</h3>
                    <p className="text-xs text-slate-500">{t.payroll.payDate}: {formatDt(r.pay_date)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span>{t.payroll.grossSalary}: <strong className="tabular-nums">{formatAmt(r.total_gross)}</strong></span>
                    <span>{t.payroll.incomeTax}: <strong className="tabular-nums text-rose-700">{formatAmt(r.total_income_tax)}</strong></span>
                    <span>{t.payroll.netPay}: <strong className="tabular-nums text-emerald-700">{formatAmt(r.total_net)}</strong></span>
                    <StatusBadge status={r.status} label={t.common.posted} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 uppercase border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-start">{t.payroll.fullName}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.grossSalary}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.incomeTax}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.employeePension}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.employerPension}</th>
                        <th className="px-4 py-2 text-end">{t.payroll.netPay}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {r.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            <span className="font-mono text-slate-400 me-2">{it.employee_code}</span>
                            {it.full_name}
                          </td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatAmt(it.gross_salary)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums text-rose-700">{formatAmt(it.income_tax)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatAmt(it.employee_pension)}</td>
                          <td className="px-4 py-2.5 text-end tabular-nums">{formatAmt(it.employer_pension)}</td>
                          <td className="px-4 py-2.5 text-end font-bold tabular-nums text-emerald-700">{formatAmt(it.net_salary)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
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
                <div className="text-sm font-bold text-slate-900">{t.payroll.pensionPayable}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t.payroll.taxSummaryNote}</div>
              </div>
              <div className="text-xl font-bold tabular-nums text-slate-900">{formatAmt(tax.pensionPayable)}</div>
            </Card>
          </div>
        )
      )}

      {/* Add Employee Modal */}
      <Modal open={openEmp} onClose={() => setOpenEmp(false)} title={t.payroll.addEmployee}>
        <form onSubmit={handleAddEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.fullName} *</label>
              <input required value={empForm.full_name} onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.jobTitle}</label>
              <input value={empForm.job_title} onChange={(e) => setEmpForm({ ...empForm, job_title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.department}</label>
              <input value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.baseSalary} *</label>
              <input type="number" step="0.01" required value={empForm.base_salary} onChange={(e) => setEmpForm({ ...empForm, base_salary: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.transportAllowance}</label>
              <input type="number" step="0.01" value={empForm.transport_allowance} onChange={(e) => setEmpForm({ ...empForm, transport_allowance: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.housingAllowance}</label>
              <input type="number" step="0.01" value={empForm.housing_allowance} onChange={(e) => setEmpForm({ ...empForm, housing_allowance: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.bankAccount}</label>
              <input value={empForm.bank_account} onChange={(e) => setEmpForm({ ...empForm, bank_account: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setOpenEmp(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Run Payroll Modal */}
      <Modal open={openRun} onClose={() => setOpenRun(false)} title={t.payroll.runPayroll} maxWidth="max-w-md">
        <form onSubmit={handleRunPayroll} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.periodLabel} *</label>
            <input required value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t.payroll.payDate} *</label>
            <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
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
              <strong className="tabular-nums text-emerald-800">{formatAmt(employees.reduce((s, e) => s + e.preview.net, 0))}</strong>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setOpenRun(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
              {t.common.confirm}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
