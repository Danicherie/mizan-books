import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { backupSqliteDatabase, pruneOldBackups } from "../scripts/backup-sqlite.mjs";

test("online backup is a consistent snapshot and old copies are removed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mizan-backup-"));
  const dataDir = path.join(dir, "data");
  const backupDir = path.join(dir, "backups");
  fs.mkdirSync(dataDir);
  const source = path.join(dataDir, "mizan.db");
  const live = new DatabaseSync(source);
  live.exec("PRAGMA journal_mode = WAL");
  live.exec("CREATE TABLE marks (n INTEGER)");
  live.exec("BEGIN");
  live.exec("INSERT INTO marks VALUES (1)");
  live.exec("COMMIT");

  live.exec("BEGIN");
  live.exec("INSERT INTO marks VALUES (99)");
  const first = backupSqliteDatabase({ dataDir, backupDir, retentionDays: 14 });
  live.exec("ROLLBACK");

  const snapshot = new DatabaseSync(first.backupPath, { readOnly: true });
  const during = snapshot.prepare("SELECT n FROM marks ORDER BY n").all() as Array<{ n: number }>;
  snapshot.close();
  assert.deepEqual(
    during.map((row) => row.n),
    [1]
  );

  live.exec("INSERT INTO marks VALUES (2)");
  const second = backupSqliteDatabase({ dataDir, backupDir, retentionDays: 14 });
  live.close();
  const copy = new DatabaseSync(second.backupPath, { readOnly: true });
  const after = copy.prepare("SELECT n FROM marks ORDER BY n").all() as Array<{ n: number }>;
  copy.close();
  assert.deepEqual(
    after.map((row) => row.n),
    [1, 2]
  );

  const stale = path.join(backupDir, "mizan-2000-01-01T00-00-00-000Z.db");
  fs.writeFileSync(stale, "old");
  const longAgo = new Date("2000-01-01T00:00:00Z");
  fs.utimesSync(stale, longAgo, longAgo);
  const removed = pruneOldBackups(backupDir, 14, new Date("2026-11-25T00:00:00Z"));
  assert.equal(removed.length, 1);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(second.backupPath), true);

  fs.rmSync(dir, { recursive: true, force: true });
});
