/** The conversion ledger — LOCAL node:sqlite backend. A REAL TABLE with one row per
 *  event (`conversion_events`; DDL + migration v31 in src/lib/db.ts), not the
 *  single-JSON-blob-per-project shape most modules use — see conversion-store.ts for
 *  why. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore backend's
 *  interface exactly. */
import { getDb } from "@/lib/db";
import { CONVERSION_EVENT_CAP, type ConversionEvent } from "./conversion-events";
import type { ConversionEventQuery, ConversionTenant } from "./conversion-store";

const DEFAULT_LIMIT = 500;

interface DataRow {
  data: string;
}

function parse(raw: string): ConversionEvent | null {
  try {
    return JSON.parse(raw) as ConversionEvent;
  } catch {
    return null; // a corrupt row is skipped, never allowed to break a read
  }
}

function parseAll(rows: DataRow[]): ConversionEvent[] {
  const out: ConversionEvent[] = [];
  for (const r of rows) {
    const v = parse(r.data);
    if (v) out.push(v);
  }
  return out;
}

export async function appendConversionEvents(
  projectId: string,
  events: readonly ConversionEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO conversion_events (project_id, id, at, kind, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (project_id, id)
     DO UPDATE SET at = excluded.at, kind = excluded.kind, data = excluded.data`
  );
  for (const e of events) {
    insert.run(projectId, e.id, e.at, e.kind, JSON.stringify(e));
  }

  const total =
    (db.prepare("SELECT COUNT(*) AS n FROM conversion_events WHERE project_id = ?").get(projectId) as
      | { n: number }
      | undefined)?.n ?? 0;
  const evict = total - CONVERSION_EVENT_CAP;
  if (evict > 0) {
    db.prepare(
      `DELETE FROM conversion_events
       WHERE project_id = ? AND id IN (
         SELECT id FROM conversion_events WHERE project_id = ?
         ORDER BY at ASC, id ASC LIMIT ?
       )`
    ).run(projectId, projectId, evict);
  }
}

export async function listConversionEvents(
  projectId: string,
  query: ConversionEventQuery = {}
): Promise<ConversionEvent[]> {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const since = query.sinceDay ?? "";
  const db = getDb();
  // WP S3 — the `uploaded` marker rides the event's `data` JSON (no column, no
  // migration), so it is read with json_extract. The predicate stays FULLY BOUND
  // rather than growing a third and fourth prepared statement: `?` toggles the filter
  // on, and the second `?` says which side of it is wanted. `IS NULL` evaluates to
  // 1/0 in SQLite, so comparing it to a bound 0/1 is an exact match, and with the
  // toggle at 0 the whole clause short-circuits true.
  //   uploaded === false → want (marker IS NULL) = 1   (the drain's work list)
  //   uploaded === true  → want (marker IS NULL) = 0
  //   uploaded undefined → filter off
  const filterOn = query.uploaded === undefined ? 0 : 1;
  const wantNull = query.uploaded === false ? 1 : 0;
  // Two bound statements rather than one built by concatenation — scripts/sast.mjs
  // blocks SQL assembled from interpolation, and the rule is worth more than the
  // brevity (the same reasoning as outcomes-store.local's per-link loop).
  const rows = query.kind
    ? (db
        .prepare(
          `SELECT data FROM conversion_events
           WHERE project_id = ? AND kind = ? AND at >= ?
             AND (? = 0 OR (json_extract(data, '$.uploaded') IS NULL) = ?)
           ORDER BY at DESC, id DESC LIMIT ?`
        )
        .all(projectId, query.kind, since, filterOn, wantNull, limit) as unknown as DataRow[])
    : (db
        .prepare(
          `SELECT data FROM conversion_events
           WHERE project_id = ? AND at >= ?
             AND (? = 0 OR (json_extract(data, '$.uploaded') IS NULL) = ?)
           ORDER BY at DESC, id DESC LIMIT ?`
        )
        .all(projectId, since, filterOn, wantNull, limit) as unknown as DataRow[]);
  return parseAll(rows);
}

export async function pruneConversionEvents(projectId: string, beforeDay: string): Promise<number> {
  const db = getDb();
  const before =
    (db
      .prepare("SELECT COUNT(*) AS n FROM conversion_events WHERE project_id = ? AND at < ?")
      .get(projectId, beforeDay) as { n: number } | undefined)?.n ?? 0;
  if (before === 0) return 0;
  db.prepare("DELETE FROM conversion_events WHERE project_id = ? AND at < ?").run(projectId, beforeDay);
  return before;
}

export async function clearConversionEvents(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM conversion_events WHERE project_id = ?").run(projectId);
}

export async function listConversionTenants(limit = 500): Promise<ConversionTenant[]> {
  // The ledger is project-keyed; `project_state` (where the rollup writes) is
  // (user, project)-keyed. The join back to the owner is one statement here rather
  // than an owner column on every row — see conversion-store.ts. A project whose
  // row is gone (a mid-delete race) simply drops out of the work list.
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT c.project_id AS project_id, p.user_id AS user_id
       FROM conversion_events c JOIN projects p ON p.id = c.project_id
       ORDER BY c.project_id ASC LIMIT ?`
    )
    .all(limit) as unknown as Array<{ project_id: string; user_id: string }>;
  return rows.map((r) => ({ userId: r.user_id, projectId: r.project_id }));
}
