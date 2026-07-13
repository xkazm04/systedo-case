/** Per-project report-annotations store — LOCAL node:sqlite backend. One row per
 *  project in `.data/systedo.db` (table `annotations`, DDL in src/lib/db.ts) holding
 *  the {items, updatedAt} blob. Selected when LOCAL_DB is on. Server-only. Mirrors
 *  the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { AnnotationState } from "./types";

interface Row {
  data: string;
}

export async function getAnnotations(projectId: string): Promise<AnnotationState | null> {
  const row = getDb()
    .prepare("SELECT data FROM annotations WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as AnnotationState;
  } catch {
    return null;
  }
}

export async function saveAnnotations(projectId: string, state: AnnotationState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO annotations (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearAnnotations(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM annotations WHERE project_id = ?").run(projectId);
}
