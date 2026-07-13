/** Per-project diagnoses store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `diagnoses`, DDL in src/lib/db.ts) holding the {items,
 *  updatedAt} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore
 *  backend's interface (and organic-channels/store.local). */
import { getDb } from "@/lib/db";
import type { DiagnosisState } from "./types";

interface Row {
  data: string;
}

export async function getDiagnoses(projectId: string): Promise<DiagnosisState | null> {
  const row = getDb()
    .prepare("SELECT data FROM diagnoses WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as DiagnosisState;
  } catch {
    return null;
  }
}

export async function saveDiagnoses(projectId: string, state: DiagnosisState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO diagnoses (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearDiagnoses(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM diagnoses WHERE project_id = ?").run(projectId);
}
