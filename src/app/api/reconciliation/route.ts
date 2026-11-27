import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getAccountByCode, postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { fromMinor, minorFromSql, toMinor } from "@/lib/money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CSV_CHARS = 500_000;
const MAX_CSV_ROWS = 2000;

/** Small CSV line reader that understands quoted fields with commas inside. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseStatementAmount(raw: string): number | null {
  const text = raw.replace(/[,\s]/g, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
  try {
    return toMinor(text);
  } catch {
    return null;
  }
}

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
    statements.map((st) => st.matched_journal_line_id).filter((id): id is number => Boolean(id))
  );
  const bookBalanceMinor = glLines.reduce((sum, l) => sum + (minorFromSql(l.debit) - minorFromSql(l.credit)), 0);
  const statementNetMinor = statements.reduce((sum, st) => sum + minorFromSql(st.amount), 0);
  const matchedCount = statements.filter((st) => st.status === "MATCHED").length;

  return NextResponse.json({
    bankAccounts,
    activeAccountId: bankAcct.id,
    statements: statements.map((st) => ({ ...st, amount: fromMinor(minorFromSql(st.amount)) })),
    glLines: glLines.map((l) => ({
      ...l,
      debit: fromMinor(minorFromSql(l.debit)),
      credit: fromMinor(minorFromSql(l.credit)),
      net_amount: fromMinor(minorFromSql(l.debit) - minorFromSql(l.credit)),
      matched: matchedIds.has(l.id),
    })),
    summary: {
      bookBalance: fromMinor(bookBalanceMinor),
      statementNet: fromMinor(statementNetMinor),
      matchedCount,
      unmatchedCount: statements.length - matchedCount,
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
    const blocked = guardCompanyMutation(auth.user, companyId, { booksOnly: true });
    if (blocked) return blocked;
    const db = getDb();
    const company = getCompanyRecord(companyId);

    const bankAccountIds = new Set(
      (
        db
          .prepare("SELECT id FROM accounts WHERE company_id = ? AND subtype IN ('BANK', 'CASH') AND active = 1")
          .all(companyId) as Array<{ id: number }>
      ).map((r) => r.id)
    );
    const bankAccountId = body.accountId ? Number(body.accountId) : getAccountByCode(companyId, "1010").id;
    if (!bankAccountIds.has(bankAccountId)) {
      return NextResponse.json({ error: "Choose a bank or cash account from this company." }, { status: 400 });
    }

    if (body.action === "import_csv") {
      const text = String(body.csvText || "").trim();
      if (!text) return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
      if (text.length > MAX_CSV_CHARS) {
        return NextResponse.json({ error: "That statement file is too large." }, { status: 400 });
      }
      const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (rawLines.length > MAX_CSV_ROWS + 1) {
        return NextResponse.json({ error: `Import at most ${MAX_CSV_ROWS} rows at a time.` }, { status: 400 });
      }
      const ins = db.prepare(`
        INSERT INTO bank_statements (company_id, account_id, statement_date, description, reference, amount, status)
        VALUES (?, ?, ?, ?, ?, ?, 'UNMATCHED')
      `);
      let imported = 0;
      let skipped = 0;
      db.exec("BEGIN");
      try {
        for (let i = 0; i < rawLines.length; i++) {
          const cols = splitCsvLine(rawLines[i]);
          if (i === 0 && cols[0].toLowerCase().includes("date")) continue;
          if (cols.length < 3) {
            skipped++;
            continue;
          }
          const [dt, desc, refOrAmt, maybeAmt] = cols;
          const amount = parseStatementAmount(maybeAmt !== undefined ? maybeAmt : refOrAmt);
          const ref = maybeAmt !== undefined ? refOrAmt : "";
          if (amount === null || !DATE_RE.test(dt)) {
            skipped++;
            continue;
          }
          ins.run(companyId, bankAccountId, dt, (desc || "Bank Transaction").slice(0, 200), ref.slice(0, 100), amount);
          imported++;
        }
        db.exec("COMMIT");
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // keep the original error
        }
        throw err;
      }
      logAudit(companyId, auth.user.id, "IMPORT_BANK_CSV", "RECONCILIATION", null, `Imported ${imported} bank statement rows (${skipped} skipped)`);
      return NextResponse.json({ imported, skipped });
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
          SELECT jl.id, jl.debit, jl.credit
          FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
          WHERE je.company_id = ? AND jl.account_id = ? AND je.status = 'POSTED'
        `)
        .all(companyId, bankAccountId) as Array<{ id: number; debit: number; credit: number }>;

      const upd = db.prepare("UPDATE bank_statements SET matched_journal_line_id = ?, status = 'MATCHED' WHERE id = ? AND company_id = ?");
      let matched = 0;
      for (const st of unmatchedStmts) {
        const stAmount = minorFromSql(st.amount);
        const candidate = glLines.find(
          (gl) => !usedIds.has(gl.id) && minorFromSql(gl.debit) - minorFromSql(gl.credit) === stAmount
        );
        if (candidate) {
          upd.run(candidate.id, st.id, companyId);
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
      const st = db
        .prepare("SELECT id, account_id, status FROM bank_statements WHERE id = ? AND company_id = ?")
        .get(Number(body.statementId), companyId) as { id: number; account_id: number; status: string } | undefined;
      if (!st) return NextResponse.json({ error: "Statement line not found" }, { status: 404 });
      const line = db
        .prepare(`
          SELECT jl.id FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.id = ? AND je.company_id = ? AND jl.account_id = ? AND je.status = 'POSTED'
        `)
        .get(Number(body.journalLineId), companyId, st.account_id) as { id: number } | undefined;
      if (!line) return NextResponse.json({ error: "That ledger entry is not in this bank account." }, { status: 400 });
      const taken = db
        .prepare("SELECT 1 AS ok FROM bank_statements WHERE company_id = ? AND matched_journal_line_id = ? AND id <> ?")
        .get(companyId, line.id, st.id) as { ok: number } | undefined;
      if (taken) return NextResponse.json({ error: "That ledger entry is already matched." }, { status: 409 });
      db.prepare("UPDATE bank_statements SET matched_journal_line_id = ?, status = 'MATCHED' WHERE id = ? AND company_id = ?").run(
        line.id,
        st.id,
        companyId
      );
      logAudit(companyId, auth.user.id, "MANUAL_MATCH_BANK", "RECONCILIATION", st.id, `Matched bank item ${st.id} to ledger line ${line.id}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "post_adjustment") {
      if (!body.statementId) return NextResponse.json({ error: "statementId required" }, { status: 400 });
      const st = db
        .prepare("SELECT * FROM bank_statements WHERE id = ? AND company_id = ?")
        .get(Number(body.statementId), companyId) as {
        id: number;
        account_id: number;
        statement_date: string;
        description: string;
        reference: string;
        amount: number;
        status: string;
      } | undefined;
      if (!st) return NextResponse.json({ error: "Statement line not found" }, { status: 404 });
      if (st.status === "MATCHED") {
        return NextResponse.json({ error: "This bank item is already matched." }, { status: 409 });
      }

      const amountMinor = minorFromSql(st.amount);
      const absAmt = fromMinor(Math.abs(amountMinor));
      const offsetAcct = getAccountByCode(companyId, amountMinor < 0 ? String(body.expenseAccountCode || "6200") : "4100");
      const jeId = postJournalEntry({
        company_id: companyId,
        entry_date: st.statement_date,
        reference: st.reference || `RECON-${st.id}`,
        description: `Bank Reconciliation Adj: ${st.description}`,
        source_type: "MANUAL",
        created_by: auth.user.id,
        currency_code: company.base_currency,
        lines:
          amountMinor < 0
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

      db.prepare("UPDATE bank_statements SET matched_journal_line_id = ?, status = 'MATCHED' WHERE id = ? AND company_id = ?").run(
        bankLine?.id ?? null,
        st.id,
        companyId
      );
      logAudit(companyId, auth.user.id, "RECON_ADJUSTMENT", "RECONCILIATION", st.id, `Posted JE #${jeId} for bank item ${st.description}`);
      return NextResponse.json({ ok: true, journal_entry_id: jeId });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return clientErrorResponse(err);
  }
}
