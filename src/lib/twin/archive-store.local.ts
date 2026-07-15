/** Per-project twin archive — LOCAL node:sqlite backend. One row per archived
 *  draft in `.data/systedo.db` (table `twin_archive`, DDL in src/lib/db.ts); the
 *  full record is the JSON `data` blob, with channel/status/archived_at columned
 *  for the bounded reads + oldest-first eviction. Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface. */
import { getDb } from "@/lib/db";
import { archivedAt, overflowCount, TWIN_ARCHIVE_CAP } from "./archive";
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
    db.prepare(
      `DELETE FROM twin_archive
       WHERE project_id = ?
         AND id IN (
           SELECT id FROM twin_archive WHERE project_id = ?
           ORDER BY archived_at ASC, id ASC
           LIMIT ?
         )`
    ).run(projectId, projectId, evicted);
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
  getDb().prepare("DELETE FROM twin_archive WHERE project_id = ?").run(projectId);
}
