/** Project catalog store — LOCAL node:sqlite backend. Offerings persist as one JSON
 *  blob per (user, project) in `.data/systedo.db` (table `project_catalog`, DDL in
 *  src/lib/db.ts). Selected by the dispatcher when LOCAL_DB is on. Server-only.
 *  Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import type { Offering } from "./offering";

interface CatalogRow {
  data: string;
}

/** The project's saved offerings, or null if it has never been saved (→ seed). */
export async function listOfferings(userId: string, projectId: string): Promise<Offering[] | null> {
  const row = getDb()
    .prepare("SELECT data FROM project_catalog WHERE user_id = ? AND project_id = ?")
    .get(userId, projectId) as CatalogRow | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data);
    return Array.isArray(parsed) ? (parsed as Offering[]) : null;
  } catch {
    return null;
  }
}

/** Replace the project's whole catalog. */
export async function saveOfferings(userId: string, projectId: string, offerings: Offering[]): Promise<void> {
  ensureLocalUser(userId);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO project_catalog (user_id, project_id, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(userId, projectId, JSON.stringify(offerings), now);
}
