import { getDb } from "./db";
import type { ContactFields } from "./contact";

export interface ContactMessageRow {
  id: number;
  name: string;
  email: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export function saveContactMessage(fields: ContactFields): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)")
    .run(fields.name, fields.email, fields.message);
  return Number(result.lastInsertRowid);
}

export function listContactMessages(): ContactMessageRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, name, email, message, read_at, created_at FROM contact_messages ORDER BY id DESC"
    )
    .all() as unknown as ContactMessageRow[];
}

export function markContactMessageRead(id: number): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE contact_messages SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function deleteContactMessage(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM contact_messages WHERE id = ?").run(id);
  return result.changes > 0;
}
