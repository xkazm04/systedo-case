/** Per-project twin store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `twin`, DDL in src/lib/db.ts) holding the
 *  {voices, channels, facts, drafts} blob. Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { parsePersistedTwin } from "./persisted";
import type { TwinState } from "./types";

interface Row {
  data: string;
  updated_at?: string;
}

export async function getTwin(projectId: string): Promise<TwinState | null> {
  const row = getDb()
    .prepare("SELECT data, updated_at FROM twin WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  const state = parsePersistedTwin(row.data);
  if (!state) return null;
  // The row's own `updated_at` column is the honest server "last saved" — surface it
  // (over any client-supplied blob `updatedAt`) so ResolvedTwin.updatedAt is real
  // instead of the effectively-always-undefined blob field it used to read.
  if (row.updated_at) state.updatedAt = row.updated_at;
  return state;
}

/** Atomic read-modify-write under a BEGIN IMMEDIATE write transaction, so the row is
 *  write-locked for the whole mutate — a concurrent send/full-state save serializes
 *  behind it and sees this write instead of racing on a stale base (the check-then-act
 *  gap between getTwin and saveTwin). The mutator gets the sanitized prev blob (or null
 *  when nothing is stored yet). Mirrors mutateLocalSignals. */
export async function mutateTwin(
  projectId: string,
  mutator: (prev: TwinState | null) => TwinState
): Promise<TwinState> {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT data FROM twin WHERE project_id = ?").get(projectId) as Row | undefined;
    const prev = row ? parsePersistedTwin(row.data) : null;
    const next = mutator(prev);
    db.prepare(
      `INSERT INTO twin (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(projectId, JSON.stringify(next), new Date().toISOString());
    db.exec("COMMIT");
    return next;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export async function saveTwin(projectId: string, state: TwinState): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO twin (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(state), now);
}

export async function clearTwin(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM twin WHERE project_id = ?").run(projectId);
}

/** WP S2 — the (owner, project) work list for the `twin-dispatch` ledger step. The
 *  twin table is project-keyed; `projects` is where the owner lives, so the join is
 *  one statement here rather than an owner column on every twin row (the
 *  `listConversionTenants` precedent). Parameterised, never interpolated. */
export async function listTwinTenants(limit = 500): Promise<{ userId: string; projectId: string }[]> {
  const rows = getDb()
    .prepare(
      `SELECT t.project_id AS project_id, p.user_id AS user_id
       FROM twin t JOIN projects p ON p.id = t.project_id
       ORDER BY t.project_id ASC LIMIT ?`
    )
    .all(limit) as unknown as Array<{ project_id: string; user_id: string }>;
  return rows.map((r) => ({ userId: r.user_id, projectId: r.project_id }));
}
