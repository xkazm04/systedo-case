/** Per-project recaps store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `recaps`, DDL in src/lib/db.ts) holding the {items,
 *  updatedAt} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore
 *  backend's interface (and diagnoses/store.local). */
import { getDb } from "@/lib/db";
import type { RecapState } from "./types";

interface Row {
  data: string;
}

export async function getRecaps(projectId: string): Promise<RecapState | null> {
  const row = getDb()
    .prepare("SELECT data FROM recaps WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as RecapState;
  } catch {
    return null;
  }
}

export async function saveRecaps(projectId: string, state: RecapState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO recaps (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearRecaps(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM recaps WHERE project_id = ?").run(projectId);
}
