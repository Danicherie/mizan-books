import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scoped = resolveScopedCompanyId(auth.user.id, searchParams.get("companyId"));
  if ("error" in scoped) return scoped.error;
  const companyId = scoped.companyId;
  const db = getDb();

  const entries = db
    .prepare(`
      SELECT je.*, u.name AS created_by_name
      FROM journal_entries je
      LEFT JOIN users u ON u.id = je.created_by
      WHERE je.company_id = ?
      ORDER BY je.entry_date DESC, je.id DESC
      LIMIT 100
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  const linesStmt = db.prepare(`
    SELECT jl.*, a.code AS account_code, a.name AS account_name, a.name_am, a.name_om, a.name_so, a.name_ar
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.journal_entry_id = ?
    ORDER BY jl.id ASC
  `);

  const hydrated = entries.map((e) => ({
    ...e,
    lines: linesStmt.all(e.id as number),
  }));

  return NextResponse.json({ entries: hydrated });
}

export async function POST(request: Request) {
  const auth = await requireWrite();
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as {
      companyId: number;
      entry_date: string;
      reference?: string;
      description: string;
      lines: Array<{ account_id: number; description?: string; debit: number; credit: number }>;
    };
    const scoped = resolveScopedCompanyId(auth.user.id, body.companyId);
    if ("error" in scoped) return scoped.error;
    const companyId = scoped.companyId;
    const company = getCompanyRecord(companyId);

    const jeId = postJournalEntry({
      company_id: companyId,
      entry_date: body.entry_date,
      reference: body.reference,
      description: body.description,
      source_type: "MANUAL",
      created_by: auth.user.id,
      currency_code: company.base_currency,
      lines: body.lines,
    });

    logAudit(companyId, auth.user.id, "POST_JOURNAL", "JOURNAL_ENTRY", jeId, body.description);
    return NextResponse.json({ id: jeId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
