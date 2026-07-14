/** Per-project inventory-plan store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `inventory_plan`, DDL in src/lib/db.ts) holding the
 *  {plan, stockAlerts, updatedAt} blob. Selected when LOCAL_DB is on. Server-only.
 *  Mirrors the Firestore backend's interface (and diagnoses/store.local). */
import { getDb } from "@/lib/db";
import type { InventoryPlanState } from "./plan-types";

interface Row {
  data: string;
}

export async function getInventoryPlanState(projectId: string): Promise<InventoryPlanState | null> {
  const row = getDb()
    .prepare("SELECT data FROM inventory_plan WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as InventoryPlanState;
  } catch {
    return null;
  }
}

export async function saveInventoryPlanState(projectId: string, state: InventoryPlanState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO inventory_plan (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearInventoryPlanState(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM inventory_plan WHERE project_id = ?").run(projectId);
}
