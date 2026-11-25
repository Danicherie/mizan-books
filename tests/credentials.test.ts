import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { verifyPassword } from "../src/lib/auth.ts";
import { getDb } from "../src/lib/db.ts";
import { computeFinancialStatements } from "../src/lib/accounting.ts";
import { setEnv, useTempDatabase } from "./helpers.ts";

const DEMO_EMAILS = ["admin@mizanbooks.com", "accountant@mizanbooks.com", "viewer@mizanbooks.com"];

test("a production database does not create the published demo password, even when demo login is false", () => {
  const env = useTempDatabase();
  const previousNodeEnv = process.env.NODE_ENV;
  setEnv("NODE_ENV", "production");
  process.env.ENABLE_DEMO_LOGIN = "false";
  try {
    const db = getDb();
    const users = db.prepare("SELECT email, password_hash FROM users").all() as Array<{
      email: string;
      password_hash: string;
    }>;
    assert.equal(users.length, 0);
    for (const email of DEMO_EMAILS) {
      const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      assert.equal(row, undefined);
    }
    for (const user of users) {
      assert.equal(verifyPassword("password123", user.password_hash), false);
    }
  } finally {
    setEnv("NODE_ENV", previousNodeEnv);
    env.restore();
  }
});

test("opening the database the way the health check does does not create demo users", () => {
  const env = useTempDatabase();
  const previousNodeEnv = process.env.NODE_ENV;
  setEnv("NODE_ENV", "production");
  process.env.ENABLE_DEMO_LOGIN = "false";
  try {
    const healthSource = fs.readFileSync(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");
    assert.match(healthSource, /databaseOk|getDb\(\)/);
    assert.doesNotMatch(healthSource, /password123|seedDemo|seedIfEmpty/);
    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
    assert.equal(count.c, 0);
  } finally {
    setEnv("NODE_ENV", previousNodeEnv);
    env.restore();
  }
});

test("the first administrator comes from the environment and the sample password is refused", () => {
  const env = useTempDatabase();
  process.env.INITIAL_ADMIN_EMAIL = "owner@example.com";
  process.env.INITIAL_ADMIN_PASSWORD = "password123";
  try {
    assert.throws(() => getDb(), /INITIAL_ADMIN_PASSWORD/);
  } finally {
    env.restore();
  }

  const again = useTempDatabase();
  process.env.INITIAL_ADMIN_EMAIL = "owner@example.com";
  process.env.INITIAL_ADMIN_PASSWORD = "correct-horse-battery";
  process.env.INITIAL_ADMIN_NAME = "Owner";
  process.env.INITIAL_COMPANY_NAME = "Rift Valley Trading";
  try {
    const db = getDb();
    const users = db.prepare("SELECT email, role, password_hash FROM users").all() as Array<{
      email: string;
      role: string;
      password_hash: string;
    }>;
    assert.deepEqual(
      users.map((user) => user.email),
      ["owner@example.com"]
    );
    assert.equal(users[0].role, "admin");
    assert.equal(verifyPassword("correct-horse-battery", users[0].password_hash), true);
    assert.equal(verifyPassword("password123", users[0].password_hash), false);
    for (const email of DEMO_EMAILS) {
      assert.equal(db.prepare("SELECT id FROM users WHERE email = ?").get(email), undefined);
    }
    const company = db.prepare("SELECT name FROM companies").get() as { name: string };
    assert.equal(company.name, "Rift Valley Trading");
  } finally {
    again.restore();
  }
});

test("demo companies and the sample password exist only when demo mode is explicitly on, and those books balance", () => {
  const env = useTempDatabase();
  process.env.ENABLE_DEMO_LOGIN = "true";
  try {
    const db = getDb();
    const users = db.prepare("SELECT email, password_hash FROM users ORDER BY id").all() as Array<{
      email: string;
      password_hash: string;
    }>;
    assert.deepEqual(
      users.map((user) => user.email),
      DEMO_EMAILS
    );
    for (const user of users) {
      assert.equal(verifyPassword("password123", user.password_hash), true);
    }
    const invoice = db.prepare("SELECT total FROM invoices WHERE invoice_number = ? AND company_id = (SELECT id FROM companies WHERE name = ?)").get(
      "INV-2026-001",
      "Addis Horizon Trading PLC"
    ) as { total: number };
    assert.equal(invoice.total, 59890000);

    const companies = db.prepare("SELECT id, name FROM companies ORDER BY id").all() as Array<{ id: number; name: string }>;
    for (const company of companies) {
      const statements = computeFinancialStatements(company.id);
      assert.equal(statements.trialBalance.balanced, true, company.name);
      assert.equal(statements.balanceSheet.balanced, true, company.name);
      assert.equal(statements.trialBalance.totalDebits, statements.trialBalance.totalCredits);
    }
  } finally {
    env.restore();
  }
});
