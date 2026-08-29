/** Dependent-side orphan walk — LOCAL node:sqlite enumerator.
 *
 *  The work list is the SCHEMA, not a hand-maintained table list: every table with
 *  a `project_id` column is enumerated (distinct project ids, plus the owning
 *  `user_id` where the table has one), and every table with a `tenant` column has
 *  its tenant keys parsed back through the `buildTenantKey` shape
 *  `u_{uid}_proj_{pid}[_{suffix}]`. A NEW per-project table is therefore walked
 *  automatically — including one nobody registered in PROJECT_STORE_DELETERS,
 *  which is exactly the class of store the dependent-side direction exists to
 *  catch (spec: docs/specs/2026-08-30-orphan-dependent-walk.md).
 *
 *  Also owns the OWNERLESS existence check: `projects.id` is a global primary key,
 *  so "does any project with this id exist" is answerable here without a user —
 *  which is what makes a Family-A sighting (no user column) safe to classify.
 *  Server-only; read-only — the walk never deletes, apply mode goes through the
 *  registry-derived sweep. */
import { getDb } from "@/lib/db";
import type { RawSighting } from "./orphan-walk";

/** `u_{uid}_proj_{pid}` with an optional `_{customerId|sklik}` suffix. The pid
 *  capture stops at `_` — real ids are 20-char hex and demo ids use `-`, neither
 *  contains an underscore, while the uid capture is greedy so a uid containing
 *  `_proj_`-free underscores parses correctly. */
const TENANT_KEY = /^u_(.+)_proj_([^_]+)(?:_.+)?$/;

interface NameRow {
  name: string;
}

/** Quote an identifier that came out of sqlite_master. Table names here are our own
 *  snake_case DDL, but quoting costs nothing and closes the door. */
function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function columnsOf(table: string): Set<string> {
  const db = getDb();
  const rows = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as unknown as NameRow[];
  return new Set(rows.map((r) => r.name));
}

/** Every (projectId, table, userId?) sighting in the live schema. */
export async function enumerateSightings(): Promise<RawSighting[]> {
  const db = getDb();
  const tables = (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as unknown as NameRow[]
  ).map((r) => r.name);

  const sightings: RawSighting[] = [];
  for (const table of tables) {
    if (table === "projects") continue; // the authoritative side, not a dependent
    const cols = columnsOf(table);

    if (cols.has("project_id")) {
      const hasUser = cols.has("user_id");
      const rows = db
        .prepare(
          hasUser
            ? `SELECT DISTINCT project_id AS pid, user_id AS uid FROM ${quoted(table)}`
            : `SELECT DISTINCT project_id AS pid FROM ${quoted(table)}`
        )
        .all() as unknown as { pid: string; uid?: string }[];
      for (const r of rows) {
        sightings.push({ projectId: r.pid, seenIn: table, userId: r.uid });
      }
    }

    if (cols.has("tenant")) {
      const rows = db.prepare(`SELECT DISTINCT tenant AS t FROM ${quoted(table)}`).all() as unknown as {
        t: string;
      }[];
      for (const r of rows) {
        const m = TENANT_KEY.exec(r.t);
        if (m) sightings.push({ projectId: m[2]!, seenIn: table, userId: m[1] });
      }
    }
  }
  return sightings;
}

/** Ownerless existence check: does ANY user's project carry this id? */
export async function ownerExists(projectId: string): Promise<boolean> {
  return getDb().prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
}
