import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "./db";

export function appVersion(): string {
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" && parsed.version ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

export function databaseOk(): boolean {
  try {
    getDb().prepare("SELECT 1 AS ok").get();
    return true;
  } catch {
    return false;
  }
}
