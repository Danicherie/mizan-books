"use client";

import React from "react";
import { X, Download, CheckCircle2, AlertCircle } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200/90 shadow-xs ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  subtext,
  icon,
  tone = "emerald",
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  tone?: "emerald" | "blue" | "amber" | "rose" | "slate";
}) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <Card className="p-4 sm:p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-snug">{label}</p>
          <p className="text-lg xl:text-xl font-bold text-slate-900 mt-1.5 tabular-nums whitespace-nowrap">{value}</p>
          {subtext && <p className="text-xs text-slate-500 mt-1 truncate">{subtext}</p>}
        </div>
        <div className={`p-2 rounded-lg border shrink-0 ${toneClasses[tone]}`}>{icon}</div>
      </div>
    </Card>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = status.toUpperCase();
  const styles: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    POSTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    IN_STOCK: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
    SENT: "bg-blue-50 text-blue-700 border-blue-200",
    OPEN: "bg-blue-50 text-blue-700 border-blue-200",
    OVERDUE: "bg-rose-50 text-rose-700 border-rose-200",
    LOW_STOCK: "bg-rose-50 text-rose-700 border-rose-200",
    DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
    VOID: "bg-slate-100 text-slate-500 border-slate-200",
    ASSET: "bg-emerald-50 text-emerald-700 border-emerald-200",
    LIABILITY: "bg-rose-50 text-rose-700 border-rose-200",
    EQUITY: "bg-indigo-50 text-indigo-700 border-indigo-200",
    REVENUE: "bg-teal-50 text-teal-700 border-teal-200",
    EXPENSE: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[s] || "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {label || status}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-2xl shadow-xl border border-slate-200 w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 no-print">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ToastBanner({ toast }: { toast: { type: "success" | "error"; message: string } | null }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 end-5 z-50 no-print animate-in fade-in slide-in-from-bottom-2">
      <div
        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
          toast.type === "success"
            ? "bg-emerald-950 text-emerald-50 border-emerald-800"
            : "bg-rose-950 text-rose-50 border-rose-800"
        }`}
      >
        {toast.type === "success" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
        )}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

export function exportToCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
    >
      <Download className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
