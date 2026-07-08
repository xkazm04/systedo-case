/** Per-project local-signals store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `local_signals`, DDL in src/lib/db.ts) holding the
 *  {meta, ladder} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { LocalSignals } from "./types";

interface Row {
  data: string;
}

export async function getLocalSignals(projectId: string): Promise<LocalSignals | null> {
  const row = getDb()
    .prepare("SELECT data FROM local_signals WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as LocalSignals;
  } catch {
    return null;
  }
}

export async function saveLocalSignals(projectId: string, signals: LocalSignals): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO local_signals (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(signals), now);
}

export async function clearLocalSignals(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM local_signals WHERE project_id = ?").run(projectId);
}
