/** Per-project revenue-goal store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `project_goal`, DDL in src/lib/db.ts) holding the
 *  {goal, history} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface (and cost-model/store.local). */
import { getDb } from "@/lib/db";
import { sanitizeProjectGoal, type ProjectGoal } from "./types";

interface Row {
  data: string;
}

export async function getProjectGoal(projectId: string): Promise<ProjectGoal | null> {
  const row = getDb()
    .prepare("SELECT data FROM project_goal WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return sanitizeProjectGoal(JSON.parse(row.data));
  } catch {
    return null;
  }
}

export async function saveProjectGoal(projectId: string, goal: ProjectGoal): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO project_goal (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(goal), now);
}

export async function clearProjectGoal(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM project_goal WHERE project_id = ?").run(projectId);
}
