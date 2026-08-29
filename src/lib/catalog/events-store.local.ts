/** The catalog change ledger — LOCAL node:sqlite backend. A REAL TABLE with one row
 *  per event (`catalog_events`; DDL + migration in src/lib/db.ts), not the
 *  single-JSON-blob-per-project shape the catalog itself uses — see events-store.ts
 *  for why. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore backend's
 *  interface exactly. */
import { getDb } from "@/lib/db";
import { ensureLocalUser } from "@/lib/users/local";
import { CATALOG_EVENT_CAP, type CatalogEvent } from "./events";
import type { CatalogEventQuery } from "./events-store";

const DEFAULT_LIMIT = 200;

interface DataRow {
  data: string;
}

function parse(raw: string): CatalogEvent | null {
  try {
    return JSON.parse(raw) as CatalogEvent;
  } catch {
    return null; // a corrupt row is skipped, never allowed to break a read
  }
}

export async function appendCatalogEvents(
  userId: string,
  projectId: string,
  events: CatalogEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const db = getDb();
  ensureLocalUser(userId);
  const insert = db.prepare(
    `INSERT INTO catalog_events (user_id, project_id, id, at, key, kind, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, project_id, id)
     DO UPDATE SET at = excluded.at, key = excluded.key, kind = excluded.kind,
                   data = excluded.data`
  );
  for (const e of events) {
    insert.run(userId, projectId, e.id, e.at, e.key, e.kind, JSON.stringify(e));
  }

  const total =
    (db
      .prepare("SELECT COUNT(*) AS n FROM catalog_events WHERE user_id = ? AND project_id = ?")
      .get(userId, projectId) as { n: number } | undefined)?.n ?? 0;
  const evict = total - CATALOG_EVENT_CAP;
  if (evict > 0) {
    db.prepare(
      `DELETE FROM catalog_events
       WHERE user_id = ? AND project_id = ? AND id IN (
         SELECT id FROM catalog_events WHERE user_id = ? AND project_id = ?
         ORDER BY at ASC, id ASC LIMIT ?
       )`
    ).run(userId, projectId, userId, projectId, evict);
  }
}

export async function listCatalogEvents(
  userId: string,
  projectId: string,
  query: CatalogEventQuery = {}
): Promise<CatalogEvent[]> {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const db = getDb();
  const rows = query.key
    ? (db
        .prepare(
          `SELECT data FROM catalog_events WHERE user_id = ? AND project_id = ? AND key = ?
           ORDER BY at DESC, id DESC LIMIT ?`
        )
        .all(userId, projectId, query.key, limit) as unknown as DataRow[])
    : (db
        .prepare(
          `SELECT data FROM catalog_events WHERE user_id = ? AND project_id = ?
           ORDER BY at DESC, id DESC LIMIT ?`
        )
        .all(userId, projectId, limit) as unknown as DataRow[]);

  const out: CatalogEvent[] = [];
  for (const r of rows) {
    const v = parse(r.data);
    if (v) out.push(v);
  }
  return out;
}

export async function clearCatalogEvents(userId: string, projectId: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM catalog_events WHERE user_id = ? AND project_id = ?")
    .run(userId, projectId);
}
