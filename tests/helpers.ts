import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resetDbForTests } from "../src/lib/db.ts";

const ENV_KEYS = [
  "DATA_DIR",
  "ENABLE_DEMO_LOGIN",
  "INITIAL_ADMIN_EMAIL",
  "INITIAL_ADMIN_PASSWORD",
  "INITIAL_ADMIN_NAME",
  "INITIAL_COMPANY_NAME",
  "INITIAL_COMPANY_CURRENCY",
  "NODE_ENV",
  "MIZAN_SESSION_SECRET",
  "BACKUP_DIR",
  "BACKUP_RETENTION_DAYS",
] as const;

export function useTempDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mizan-test-"));
  const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const key of ENV_KEYS) previous[key] = process.env[key];

  process.env.DATA_DIR = dir;
  delete process.env.ENABLE_DEMO_LOGIN;
  delete process.env.INITIAL_ADMIN_EMAIL;
  delete process.env.INITIAL_ADMIN_PASSWORD;
  delete process.env.INITIAL_ADMIN_NAME;
  delete process.env.INITIAL_COMPANY_NAME;
  delete process.env.INITIAL_COMPANY_CURRENCY;
  delete process.env.BACKUP_DIR;
  resetDbForTests();

  return {
    dir,
    restore() {
      resetDbForTests();
      for (const key of ENV_KEYS) {
        setEnv(key, previous[key]);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

export function seedTwoCompanies(db: DatabaseSync) {
  const insertCompany = db.prepare("INSERT INTO companies (name, legal_name, base_currency) VALUES (?, ?, 'ETB')");
  const companyA = Number(insertCompany.run("Company A", "Company A").lastInsertRowid);
  const companyB = Number(insertCompany.run("Company B", "Company B").lastInsertRowid);
  const insertAccount = db.prepare(
    "INSERT INTO accounts (company_id, code, name, type, subtype, normal_balance) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const cashA = Number(insertAccount.run(companyA, "1000", "Cash", "ASSET", "CASH", "DEBIT").lastInsertRowid);
  const equityA = Number(insertAccount.run(companyA, "3000", "Equity", "EQUITY", "CAPITAL", "CREDIT").lastInsertRowid);
  const cashB = Number(insertAccount.run(companyB, "1000", "Cash", "ASSET", "CASH", "DEBIT").lastInsertRowid);
  const equityB = Number(insertAccount.run(companyB, "3000", "Equity", "EQUITY", "CAPITAL", "CREDIT").lastInsertRowid);
  return { companyA, companyB, cashA, equityA, cashB, equityB };
}
