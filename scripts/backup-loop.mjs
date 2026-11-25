import { backupSqliteDatabase } from "./backup-sqlite.mjs";

const seconds = Number(process.env.BACKUP_INTERVAL_SECONDS || 86400);
const intervalMs = Number.isFinite(seconds) && seconds >= 60 ? seconds * 1000 : 86_400_000;

async function tick() {
  try {
    const result = backupSqliteDatabase();
    const removed = result.removed.length ? ` Removed ${result.removed.length} old backup(s).` : "";
    console.log(`[mizan-backup] Wrote ${result.backupPath}.${removed}`);
  } catch (err) {
    console.error(`[mizan-backup] ${err instanceof Error ? err.message : String(err)}`);
  }
}

await tick();
setInterval(() => {
  void tick();
}, intervalMs);
