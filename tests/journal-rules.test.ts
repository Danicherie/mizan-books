import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { computeFinancialStatements, postJournalEntry } from "../src/lib/accounting.ts";
import { getDb, resetDbForTests } from "../src/lib/db.ts";
import { toMinor } from "../src/lib/money.ts";
import { seedTwoCompanies, useTempDatabase } from "./helpers.ts";

test("rejects a one-cent imbalance and accepts an exact entry stored in cents", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const ids = seedTwoCompanies(db);

    assert.throws(
      () =>
        postJournalEntry({
          company_id: ids.companyA,
          entry_date: "2026-11-25",
          description: "One cent short",
          lines: [
            { account_id: ids.cashA, debit: 10.01, credit: 0 },
            { account_id: ids.equityA, debit: 0, credit: 10 },
          ],
        }),
      /out of balance/
    );
    const count = db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get() as { c: number };
    assert.equal(count.c, 0);

    const id = postJournalEntry({
      company_id: ids.companyA,
      entry_date: "2026-11-25",
      description: "Tenths that are not exact in binary",
      lines: [
        { account_id: ids.cashA, debit: 0.1, credit: 0 },
        { account_id: ids.cashA, debit: 0.2, credit: 0 },
        { account_id: ids.equityA, debit: 0, credit: 0.3 },
      ],
    });

    const lines = db
      .prepare("SELECT debit, credit FROM journal_lines WHERE journal_entry_id = ? ORDER BY id")
      .all(id) as Array<{ debit: number; credit: number }>;
    assert.deepEqual(
      lines.map((line) => [line.debit, line.credit]),
      [
        [10, 0],
        [20, 0],
        [0, 30],
      ]
    );
    assert.equal(toMinor(0.1) + toMinor(0.2), 30);

    const statements = computeFinancialStatements(ids.companyA);
    assert.equal(statements.trialBalance.balanced, true);
    assert.equal(statements.trialBalance.totalDebits, statements.trialBalance.totalCredits);
    assert.equal(statements.balanceSheet.balanced, true);
  } finally {
    env.restore();
  }
});

test("a stored one-cent gap is reported as unbalanced", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const ids = seedTwoCompanies(db);
    const entry = db
      .prepare(
        "INSERT INTO journal_entries (company_id, entry_number, entry_date, description, status) VALUES (?, 'JE-OFF', '2026-01-01', 'off by one cent', 'POSTED')"
      )
      .run(ids.companyA);
    const entryId = Number(entry.lastInsertRowid);
    const insertLine = db.prepare(
      "INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?)"
    );
    insertLine.run(entryId, ids.cashA, 1001, 0);
    insertLine.run(entryId, ids.equityA, 0, 1000);

    const statements = computeFinancialStatements(ids.companyA);
    assert.equal(statements.trialBalance.balanced, false);
    assert.equal(statements.balanceSheet.balanced, false);
    assert.notEqual(statements.trialBalance.totalDebits, statements.trialBalance.totalCredits);
    assert.equal(statements.trialBalance.totalDebits, 10.01);
    assert.equal(statements.trialBalance.totalCredits, 10);
  } finally {
    env.restore();
  }
});

test("rejects a journal line whose account belongs to another company", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const ids = seedTwoCompanies(db);
    assert.throws(
      () =>
        postJournalEntry({
          company_id: ids.companyA,
          entry_date: "2026-11-25",
          description: "Cross-company cash",
          lines: [
            { account_id: ids.cashB, debit: 25, credit: 0 },
            { account_id: ids.equityA, debit: 0, credit: 25 },
          ],
        }),
      /another company/
    );
    const count = db.prepare("SELECT COUNT(*) AS c FROM journal_entries").get() as { c: number };
    assert.equal(count.c, 0);

    const statementsA = computeFinancialStatements(ids.companyA);
    const statementsB = computeFinancialStatements(ids.companyB);
    assert.equal(statementsA.trialBalance.totalDebits, 0);
    assert.equal(statementsB.trialBalance.totalDebits, 0);
    assert.equal(statementsA.trialBalance.balanced, true);
    assert.equal(statementsB.trialBalance.balanced, true);
  } finally {
    env.restore();
  }
});

test("migrates existing floating-point money to integer cents once", () => {
  const env = useTempDatabase();
  try {
    const dbPath = path.join(env.dir, "mizan.db");
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE journal_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        currency_code TEXT NOT NULL DEFAULT 'ETB',
        exchange_rate REAL NOT NULL DEFAULT 1,
        foreign_amount REAL NOT NULL DEFAULT 0
      );
    `);
    const fuzzy = 0.1 + 0.2;
    legacy
      .prepare(
        "INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, foreign_amount) VALUES (1, 1, 'priced', 10.1, 10.1, 10.1)"
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, foreign_amount) VALUES (1, 1, 'fuzzy', ?, ?, ?)"
      )
      .run(fuzzy, fuzzy, fuzzy);
    legacy.close();

    const db = getDb();
    const rows = db
      .prepare("SELECT description, debit, credit, foreign_amount, typeof(debit) AS kind FROM journal_lines ORDER BY id")
      .all() as Array<{ description: string; debit: number; credit: number; foreign_amount: number; kind: string }>;
    assert.equal(rows[0].description, "priced");
    assert.equal(rows[0].debit, 1010);
    assert.equal(rows[0].credit, 1010);
    assert.equal(rows[0].foreign_amount, 1010);
    assert.equal(rows[0].kind, "integer");
    assert.equal(rows[1].debit, 30);

    const migrated = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("2026_11_25_money_minor_units");
    assert.ok(migrated);

    resetDbForTests();
    const reopened = getDb();
    const again = reopened.prepare("SELECT debit FROM journal_lines WHERE description = 'priced'").get() as {
      debit: number;
    };
    assert.equal(again.debit, 1010);
  } finally {
    env.restore();
  }
});
