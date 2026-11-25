export function backupSqliteDatabase(options?: {
  dataDir?: string;
  backupDir?: string;
  retentionDays?: number;
  now?: Date | string;
}): { backupPath: string; sourcePath: string; removed: string[] };

export function pruneOldBackups(backupDir: string, retentionDays: number, now?: Date): string[];
