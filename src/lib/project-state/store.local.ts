/** Per-(user, project, key) JSON-blob state store — LOCAL node:sqlite backend.
 *  One row per (user, project, key) in `.data/systedo.db` (table `project_state`,
 *  DDL in src/lib/db.ts). Backs the modules whose user-created state used to live
 *  only in localStorage (the content schedule, review triage). Selected when
 *  LOCAL_DB is on. Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";

interface StateRow {
  data: string;
}

export async function getProjectState<T>(userId: string, projectId: string, key: string): Promise<T | null> {
  const row = getDb()
    .prepare("SELECT data FROM project_state WHERE user_id = ? AND project_id = ? AND key = ?")
    .get(userId, projectId, key) as StateRow | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

export async function saveProjectState<T>(userId: string, projectId: string, key: string, data: T): Promise<void> {
  ensureLocalUser(userId);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO project_state (user_id, project_id, key, data, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, project_id, key)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(userId, projectId, key, JSON.stringify(data), now);
}
