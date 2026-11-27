export function backupSqliteDatabase(options?: {
  dataDir?: string;
  backupDir?: string;
  retentionDays?: number;
  now?: Date | string;
}): { backupPath: string; sourcePath: string; receiptsPath: string | null; removed: string[] };

export function copyReceiptsSnapshot(dataDir: string, backupDir: string, stamp: string): string | null;

export function pruneOldBackups(backupDir: string, retentionDays: number, now?: Date): string[];
