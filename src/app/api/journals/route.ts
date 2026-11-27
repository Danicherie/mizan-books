import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { postJournalEntry } from "@/lib/accounting";
import { getCompanyRecord, guardCompanyMutation, requireAuth, requireWrite, resolveScopedCompanyId } from "@/lib/api-helpers";
import { clientErrorResponse } from "@/lib/http";
import { assertMutationOrigin } from "@/lib/origin";
import { JOURNAL_MONEY_FIELDS, withMajorMoney } from "@/lib/money";

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
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN accounts a ON a.id = jl.account_id AND a.company_id = je.company_id
    WHERE jl.journal_entry_id = ?
    ORDER BY jl.id ASC
  `);

  const hydrated = entries.map((e) => ({
    ...e,
    lines: (linesStmt.all(e.id as number) as Array<Record<string, unknown>>).map((line) =>
      withMajorMoney(line, JOURNAL_MONEY_FIELDS)
    ),
  }));

  return NextResponse.json({ entries: hydrated });
}

export async function POST(request: Request) {
  const originBlock = assertMutationOrigin(request);
  if (originBlock) return originBlock;
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
    const blocked = guardCompanyMutation(auth.user, companyId, { booksOnly: true });
    if (blocked) return blocked;
    const company = getCompanyRecord(companyId);
    if (!body.description?.trim() || body.description.length > 500 || !/^\d{4}-\d{2}-\d{2}$/.test(body.entry_date || "")) {
      return NextResponse.json({ error: "A date and description are required." }, { status: 400 });
    }
    if (!Array.isArray(body.lines) || body.lines.length < 2 || body.lines.length > 200) {
      return NextResponse.json({ error: "A journal entry needs between 2 and 200 lines." }, { status: 400 });
    }

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
    return clientErrorResponse(err);
  }
}
