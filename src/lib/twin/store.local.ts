/** Per-project twin store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `twin`, DDL in src/lib/db.ts) holding the
 *  {voices, channels, facts, drafts} blob. Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { TwinState } from "./types";

interface Row {
  data: string;
}

export async function getTwin(projectId: string): Promise<TwinState | null> {
  const row = getDb().prepare("SELECT data FROM twin WHERE project_id = ?").get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as TwinState;
  } catch {
    return null;
  }
}

export async function saveTwin(projectId: string, state: TwinState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO twin (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearTwin(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM twin WHERE project_id = ?").run(projectId);
}
