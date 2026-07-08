/** Per-project competitor store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `competitors`, DDL in src/lib/db.ts). Server-only. */
import { getDb } from "@/lib/db";
import type { CompetitorSet } from "./types";

interface Row {
  data: string;
}

export async function getCompetitors(projectId: string): Promise<CompetitorSet | null> {
  const row = getDb()
    .prepare("SELECT data FROM competitors WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as CompetitorSet;
  } catch {
    return null;
  }
}

export async function saveCompetitors(projectId: string, set: CompetitorSet): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO competitors (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(set), now);
}

export async function clearCompetitors(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM competitors WHERE project_id = ?").run(projectId);
}
