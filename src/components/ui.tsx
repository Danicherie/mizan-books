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
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-mb-cocoa">{title}</h1>
        {subtitle && <p className="text-sm text-mb-ink mt-1.5 leading-relaxed">{subtitle}</p>}
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
    <div className={`bg-mb-paper rounded-2xl border border-mb-line shadow-[0_10px_28px_rgba(74,46,31,0.06)] ${className}`}>
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
    emerald: "bg-mb-cream text-mb-cocoa border-mb-line",
    blue: "bg-[#f3e7f6] text-[#6b3a62] border-[#ead3e6]",
    amber: "bg-mb-cream text-mb-cocoa border-mb-line",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    slate: "bg-mb-beige text-mb-ink border-mb-line",
  };

  return (
    <Card className="p-4 sm:p-5 hover:border-mb-amber transition-colors">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mb-ink leading-snug">{label}</p>
          <p className="text-lg xl:text-xl font-bold text-mb-cocoa mt-1.5 tabular-nums whitespace-nowrap">{value}</p>
          {subtext && <p className="text-xs text-mb-ink mt-1 truncate">{subtext}</p>}
        </div>
        <div className={`p-2 rounded-lg border shrink-0 ${toneClasses[tone]}`}>{icon}</div>
      </div>
    </Card>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = status.toUpperCase();
  const styles: Record<string, string> = {
    PAID: "bg-[#e7f6ee] text-[#0f6b45] border-[#b7e4cc]",
    POSTED: "bg-[#e7f6ee] text-[#0f6b45] border-[#b7e4cc]",
    ACTIVE: "bg-[#e7f6ee] text-[#0f6b45] border-[#b7e4cc]",
    IN_STOCK: "bg-[#e7f6ee] text-[#0f6b45] border-[#b7e4cc]",
    PARTIAL: "bg-mb-cream text-mb-cocoa border-mb-line",
    SENT: "bg-[#eef3fb] text-[#1e4b8f] border-[#d5e2f5]",
    OPEN: "bg-[#eef3fb] text-[#1e4b8f] border-[#d5e2f5]",
    OVERDUE: "bg-rose-50 text-rose-800 border-rose-200",
    LOW_STOCK: "bg-rose-50 text-rose-800 border-rose-200",
    DRAFT: "bg-mb-beige text-mb-ink border-mb-line",
    VOID: "bg-mb-beige text-mb-ink border-mb-line",
    ASSET: "bg-[#e7f6ee] text-[#0f6b45] border-[#b7e4cc]",
    LIABILITY: "bg-rose-50 text-rose-800 border-rose-200",
    EQUITY: "bg-[#f3e7f6] text-[#6b3a62] border-[#ead3e6]",
    REVENUE: "bg-mb-cream text-mb-cocoa border-mb-line",
    EXPENSE: "bg-[#fdeee4] text-[#8a3d16] border-[#f3d2b8]",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[s] || "bg-mb-beige text-mb-cocoa border-mb-line"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(74,46,31,0.45)] backdrop-blur-[2px] p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-mb-paper rounded-2xl shadow-[0_24px_60px_rgba(74,46,31,0.18)] border border-mb-line w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-mb-line bg-mb-cream/60 no-print">
          <h2 className="text-lg font-bold text-mb-cocoa">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-mb-ink hover:text-mb-cocoa hover:bg-mb-paper transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa"
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
        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-[0_12px_30px_rgba(74,46,31,0.16)] border text-sm font-medium ${
          toast.type === "success"
            ? "bg-mb-cocoa text-mb-cream border-[#3a2418]"
            : "bg-rose-800 text-rose-50 border-rose-900"
        }`}
      >
        {toast.type === "success" ? (
          <CheckCircle2 className="w-4 h-4 text-mb-amber shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
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
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border border-mb-line bg-mb-paper text-mb-cocoa hover:bg-mb-cream transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa"
    >
      <Download className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
