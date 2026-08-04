/** Feedback store — LOCAL node:sqlite backend. One row per submission in
 *  `.data/systedo.db` (table `feedback`, DDL in src/lib/db.ts) holding the full
 *  entry as a JSON blob. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { FeedbackEntry } from "./types";

interface Row {
  data: string;
}

export async function addFeedback(entry: FeedbackEntry): Promise<void> {
  getDb()
    .prepare("INSERT INTO feedback (id, data, created_at) VALUES (?, ?, ?)")
    .run(entry.id, JSON.stringify(entry), entry.at);
}

export async function listFeedback(limit = 100): Promise<FeedbackEntry[]> {
  const rows = getDb()
    .prepare("SELECT data FROM feedback ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as Row[];
  const out: FeedbackEntry[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.data) as FeedbackEntry);
    } catch {
      // a corrupt row is skipped, never fatal to the listing
    }
  }
  return out;
}
