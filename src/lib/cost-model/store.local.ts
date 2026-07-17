/** Per-project cost-model store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `cost_model`, DDL in src/lib/db.ts) holding the CostModel
 *  blob. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore backend. */
import { getDb } from "@/lib/db";
import type { CostModel } from "./types";

interface Row {
  data: string;
}

export async function getCostModel(projectId: string): Promise<CostModel | null> {
  const row = getDb()
    .prepare("SELECT data FROM cost_model WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as CostModel;
  } catch {
    return null;
  }
}

export async function saveCostModel(
  projectId: string,
  model: Omit<CostModel, "updatedAt">
): Promise<void> {
  // The store is the SINGLE writer of `updatedAt`: it stamps one timestamp and writes
  // it into BOTH the blob and the column, so the "last edited" the report reads (blob)
  // can never diverge from the row's own updated_at.
  const now = new Date().toISOString();
  const full: CostModel = { ...model, updatedAt: now };
  getDb()
    .prepare(
      `INSERT INTO cost_model (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(full), now);
}

export async function clearCostModel(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM cost_model WHERE project_id = ?").run(projectId);
}
