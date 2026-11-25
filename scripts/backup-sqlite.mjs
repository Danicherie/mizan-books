import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

/**
 * Consistent online backup of the live SQLite file.
 * VACUUM INTO writes a committed snapshot, including the WAL, without copying a half-written file.
 */
export function backupSqliteDatabase(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(process.cwd(), "data");
  const backupDir = options.backupDir || process.env.BACKUP_DIR || path.join(dataDir, "backups");
  const retentionDays = Number(options.retentionDays ?? process.env.BACKUP_RETENTION_DAYS ?? 14);
  const now = options.now ? new Date(options.now) : new Date();
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error("BACKUP_RETENTION_DAYS must be a number of days, zero or more.");
  }

  const sourcePath = path.resolve(dataDir, "mizan.db");
  const resolvedBackup = path.resolve(backupDir);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`No database file at ${sourcePath}`);
  }
  if (resolvedBackup === path.dirname(sourcePath) || resolvedBackup === sourcePath) {
    throw new Error("BACKUP_DIR must be a different folder from the live database.");
  }

  fs.mkdirSync(resolvedBackup, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(resolvedBackup, `mizan-${stamp}.db`);
  const partialPath = `${backupPath}.partial`;
  fs.rmSync(partialPath, { force: true });

  const db = new DatabaseSync(sourcePath);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const escaped = partialPath.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    db.close();
  }
  fs.renameSync(partialPath, backupPath);
  const removed = pruneOldBackups(resolvedBackup, retentionDays, now);
  return { backupPath, sourcePath, removed };
}

export function pruneOldBackups(backupDir, retentionDays, now = new Date()) {
  if (!fs.existsSync(backupDir)) return [];
  const maxAgeMs = Number(retentionDays) * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^mizan-.+\.db$/.test(name)) continue;
    const full = path.join(backupDir, name);
    const age = now.getTime() - fs.statSync(full).mtimeMs;
    if (age > maxAgeMs) {
      fs.rmSync(full);
      removed.push(full);
    }
  }
  return removed;
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  try {
    const result = backupSqliteDatabase();
    console.log(result.backupPath);
    if (result.removed.length) {
      console.log(`Removed ${result.removed.length} old backup(s).`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
