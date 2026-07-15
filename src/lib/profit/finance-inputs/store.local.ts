/** Per-project finance-inputs store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `finance_inputs`, DDL in src/lib/db.ts) holding the
 *  {realNumbers?, scenarios, channelMargins?, updatedAt} blob. Selected when LOCAL_DB
 *  is on. Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { FinanceInputs } from "./types";

interface Row {
  data: string;
}

export async function getFinanceInputs(projectId: string): Promise<FinanceInputs | null> {
  const row = getDb()
    .prepare("SELECT data FROM finance_inputs WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as FinanceInputs;
  } catch {
    return null;
  }
}

export async function saveFinanceInputs(projectId: string, inputs: FinanceInputs): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO finance_inputs (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(inputs), now);
}

export async function clearFinanceInputs(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM finance_inputs WHERE project_id = ?").run(projectId);
}
