import assert from "node:assert/strict";
import test from "node:test";
import { postJournalEntry } from "../src/lib/accounting.ts";
import { guardCompanyMutation } from "../src/lib/api-helpers.ts";
import type { SessionUser } from "../src/lib/auth.ts";
import { getDb } from "../src/lib/db.ts";
import { customerReceiptLines, rateToBaseOn, recordExchangeRate, supplierPaymentLines } from "../src/lib/fx.ts";
import { weightedAverageMinor } from "../src/lib/inventory-cost.ts";
import { toMinor } from "../src/lib/money.ts";
import { agedPayables, isDueSoon } from "../src/lib/payables.ts";
import { addCompanyMember } from "../src/lib/team.ts";
import { seedTwoCompanies, useTempDatabase } from "./helpers.ts";

function user(id: number, role: SessionUser["role"]): SessionUser {
  return {
    id,
    name: "Tester",
    email: `user${id}@example.com`,
    role,
    preferred_lang: "en",
    preferred_calendar: "gregorian",
  };
}

test("moving average cost stays in whole cents", () => {
  assert.equal(weightedAverageMinor(10, 500, 10, 700), 600);
  assert.equal(weightedAverageMinor(0, 0, 4, 250), 250);
  assert.equal(weightedAverageMinor(3, 100, 1, 200), 125);
});

test("aged payables convert open bills to base cents by how late they are", () => {
  const totals = agedPayables(
    [
      { due_date: "2026-12-01", total: 10000, amount_paid: 0, exchange_rate: 1 },
      { due_date: "2026-11-01", total: 5000, amount_paid: 1000, exchange_rate: 2 },
      { due_date: "2026-01-01", total: 300, amount_paid: 300, exchange_rate: 50 },
    ],
    "2026-11-26"
  );
  assert.equal(totals.current, 10000);
  assert.equal(totals.d1_30, 8000);
  assert.equal(totals.d90, 0);
  assert.equal(isDueSoon("2026-11-30", "2026-11-26"), true);
  assert.equal(isDueSoon("2026-12-12", "2026-11-26"), false);
});

test("a dated exchange rate is the one in force on the payment date", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const companyId = Number(
      db.prepare("INSERT INTO companies (name, legal_name, base_currency) VALUES ('Rates', 'Rates', 'ETB')").run().lastInsertRowid
    );
    recordExchangeRate(companyId, "USD", 120, "2026-01-01");
    recordExchangeRate(companyId, "USD", 130, "2026-06-01");
    assert.equal(rateToBaseOn(companyId, "USD", "ETB", "2026-03-01"), 120);
    assert.equal(rateToBaseOn(companyId, "USD", "ETB", "2026-07-01"), 130);
    assert.equal(rateToBaseOn(companyId, "ETB", "ETB", "2026-07-01"), 1);
  } finally {
    env.restore();
  }
});

test("realised FX on a receipt and a payment stays in whole cents and balances", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const companyId = Number(
      db.prepare("INSERT INTO companies (name, legal_name, base_currency) VALUES ('FX', 'FX', 'ETB')").run().lastInsertRowid
    );
    const insert = db.prepare(
      "INSERT INTO accounts (company_id, code, name, type, subtype, normal_balance) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const bank = Number(insert.run(companyId, "1010", "Bank", "ASSET", "BANK", "DEBIT").lastInsertRowid);
    const ar = Number(insert.run(companyId, "1100", "AR", "ASSET", "AR", "DEBIT").lastInsertRowid);
    const ap = Number(insert.run(companyId, "2000", "AP", "LIABILITY", "AP", "CREDIT").lastInsertRowid);
    const fx = Number(insert.run(companyId, "4200", "FX", "REVENUE", "FX", "CREDIT").lastInsertRowid);

    const receipt = customerReceiptLines({
      foreignMinor: 10000,
      bookedRate: 100,
      payRate: 110,
      bankAccountId: bank,
      arAccountId: ar,
      fxAccountId: fx,
      description: "Customer receipt",
    });
    const receiptId = postJournalEntry({
      company_id: companyId,
      entry_date: "2026-11-01",
      description: "FX receipt",
      currency_code: "ETB",
      lines: receipt,
    });
    const receiptLines = db.prepare("SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = ?").all(receiptId) as Array<{
      account_id: number;
      debit: number;
      credit: number;
    }>;
    const receiptDebit = receiptLines.reduce((sum, line) => sum + line.debit, 0);
    const receiptCredit = receiptLines.reduce((sum, line) => sum + line.credit, 0);
    assert.equal(receiptDebit, receiptCredit);
    assert.equal(receiptDebit, 1_100_000);
    const fxGain = receiptLines.find((line) => line.account_id === fx);
    assert.equal(fxGain?.credit, 100_000);

    const payment = supplierPaymentLines({
      foreignMinor: 2000,
      bookedRate: 50,
      payRate: 40,
      bankAccountId: bank,
      apAccountId: ap,
      fxAccountId: fx,
      description: "Supplier payment",
    });
    const summed = payment.reduce(
      (sum, line) => {
        sum.debit += toMinor(line.debit);
        sum.credit += toMinor(line.credit);
        return sum;
      },
      { debit: 0, credit: 0 }
    );
    assert.equal(summed.debit, summed.credit);
    const fxLossOrGain = payment.find((line) => line.account_id === fx);
    assert.equal(fxLossOrGain?.credit, 200);
  } finally {
    env.restore();
  }
});

test("staff can write operations, not the ledger, and an existing login can be invited", async () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const ids = seedTwoCompanies(db);
    const staffId = Number(
      db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Sam', 'sam@example.com', 'x', 'staff')").run().lastInsertRowid
    );
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'staff')").run(ids.companyA, staffId);
    assert.equal(guardCompanyMutation(user(staffId, "staff"), ids.companyA), null);
    const books = guardCompanyMutation(user(staffId, "staff"), ids.companyA, { booksOnly: true });
    assert.ok(books);
    assert.equal(books.status, 403);
    const booksBody = (await books.json()) as { error?: string };
    assert.match(booksBody.error || "", /Owner or accountant/);

    const viewerId = Number(
      db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Vera', 'vera@example.com', 'x', 'viewer')").run().lastInsertRowid
    );
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'viewer')").run(ids.companyA, viewerId);
    const viewer = guardCompanyMutation(user(viewerId, "viewer"), ids.companyA);
    assert.ok(viewer);
    assert.equal(viewer.status, 403);

    const created = addCompanyMember(db, ids.companyA, {
      name: "Nia",
      email: "nia@example.com",
      password: "a-real-password",
      role: "staff",
    });
    assert.equal(created.invited, false);
    const hash = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(created.id) as { password_hash: string };
    const invited = addCompanyMember(db, ids.companyB, { email: "nia@example.com", role: "owner" });
    assert.equal(invited.invited, true);
    assert.equal(invited.id, created.id);
    const again = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(created.id) as { password_hash: string };
    assert.equal(again.password_hash, hash.password_hash);
    const membership = db.prepare("SELECT role FROM company_users WHERE company_id = ? AND user_id = ?").get(ids.companyB, created.id) as {
      role: string;
    };
    assert.equal(membership.role, "admin");
    assert.throws(() => addCompanyMember(db, ids.companyB, { email: "nia@example.com", role: "viewer" }), /already on the company/);
  } finally {
    env.restore();
  }
});
