/** Per-project landing-page-experiments store — LOCAL node:sqlite backend. One row per
 *  project in `.data/systedo.db` (table `lp_experiments`, DDL in src/lib/db.ts) holding
 *  the {items, updatedAt} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { LpExperimentState } from "./types";

interface Row {
  data: string;
}

export async function getExperiments(projectId: string): Promise<LpExperimentState | null> {
  const row = getDb()
    .prepare("SELECT data FROM lp_experiments WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as LpExperimentState;
  } catch {
    return null;
  }
}

export async function saveExperiments(projectId: string, state: LpExperimentState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO lp_experiments (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearExperiments(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM lp_experiments WHERE project_id = ?").run(projectId);
}
