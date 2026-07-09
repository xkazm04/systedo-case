/** Per-project onboarding store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `onboarding`, DDL in src/lib/db.ts) holding the
 *  {scan, scanApplied, dismissed} blob. Selected when LOCAL_DB is on. Server-only.
 *  Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { OnboardingState } from "./types";

interface Row {
  data: string;
}

export async function getOnboarding(projectId: string): Promise<OnboardingState | null> {
  const row = getDb()
    .prepare("SELECT data FROM onboarding WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as OnboardingState;
  } catch {
    return null;
  }
}

export async function saveOnboarding(projectId: string, state: OnboardingState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO onboarding (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearOnboarding(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM onboarding WHERE project_id = ?").run(projectId);
}
