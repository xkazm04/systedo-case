/** Per-project imported-leads store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `lead_imports`, DDL in src/lib/db.ts) holding the
 *  {items, source, syncedAt, updatedAt} blob. Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { ImportedLeadsState } from "./types";

interface Row {
  data: string;
}

export async function getLeadImports(projectId: string): Promise<ImportedLeadsState | null> {
  const row = getDb()
    .prepare("SELECT data FROM lead_imports WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as ImportedLeadsState;
  } catch {
    return null;
  }
}

export async function saveLeadImports(projectId: string, state: ImportedLeadsState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO lead_imports (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearLeadImports(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM lead_imports WHERE project_id = ?").run(projectId);
}
