/** Per-(user, project, key) JSON-blob state store — LOCAL node:sqlite backend.
 *  One row per (user, project, key) in `.data/systedo.db` (table `project_state`,
 *  DDL in src/lib/db.ts). Backs the modules whose user-created state used to live
 *  only in localStorage (the content schedule, review triage). Selected when
 *  LOCAL_DB is on. Server-only. Mirrors the Firestore backend's interface.
 *
 *  This backend deals in RAW BYTES only: the envelope/version decoding and the whole
 *  typed API live in the dispatcher (./store), so the two backends cannot drift on
 *  blob semantics. Its one real job beyond storage is the compare-and-swap the
 *  dispatcher's optimistic-concurrency layer needs — expressed as a WHERE clause so
 *  the compare and the swap are ONE statement (genuinely atomic), rather than a
 *  read-then-write that another writer can slip between. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";

interface StateRow {
  data: string;
}

/** The stored bytes for (user, project, key), or null when nothing is stored. */
export async function readRawProjectState(
  userId: string,
  projectId: string,
  key: string
): Promise<string | null> {
  const row = getDb()
    .prepare("SELECT data FROM project_state WHERE user_id = ? AND project_id = ? AND key = ?")
    .get(userId, projectId, key) as StateRow | undefined;
  return row ? row.data : null;
}

/** Store `raw`.
 *   • `expected === undefined` → unconditional upsert (last write wins).
 *   • `expected === null`      → succeed only if NOTHING is stored yet.
 *   • `expected === string`    → succeed only if the stored bytes are exactly that.
 *  Returns false when the compare-and-swap lost the race (the dispatcher turns that
 *  into a retryable ProjectStateConflictError). */
export async function writeRawProjectState(
  userId: string,
  projectId: string,
  key: string,
  raw: string,
  expected: string | null | undefined
): Promise<boolean> {
  ensureLocalUser(userId);
  const now = new Date().toISOString();
  const db = getDb();

  if (expected === undefined) {
    db.prepare(
      `INSERT INTO project_state (user_id, project_id, key, data, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, project_id, key)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(userId, projectId, key, raw, now);
    return true;
  }

  if (expected === null) {
    // "Only if absent": the conflict clause makes the existence check and the insert
    // one statement, so a racing insert loses here instead of being overwritten.
    const res = db
      .prepare(
        `INSERT INTO project_state (user_id, project_id, key, data, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, project_id, key) DO NOTHING`
      )
      .run(userId, projectId, key, raw, now);
    return Number(res.changes) === 1;
  }

  // "Only if unchanged": comparing the whole blob column needs no extra column (so
  // no migration) and cannot alias the way a same-millisecond timestamp could.
  const res = db
    .prepare(
      `UPDATE project_state SET data = ?, updated_at = ?
       WHERE user_id = ? AND project_id = ? AND key = ? AND data = ?`
    )
    .run(raw, now, userId, projectId, key, expected);
  return Number(res.changes) === 1;
}

/** Drop EVERY (user, project, *) state row — all keys for the project at once.
 *  Used by the project-deletion cascade; missing rows are a no-op. */
export async function deleteProjectState(userId: string, projectId: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM project_state WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
}
