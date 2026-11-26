import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getDb } from "../src/lib/db.ts";
import { useTempDatabase } from "./helpers.ts";

const NEW_ROUTES = [
  "alerts",
  "budgets",
  "payments",
  "pos",
  "receipts",
  "reconciliation",
].map((name) => path.join(process.cwd(), "src/app/api", name, "route.ts"));

test("new finance tables keep money as whole minor units", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const expected: Record<string, string[]> = {
      bank_statements: ["amount"],
      budgets: ["budget_amount"],
      pos_sales: ["subtotal", "vat_amount", "total"],
      pos_sale_lines: ["unit_price", "line_total"],
      payment_transactions: ["amount"],
    };
    for (const [table, columns] of Object.entries(expected)) {
      const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
      for (const column of columns) {
        const found = info.find((c) => c.name === column);
        assert.ok(found, `${table}.${column} exists`);
        assert.match(found.type.toUpperCase(), /INT/, `${table}.${column} is an integer`);
      }
    }
  } finally {
    env.restore();
  }
});

test("every new finance route that changes data checks the origin, the role, and the trial lock", () => {
  for (const file of NEW_ROUTES) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /assertMutationOrigin/, `${file} checks the origin`);
    assert.match(source, /requireWrite/, `${file} requires write access`);
    assert.match(source, /guardCompanyMutation/, `${file} respects the trial lock`);
  }
});

test("online payment completion cannot be used to fake a payment", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/payments/route.ts"), "utf8");
  assert.match(source, /ENABLE_SANDBOX_PAYMENTS/);
  assert.match(source, /tx\.mode !== "SANDBOX"/);
  assert.doesNotMatch(source, /subscription_status = 'ACTIVE'/);
});

test("ledger matching stays inside the company and the bank account", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/reconciliation/route.ts"), "utf8");
  assert.match(source, /je\.company_id = \? AND jl\.account_id = \?/);
});
