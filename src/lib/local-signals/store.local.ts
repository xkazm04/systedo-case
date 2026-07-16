/** Per-project local-signals store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `local_signals`, DDL in src/lib/db.ts) holding the
 *  {meta, ladder} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { LocalSignals } from "./types";

interface Row {
  data: string;
}

export async function getLocalSignals(projectId: string): Promise<LocalSignals | null> {
  const row = getDb()
    .prepare("SELECT data FROM local_signals WHERE project_id = ?")
    .get(projectId) as Row | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as LocalSignals;
  } catch {
    return null;
  }
}

export async function saveLocalSignals(projectId: string, signals: LocalSignals): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO local_signals (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(signals), now);
}

/** Atomic read-modify-write under a BEGIN IMMEDIATE write transaction (D2), so the
 *  row is write-locked for the whole mutate — a concurrent section import serializes
 *  behind it and sees this write instead of racing on a stale base. The mutator gets
 *  the RAW parsed blob (the dispatcher normalizes before calling it). */
export async function mutateLocalSignals(
  projectId: string,
  mutator: (prev: LocalSignals | null) => LocalSignals
): Promise<LocalSignals> {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare("SELECT data FROM local_signals WHERE project_id = ?")
      .get(projectId) as Row | undefined;
    let prev: LocalSignals | null = null;
    if (row) {
      try {
        prev = JSON.parse(row.data) as LocalSignals;
      } catch {
        prev = null;
      }
    }
    const next = mutator(prev);
    db.prepare(
      `INSERT INTO local_signals (project_id, data, updated_at)
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

export async function clearLocalSignals(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM local_signals WHERE project_id = ?").run(projectId);
}
