"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Health {
  db: "ok" | "error";
  version: string;
}

interface CompanyRow {
  id: number;
  name: string;
  created_at: string;
  user_count: number;
  status: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  notes: string;
  days_left: number | null;
}

function day(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

function HealthLine({ health }: { health: Health | null }) {
  if (!health) return <p className="text-sm text-slate-500">Checking the database…</p>;
  return (
    <p className="text-sm text-slate-600">
      Database: <strong className={health.db === "ok" ? "text-emerald-700" : "text-rose-700"}>{health.db === "ok" ? "OK" : "not OK"}</strong>
      {" · "}Version {health.version}
    </p>
  );
}

export default function OperatorAdminPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [days, setDays] = useState<Record<number, string>>({});
  const [paidUntil, setPaidUntil] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (res.status === 401) {
      setAuthenticated(false);
      return;
    }
    if (!res.ok) {
      setError("Could not load companies.");
      return;
    }
    const data = (await res.json()) as { health: Health; companies: CompanyRow[] };
    setHealth(data.health);
    setCompanies(data.companies);
    setAuthenticated(true);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/login", { cache: "no-store" });
      const data = (await res.json()) as { enabled: boolean; authenticated: boolean; health: Health };
      setEnabled(data.enabled);
      setHealth(data.health);
      setAuthenticated(data.authenticated);
      if (data.authenticated) await loadOverview();
    })();
  }, [loadOverview]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json()) as { error?: string; health?: Health };
    if (!res.ok) {
      setError(data.error || "Could not sign in.");
      return;
    }
    setPassword("");
    if (data.health) setHealth(data.health);
    await loadOverview();
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setCompanies([]);
  }

  async function act(companyId: number, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(companyId);
    setError("");
    const res = await fetch("/api/admin/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, companyId, ...extra }),
    });
    const data = (await res.json()) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "That change did not save.");
      return;
    }
    await loadOverview();
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="bg-white border border-slate-200 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Mizan Books</p>
          <h1 className="text-2xl font-bold mt-1">Operator</h1>
          <p className="text-sm text-slate-600 mt-2">
            This page is for the person who runs Mizan Books. Company users sign in on the main page.
          </p>
          <div className="mt-3">
            <HealthLine health={health} />
          </div>
        </header>

        {enabled === false && (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-950">
            Operator admin is turned off. Set <code className="font-mono">OPERATOR_PASSWORD</code> on the server to a private
            password of at least 12 characters. There is no default password.
          </section>
        )}

        {enabled && !authenticated && (
          <form onSubmit={(event) => void signIn(event)} className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md space-y-4">
            <label className="block text-sm font-semibold" htmlFor="operator-password">
              Operator password
            </label>
            <input
              id="operator-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <button type="submit" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
              Sign in
            </button>
          </form>
        )}

        {authenticated && (
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Companies</h2>
              <button type="button" onClick={() => void signOut()} className="text-sm font-semibold text-slate-600 underline">
                Sign out
              </button>
            </div>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-start">
                <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 pe-3 text-start">Name</th>
                    <th className="py-2 pe-3 text-start">Created</th>
                    <th className="py-2 pe-3 text-start">Users</th>
                    <th className="py-2 pe-3 text-start">Status</th>
                    <th className="py-2 pe-3 text-start">Trial end</th>
                    <th className="py-2 text-start">Paid until</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="border-b border-slate-100 align-top">
                      <td className="py-3 pe-3 font-semibold">{company.name}</td>
                      <td className="py-3 pe-3">{day(company.created_at)}</td>
                      <td className="py-3 pe-3">{company.user_count}</td>
                      <td className="py-3 pe-3">
                        {company.status}
                        {company.status === "trial" && company.days_left != null ? ` (${company.days_left}d)` : ""}
                      </td>
                      <td className="py-3 pe-3">{day(company.trial_ends_at)}</td>
                      <td className="py-3">{day(company.paid_until)}</td>
                    </tr>
                  ))}
                  {companies.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-slate-500">
                        No companies yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              {companies.map((company) => (
                <form
                  key={`actions-${company.id}`}
                  className="border border-slate-200 rounded-xl p-4 space-y-3"
                  onSubmit={(event) => event.preventDefault()}
                >
                  <h3 className="font-semibold">{company.name}</h3>
                  <div className="flex flex-wrap gap-2 items-end">
                    <label className="text-xs font-semibold text-slate-600">
                      Extend trial by days
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={days[company.id] ?? "30"}
                        onChange={(event) => setDays({ ...days, [company.id]: event.target.value })}
                        className="mt-1 block w-28 px-2 py-1.5 rounded-lg border border-slate-300"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyId === company.id}
                      onClick={() =>
                        void act(company.id, "extend_trial", {
                          days: Number(days[company.id] ?? "30"),
                          notes: notes[company.id] || undefined,
                        })
                      }
                      className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Extend trial
                    </button>
                    <label className="text-xs font-semibold text-slate-600">
                      Mark paid until
                      <input
                        type="date"
                        value={paidUntil[company.id] ?? ""}
                        onChange={(event) => setPaidUntil({ ...paidUntil, [company.id]: event.target.value })}
                        className="mt-1 block px-2 py-1.5 rounded-lg border border-slate-300"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyId === company.id || !paidUntil[company.id]}
                      onClick={() =>
                        void act(company.id, "mark_paid", {
                          paidUntil: paidUntil[company.id],
                          notes: notes[company.id] || undefined,
                        })
                      }
                      className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Mark paid
                    </button>
                    <button
                      type="button"
                      disabled={busyId === company.id}
                      onClick={() =>
                        void act(company.id, company.status === "paused" ? "unpause" : "pause", {
                          notes: notes[company.id] || undefined,
                        })
                      }
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50"
                    >
                      {company.status === "paused" ? "Unpause" : "Pause"}
                    </button>
                  </div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Note (only you see this)
                    <input
                      value={notes[company.id] ?? company.notes}
                      onChange={(event) => setNotes({ ...notes, [company.id]: event.target.value })}
                      className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 font-normal"
                    />
                  </label>
                </form>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
