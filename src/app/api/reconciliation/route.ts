import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const bankAccounts = db
    .prepare("SELECT id, code, name, subtype FROM accounts WHERE company_id = ? AND subtype IN ('BANK', 'CASH') AND active = 1 ORDER BY code ASC")
    .all(companyId) as Array<{ id: number; code: string; name: string; subtype: string }>;

  const requestedAccountId = Number(searchParams.get("accountId"));
  const bankAcct =
    bankAccounts.find((a) => a.id === requestedAccountId) ||
    bankAccounts.find((a) => a.code === "1010") ||
    bankAccounts[0];

  if (!bankAcct) {
    return NextResponse.json({ bankAccounts: [], statements: [], glLines: [], summary: {} });
  }

  const statements = db
    .prepare(`
      SELECT * FROM bank_statements
      WHERE company_id = ? AND account_id = ?
      ORDER BY statement_date DESC, id DESC
    `)
    .all(companyId, bankAcct.id) as Array<{
    id: number;
    statement_date: string;
    description: string;
    reference: string;
    amount: number;
    matched_journal_line_id: number | null;
    status: string;
  }>;

  const glLines = db
    .prepare(`
      SELECT
        jl.id, je.entry_number, je.entry_date, je.reference, je.description,
        jl.debit, jl.credit, (jl.debit - jl.credit) AS net_amount
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.company_id = ? AND jl.account_id = ? AND je.status = 'POSTED'
      ORDER BY je.entry_date DESC, jl.id DESC
    `)
    .all(companyId, bankAcct.id) as Array<{
    id: number;
    entry_number: string;
    entry_date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    net_amount: number;
  }>;

  const matchedIds = new Set(
    statements.map((s) => s.matched_journal_line_id).filter((id): id is number => Boolean(id))
  );
  const bookBalance = Number(glLines.reduce((s, l) => s + Number(l.net_amount), 0).toFixed(2));
  const statementNet = Number(statements.reduce((s, st) => s + Number(st.amount), 0).toFixed(2));
  const matchedCount = statements.filter((s) => s.status === "MATCHED").length;

  return NextResponse.json({
    bankAccounts,
    activeAccountId: bankAcct.id,
    statements,
    glLines: glLines.map((l) => ({ ...l, matched: matchedIds.has(l.id) })),
    summary: {
      bookBalance,
      statementNet,
      matchedCount,
      unmatchedCount: statements.length - matchedCount,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      action: "import_csv" | "auto_match" | "manual_match" | "post_adjustment";
      companyId: number;
      accountId?: number;
      csvText?: string;
      statementId?: number;
      journalLineId?: number;
      expenseAccountCode?: string;
    };

    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const db = getDb();
    const company = getCompanyRecord(companyId);
    const bankAccountId = body.accountId || getAccountByCode(companyId, "1010").id;

    if (body.action === "import_csv") {
      const text = (body.csvText || "").trim();
      if (!text) return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
      const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const ins = db.prepare(`
        INSERT INTO bank_statements (company_id, account_id, statement_date, description, reference, amount, status)
        VALUES (?, ?, ?, ?, ?, ?, 'UNMATCHED')
      `);
      let imported = 0;
      for (let i = 0; i < rawLines.length; i++) {
        const cols = rawLines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        if (i === 0 && cols[0].toLowerCase().includes("date")) continue;
        if (cols.length < 3) continue;
        const [dt, desc, refOrAmt, maybeAmt] = cols;
        const amount = parseFloat(maybeAmt !== undefined ? maybeAmt : refOrAmt);
        const ref = maybeAmt !== undefined ? refOrAmt : "";
        if (!Number.isFinite(amount) || !dt) continue;
        ins.run(companyId, bankAccountId, dt, desc || "Bank Transaction", ref, Number(amount.toFixed(2)));
        imported++;
      }
      logAudit(companyId, auth.user.id, "IMPORT_BANK_CSV", "RECONCILIATION", null, `Imported ${imported} bank statement rows`);
      return NextResponse.json({ imported });
    }

    if (body.action === "auto_match") {
      const unmatchedStmts = db
        .prepare("SELECT * FROM bank_statements WHERE company_id = ? AND account_id = ? AND status = 'UNMATCHED'")
        .all(companyId, bankAccountId) as Array<{ id: number; amount: number; reference: string }>;

      const usedIds = new Set(
        (
          db
            .prepare("SELECT matched_journal_line_id FROM bank_statements WHERE company_id = ? AND matched_journal_line_id IS NOT NULL")
            .all(companyId) as Array<{ matched_journal_line_id: number }>
        ).map((r) => r.matched_journal_line_id)
      );

      const glLines = db
        .prepare(`
          SELECT jl.id, je.reference, (jl.debit - jl.credit) AS net_amount
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
          WHERE je.company_id = ? AND jl.account_id = ? AND je.status = 'POSTED'
        `)
        .all(companyId, bankAccountId) as Array<{ id: number; reference: string; net_amount: number }>;

      const upd = db.prepare("UPDATE bank_statements SET matched_journal_line_id = ?, status = 'MATCHED' WHERE id = ?");
      let matched = 0;
      for (const st of unmatchedStmts) {
        const candidate = glLines.find(
          (gl) =>
            !usedIds.has(gl.id) &&
            Math.abs(Number(gl.net_amount) - Number(st.amount)) < 0.05
        );
        if (candidate) {
          upd.run(candidate.id, st.id);
          usedIds.add(candidate.id);
          matched++;
        }
      }
      logAudit(companyId, auth.user.id, "AUTO_MATCH_BANK", "RECONCILIATION", null, `Auto-matched ${matched} bank transactions`);
      return NextResponse.json({ matched });
    }

    if (body.action === "manual_match") {
      if (!body.statementId || !body.journalLineId) {
        return NextResponse.json({ error: "statementId and journalLineId required" }, { status: 400 });
      }
      db.prepare("UPDATE bank_statements SET matched_journal_line_id = ?, status = 'MATCHED' WHERE id = ? AND company_id = ?").run(
        body.journalLineId,
        body.statementId,
        companyId
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "post_adjustment") {
      if (!body.statementId) return NextResponse.json({ error: "statementId required" }, { status: 400 });
      const st = db
        .prepare("SELECT * FROM bank_statements WHERE id = ? AND company_id = ?")
        .get(body.statementId, companyId) as {
        id: number;
        account_id: number;
        statement_date: string;
        description: string;
        reference: string;
        amount: number;
      } | undefined;
      if (!st) return NextResponse.json({ error: "Statement line not found" }, { status: 404 });

      const absAmt = Math.abs(Number(st.amount));
      const offsetAcct = getAccountByCode(companyId, st.amount < 0 ? body.expenseAccountCode || "6200" : "4100");
      const jeId = postJournalEntry({
        company_id: companyId,
        entry_date: st.statement_date,
        reference: st.reference || `RECON-${st.id}`,
        description: `Bank Reconciliation Adj: ${st.description}`,
        source_type: "MANUAL",
        created_by: auth.user.id,
        currency_code: company.base_currency,
        lines:
          st.amount < 0
            ? [
                { account_id: offsetAcct.id, description: st.description, debit: absAmt, credit: 0 },
                { account_id: st.account_id, description: st.description, debit: 0, credit: absAmt },
              ]
            : [
                { account_id: st.account_id, description: st.description, debit: absAmt, credit: 0 },
                { account_id: offsetAcct.id, description: st.description, debit: 0, credit: absAmt },
              ],
      });

      const bankLine = db
        .prepare("SELECT id FROM journal_lines WHERE journal_entry_id = ? AND account_id = ? LIMIT 1")
        .get(jeId, st.account_id) as { id: number } | undefined;

      db.prepare("UPDATE bank_statements SET matched_journal_line_id = ?, status = 'MATCHED' WHERE id = ?").run(
        bankLine?.id ?? null,
        st.id
      );
      logAudit(companyId, auth.user.id, "RECON_ADJUSTMENT", "RECONCILIATION", st.id, `Posted JE #${jeId} for bank item ${st.description}`);
      return NextResponse.json({ ok: true, journal_entry_id: jeId });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
