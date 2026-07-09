/** Per-project organic-channels store — LOCAL node:sqlite backend. One row per
 *  project in `.data/systedo.db` (table `organic_channels`, DDL in src/lib/db.ts)
 *  holding the {statuses, plan?} blob. Selected when LOCAL_DB is on. Server-only.
 *  Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { OrganicChannelState } from "./types";

interface Row {
  data: string;
}

export async function getOrganicChannels(projectId: string): Promise<OrganicChannelState | null> {
  const row = getDb()
    .prepare("SELECT data FROM organic_channels WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as OrganicChannelState;
  } catch {
    return null;
  }
}

export async function saveOrganicChannels(projectId: string, state: OrganicChannelState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO organic_channels (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearOrganicChannels(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM organic_channels WHERE project_id = ?").run(projectId);
}
