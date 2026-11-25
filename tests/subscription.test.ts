import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { guardCompanyMutation, resolveScopedCompanyId } from "../src/lib/api-helpers.ts";
import { getDb, resetDbForTests } from "../src/lib/db.ts";
import {
  evaluateSubscription,
  trialWindow,
  TRIAL_LENGTH_DAYS,
} from "../src/lib/subscription.ts";
import { extendTrial, pauseCompany, setPaidUntil, unpauseCompany } from "../src/lib/subscription-admin.ts";
import type { SessionUser } from "../src/lib/auth.ts";
import { seedTwoCompanies, useTempDatabase } from "./helpers.ts";

const DAY = 24 * 60 * 60 * 1000;

function user(id: number, role: SessionUser["role"] = "accountant"): SessionUser {
  return {
    id,
    name: "Tester",
    email: `user${id}@example.com`,
    role,
    preferred_lang: "en",
    preferred_calendar: "gregorian",
  };
}

test("a new trial lasts 30 days and ends at the timestamp", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const window = trialWindow(start);
  const access = evaluateSubscription(
    { subscription_status: "trial", trial_ends_at: window.trialEndsAt, paid_until: null },
    start
  );
  assert.equal(access.status, "trial");
  assert.equal(access.canMutate, true);
  assert.equal(access.daysLeft, TRIAL_LENGTH_DAYS);

  const lastMinute = new Date(new Date(window.trialEndsAt).getTime() - 60_000);
  const still = evaluateSubscription(
    { subscription_status: "trial", trial_ends_at: window.trialEndsAt },
    lastMinute
  );
  assert.equal(still.canMutate, true);
  assert.equal(still.daysLeft, 1);

  const ended = evaluateSubscription(
    { subscription_status: "trial", trial_ends_at: window.trialEndsAt },
    new Date(window.trialEndsAt)
  );
  assert.equal(ended.status, "expired");
  assert.equal(ended.canMutate, false);
});

test("paid_until keeps writes open after the trial, and pause closes them", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const expiredTrial = "2026-02-01T00:00:00.000Z";
  const paid = evaluateSubscription(
    { subscription_status: "trial", trial_ends_at: expiredTrial, paid_until: "2026-12-31T23:59:59.999Z" },
    now
  );
  assert.equal(paid.status, "active");
  assert.equal(paid.canMutate, true);

  const paused = evaluateSubscription(
    { subscription_status: "paused", trial_ends_at: expiredTrial, paid_until: "2026-12-31T23:59:59.999Z" },
    now
  );
  assert.equal(paused.status, "paused");
  assert.equal(paused.canMutate, false);

  const selfUpgrade = evaluateSubscription(
    { subscription_status: "ACTIVE", trial_ends_at: expiredTrial, paid_until: null },
    now
  );
  assert.equal(selfUpgrade.canMutate, false);
  assert.equal(selfUpgrade.status, "expired");
});

