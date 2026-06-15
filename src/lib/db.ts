/** Local SQLite store (server-only). The case study runs in local-dev mode for
 *  the campaigns feature, so we persist synced Google Ads data and AI evaluation
 *  reports to a file on disk — `.data/systedo.db` (gitignored).
 *
 *  Uses Node's built-in `node:sqlite` (Node 22.5+/24), so there is no native
 *  build step and no extra dependency — the same zero-dependency spirit as the
 *  rest of the project. Import only from server code (route handlers / stores).
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Survive Next.js dev hot-reload: keep a single connection on globalThis instead
// of opening a new handle every time this module is re-evaluated. We also remember
// which schema definition was last applied to that handle, so a handle that
// outlived an HMR across a schema change still picks up new tables/columns.
const g = globalThis as unknown as { __systedoDb?: DatabaseSync; __systedoSchema?: string };

/** Additive migrations for databases created before a column existed — a
 *  `CREATE TABLE IF NOT EXISTS` won't add a column to an already-existing table. */
const MIGRATIONS = ["ALTER TABLE reports ADD COLUMN input_hash TEXT"];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS campaigns (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL,
    status           TEXT NOT NULL,
    impressions      INTEGER NOT NULL,
    clicks           INTEGER NOT NULL,
    cost             REAL NOT NULL,
    conversions      REAL NOT NULL,
    conversion_value REAL NOT NULL,
    position         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    source    TEXT NOT NULL,
    period    TEXT NOT NULL,
    synced_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT NOT NULL,
    campaign_id TEXT,
    period      TEXT NOT NULL,
    model       TEXT NOT NULL,
    demo        INTEGER NOT NULL,
    payload     TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    took_ms     INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    input_hash  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_reports_lookup
    ON reports (period, scope, campaign_id, id);

  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       TEXT NOT NULL,
    ip           TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL,
    PRIMARY KEY (bucket, ip)
  );

  CREATE TABLE IF NOT EXISTS campaign_snapshots (
    synced_at        TEXT NOT NULL,
    campaign_id      TEXT NOT NULL,
    status           TEXT NOT NULL,
    cost             REAL NOT NULL,
    conversions      REAL NOT NULL,
    conversion_value REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_time
    ON campaign_snapshots (synced_at, campaign_id);
`;

/** Marker identifying the current schema definition; when it changes, the schema
 *  is (idempotently) re-applied even to a cached handle. */
const SCHEMA_KEY = `${SCHEMA}\n--migrations--\n${MIGRATIONS.join("\n")}`;

export function getDb(): DatabaseSync {
  let db = g.__systedoDb;
  if (!db) {
    const dir = join(process.cwd(), ".data");
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(join(dir, "systedo.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    g.__systedoDb = db;
  }

  // Apply (or re-apply) the schema whenever its definition changes. All statements
  // are idempotent (CREATE … IF NOT EXISTS), so this is safe to run on an existing
  // handle — it just creates anything missing. This is what makes a dev server that
  // survived an HMR across a schema edit (new table/column) self-heal without a
  // restart, and a db file created before a table existed get it created.
  if (g.__systedoSchema !== SCHEMA_KEY) {
    db.exec(SCHEMA);
    for (const stmt of MIGRATIONS) {
      try {
        db.exec(stmt);
      } catch {
        /* column already exists — node:sqlite throws, which is fine */
      }
    }
    g.__systedoSchema = SCHEMA_KEY;
  }

  return db;
}
