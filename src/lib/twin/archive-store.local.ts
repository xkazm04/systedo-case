/** Per-project twin archive — LOCAL node:sqlite backend. One row per archived
 *  draft in `.data/systedo.db` (table `twin_archive`, DDL in src/lib/db.ts); the
 *  full record is the JSON `data` blob, with channel/status/archived_at columned
 *  for the bounded reads + oldest-first eviction. Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { archivedAt, overflowCount, TWIN_ARCHIVE_CAP, type EvictionAccounting } from "./archive";
import type { TwinDraft } from "./types";

interface DataRow {
  data: string;
}

function parseRows(rows: DataRow[]): TwinDraft[] {
  const out: TwinDraft[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data) as TwinDraft);
    } catch {
      /* skip a corrupt blob rather than break the read */
    }
  }
  return out;
}

export async function archiveDrafts(projectId: string, drafts: TwinDraft[]): Promise<number> {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO twin_archive (project_id, id, channel, status, archived_at, data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, id)
     DO UPDATE SET channel = excluded.channel, status = excluded.status,
                   archived_at = excluded.archived_at, data = excluded.data`
  );
  for (const d of drafts) {
    insert.run(projectId, d.id, d.channel, d.status, archivedAt(d), JSON.stringify(d));
  }

  // Eviction: keep only the newest TWIN_ARCHIVE_CAP for this project.
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM twin_archive WHERE project_id = ?").get(projectId) as
      | { n: number }
      | undefined
  )?.n ?? 0;
  const evicted = overflowCount(total, TWIN_ARCHIVE_CAP);
  if (evicted > 0) {
    // The victims, BEFORE the delete — the accounting names exactly what died.
    const batch = db
      .prepare(
        `SELECT id, archived_at AS archivedAt FROM twin_archive
         WHERE project_id = ?
         ORDER BY archived_at ASC, id ASC
         LIMIT ?`
      )
      .all(projectId, evicted) as unknown as { id: string; archivedAt: string }[];

    // Recorded accounting: eviction DELETES audit records, and a deleted record
    // cannot testify for itself — so the same transaction that deletes writes a
    // durable per-project tally outside the evicted set. The sqlite counterpart of
    // the Firestore backend's delete-batch write (commit 10693e1e); BEGIN IMMEDIATE
    // per the diagnoses/store.local pattern so the delete and its accounting land
    // together or not at all.
    db.exec("BEGIN IMMEDIATE");
    try {
      const del = db.prepare("DELETE FROM twin_archive WHERE project_id = ? AND id = ?");
      for (const b of batch) del.run(projectId, b.id);
      db.prepare(
        `INSERT INTO twin_archive_evictions (project_id, cap, total_evicted, last_evicted_at, last_batch)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (project_id)
         DO UPDATE SET cap = excluded.cap,
                       total_evicted = total_evicted + excluded.total_evicted,
                       last_evicted_at = excluded.last_evicted_at,
                       last_batch = excluded.last_batch`
      ).run(projectId, TWIN_ARCHIVE_CAP, batch.length, new Date().toISOString(), JSON.stringify(batch));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    console.warn(
      `[twin] archive cap ${TWIN_ARCHIVE_CAP} reached for ${projectId}: evicted ${evicted} oldest audit record(s)`
    );
  }
  return evicted;
}

export async function listArchivedDrafts(projectId: string, limit = 200): Promise<TwinDraft[]> {
  const rows = getDb()
    .prepare(
      "SELECT data FROM twin_archive WHERE project_id = ? ORDER BY archived_at DESC, id DESC LIMIT ?"
    )
    .all(projectId, limit) as unknown as DataRow[];
  return parseRows(rows);
}

export async function listArchivedRejects(projectId: string, limit = 200): Promise<TwinDraft[]> {
  const rows = getDb()
    .prepare(
      `SELECT data FROM twin_archive
       WHERE project_id = ? AND status = 'rejected'
       ORDER BY archived_at DESC, id DESC LIMIT ?`
    )
    .all(projectId, limit) as unknown as DataRow[];
  return parseRows(rows);
}

export async function clearArchive(projectId: string): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM twin_archive WHERE project_id = ?").run(projectId);
  // A cleared archive keeps no eviction history either: clearArchive is untrain /
  // project delete, and a tally for a gone project would itself be an orphan.
  db.prepare("DELETE FROM twin_archive_evictions WHERE project_id = ?").run(projectId);
}

/** The durable per-project eviction tally, or null when the cap has never fired.
 *  Same field set as the Firestore backend's twinArchiveEvictions doc. */
export async function readEvictionAccounting(projectId: string): Promise<EvictionAccounting | null> {
  const row = getDb()
    .prepare(
      `SELECT cap, total_evicted AS totalEvicted, last_evicted_at AS lastEvictedAt, last_batch AS lastBatch
       FROM twin_archive_evictions WHERE project_id = ?`
    )
    .get(projectId) as
    | { cap: number; totalEvicted: number; lastEvictedAt: string; lastBatch: string }
    | undefined;
  if (!row) return null;
  let lastBatch: EvictionAccounting["lastBatch"] = [];
  try {
    const parsed = JSON.parse(row.lastBatch);
    if (Array.isArray(parsed)) lastBatch = parsed;
  } catch {
    /* a corrupt batch blob degrades to [], the tally numbers still stand */
  }
  return { projectId, cap: row.cap, totalEvicted: row.totalEvicted, lastEvictedAt: row.lastEvictedAt, lastBatch };
}