test("opening an existing database gives every company a fresh 30-day trial once", () => {
  const env = useTempDatabase();
  try {
    const dbPath = path.join(env.dir, "mizan.db");
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE companies (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        legal_name TEXT NOT NULL,
        plan_name TEXT NOT NULL DEFAULT 'BUSINESS',
        subscription_status TEXT NOT NULL DEFAULT 'ACTIVE',
        trial_starts_at TEXT NOT NULL DEFAULT '2020-01-01T00:00:00.000Z',
        trial_ends_at TEXT NOT NULL DEFAULT '2020-02-01T00:00:00.000Z'
      );
    `);
    legacy.prepare("INSERT INTO companies (name, legal_name, subscription_status, trial_ends_at) VALUES ('Old Co', 'Old Co', 'ACTIVE', '2020-02-01T00:00:00.000Z')").run();
    legacy.close();

    const db = getDb();
    const row = db.prepare("SELECT subscription_status, trial_ends_at, paid_until FROM companies WHERE name = 'Old Co'").get() as {
      subscription_status: string;
      trial_ends_at: string;
      paid_until: string | null;
    };
    assert.equal(row.subscription_status, "trial");
    assert.equal(row.paid_until, null);
    const remaining = new Date(row.trial_ends_at).getTime() - Date.now();
    assert.ok(remaining > 29 * DAY && remaining < 31 * DAY);
    const migrated = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("2026_11_25_subscription_trial_window");
    assert.ok(migrated);

    db.prepare("UPDATE companies SET trial_ends_at = '2001-01-01T00:00:00.000Z' WHERE name = 'Old Co'").run();
    resetDbForTests();
    const reopened = getDb();
    const again = reopened.prepare("SELECT trial_ends_at FROM companies WHERE name = 'Old Co'").get() as { trial_ends_at: string };
    assert.equal(again.trial_ends_at, "2001-01-01T00:00:00.000Z");
  } finally {
    env.restore();
  }
});

test("operator actions extend a trial, mark paid, and pause", () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const ids = seedTwoCompanies(db);
    db.prepare("UPDATE companies SET trial_ends_at = '2001-01-01T00:00:00.000Z', subscription_status = 'expired' WHERE id = ?").run(ids.companyA);

    const extended = extendTrial(ids.companyA, 10);
    const afterExtend = evaluateSubscription(
      db.prepare("SELECT subscription_status, trial_ends_at, paid_until FROM companies WHERE id = ?").get(ids.companyA) as {
        subscription_status: string;
        trial_ends_at: string;
        paid_until: string | null;
      }
    );
    assert.equal(afterExtend.canMutate, true);
    assert.equal(afterExtend.status, "trial");
    assert.ok(new Date(extended).getTime() > Date.now() + 9 * DAY);

    setPaidUntil(ids.companyA, new Date("2027-01-31T23:59:59.999Z"), "Paid by bank transfer");
    const paid = db.prepare("SELECT subscription_status, paid_until, subscription_notes FROM companies WHERE id = ?").get(ids.companyA) as {
      subscription_status: string;
      paid_until: string;
      subscription_notes: string;
    };
    assert.equal(paid.subscription_status, "active");
    assert.equal(paid.subscription_notes, "Paid by bank transfer");
    assert.equal(evaluateSubscription(paid).canMutate, true);

    pauseCompany(ids.companyA);
    const paused = db.prepare("SELECT subscription_status, paid_until, trial_ends_at FROM companies WHERE id = ?").get(ids.companyA) as {
      subscription_status: string;
      paid_until: string;
      trial_ends_at: string;
    };
    assert.equal(evaluateSubscription(paused).canMutate, false);

    const resumed = unpauseCompany(ids.companyA);
    assert.equal(resumed, "active");
    const audit = db.prepare("SELECT action FROM operator_audit ORDER BY id").all() as Array<{ action: string }>;
    assert.deepEqual(
      audit.map((row) => row.action),
      ["EXTEND_TRIAL", "MARK_PAID", "SUBSCRIPTION_NOTE", "PAUSE_COMPANY", "UNPAUSE_COMPANY"]
    );
  } finally {
    env.restore();
  }
});

test("mutations are refused when the trial is over, and another company's books stay closed", async () => {
  const env = useTempDatabase();
  try {
    const db = getDb();
    const ids = seedTwoCompanies(db);
    const owner = Number(
      db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Ada', 'ada@example.com', 'x', 'accountant')").run()
        .lastInsertRowid
    );
    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'accountant')").run(ids.companyA, owner);

    const open = guardCompanyMutation(user(owner), ids.companyA);
    assert.equal(open, null);

    const foreign = guardCompanyMutation(user(owner), ids.companyB);
    assert.ok(foreign);
    assert.equal(foreign.status, 403);

    const scoped = resolveScopedCompanyId(owner, ids.companyB);
    assert.ok("error" in scoped);
    if ("error" in scoped) assert.equal(scoped.error.status, 403);

    db.prepare("UPDATE companies SET trial_ends_at = '2001-01-01T00:00:00.000Z', subscription_status = 'trial' WHERE id = ?").run(ids.companyA);
    const locked = guardCompanyMutation(user(owner), ids.companyA);
    assert.ok(locked);
    assert.equal(locked.status, 403);
    const body = (await locked.json()) as { code?: string };
    assert.equal(body.code, "SUBSCRIPTION_REQUIRED");

    db.prepare("INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, 'viewer')").run(ids.companyB, owner);
    db.prepare("UPDATE companies SET trial_ends_at = datetime('now', '+30 days'), subscription_status = 'trial' WHERE id = ?").run(ids.companyB);
    const viewer = guardCompanyMutation(user(owner, "admin"), ids.companyB);
    assert.ok(viewer);
    assert.equal(viewer.status, 403);
    const viewerBody = (await viewer.json()) as { code?: string; error?: string };
    assert.equal(viewerBody.code, undefined);
    assert.match(viewerBody.error || "", /Read-only/);
  } finally {
    env.restore();
  }
});

test("company mutation routes call the subscription guard and billing cannot self-upgrade", () => {
  const root = path.join(process.cwd(), "src/app/api");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(root);

  const companyRoutes = [
    "accounts/route.ts",
    "bills/route.ts",
    "bills/[id]/pay/route.ts",
    "customers/route.ts",
    "inventory/route.ts",
    "invoices/route.ts",
    "invoices/[id]/pay/route.ts",
    "journals/route.ts",
    "payroll/route.ts",
    "settings/route.ts",
    "vendors/route.ts",
  ];
  for (const relative of companyRoutes) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /guardCompanyMutation/, relative);
    assert.match(source, /assertMutationOrigin/, relative);
  }
  const companies = fs.readFileSync(path.join(root, "companies/route.ts"), "utf8");
  assert.match(companies, /guardNewCompany/);
  assert.match(companies, /assertMutationOrigin/);

  const billing = fs.readFileSync(path.join(root, "billing/route.ts"), "utf8");
  assert.match(billing, /assertMutationOrigin/);
  assert.doesNotMatch(billing, /UPDATE companies/);
  assert.match(billing, /setPaidUntil/);
});
