/** Local SQLite store (server-only). Backs two things only:
 *   - the anonymous AI rate-limiter (`rate_limits`), always on; and
 *   - in LOCAL_DB mode, the authed product's `users`/`projects` (normally in
 *     Firestore) so `/app` works fully offline.
 *  Synced Google Ads campaigns and AI evaluation reports do NOT live here — they
 *  persist per-tenant in Firestore (see `campaigns/store.ts`, commit 9e66ed9).
 *  Stored at `.data/systedo.db` (gitignored).
 *
 *  Uses Node's built-in `node:sqlite` (Node 22.5+/24), so there is no native
 *  build step and no extra dependency — the same zero-dependency spirit as the
 *  rest of the project. Import only from server code (route handlers / stores).
 */
import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Survive Next.js dev hot-reload: keep a single connection on globalThis instead
// of opening a new handle every time this module is re-evaluated. We also remember
// which schema definition was last applied to that handle, so a handle that
// outlived an HMR across a schema change still picks up new tables/columns.
const g = globalThis as unknown as { __systedoDb?: DatabaseSync; __systedoSchema?: string };

/** Additive column migrations for databases created before a column existed — a
 *  `CREATE TABLE IF NOT EXISTS` won't add a column to an already-existing table. Each
 *  is applied ONLY when the column is actually missing (checked via PRAGMA), so the N
 *  test processes that share `.data/systedo.db` don't all fire the same ALTER at once
 *  and contend on the write lock. */
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  // Generic ERP adapter config (endpoint/format/mapping) for warehouse_connection.
  {
    table: "warehouse_connection",
    column: "config_json",
    ddl: "ALTER TABLE warehouse_connection ADD COLUMN config_json TEXT",
  },
  // Sync-health tracking (drives the cron's failure alerting).
  {
    table: "warehouse_connection",
    column: "last_error",
    ddl: "ALTER TABLE warehouse_connection ADD COLUMN last_error TEXT",
  },
  {
    table: "warehouse_connection",
    column: "last_error_at",
    ddl: "ALTER TABLE warehouse_connection ADD COLUMN last_error_at TEXT",
  },
  {
    table: "warehouse_connection",
    column: "fail_count",
    ddl: "ALTER TABLE warehouse_connection ADD COLUMN fail_count INTEGER",
  },
  // Client logo URL for branding / client-facing reports (see projects/store.local.ts).
  {
    table: "projects",
    column: "logo_url",
    ddl: "ALTER TABLE projects ADD COLUMN logo_url TEXT",
  },
];

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (c) => c.name === column
  );
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       TEXT NOT NULL,
    ip           TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL,
    PRIMARY KEY (bucket, ip)
  );

  -- LOCAL_DB mode only: the authed product's users + projects, normally in
  -- Firestore, persisted locally so /app works fully offline (see local-mode.ts,
  -- projects/store.local.ts, users/local.ts). Untouched when LOCAL_DB is off.
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT,
    image      TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    accent_color    TEXT NOT NULL,
    logo_url        TEXT,
    domain          TEXT,
    tenant          TEXT,
    ads_customer_id TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user
    ON projects (user_id, created_at);

  -- LOCAL_DB mode only: a project's business catalog (offerings), stored as one
  -- JSON blob keyed by (user, project). Mirrors the Firestore projectCatalogs doc.
  -- Read/written by catalog/store.local.ts; the seed is the fallback when absent.
  CREATE TABLE IF NOT EXISTS project_catalog (
    user_id    TEXT NOT NULL,
    project_id TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id)
  );

  -- LOCAL_DB mode only: per-(user, project, key) JSON blob for module state that
  -- used to live only in the browser (the content schedule, review triage). Mirrors
  -- the Firestore users/{uid}/projectState/{projectId}__{key} doc. See
  -- project-state/store.local.ts.
  CREATE TABLE IF NOT EXISTS project_state (
    user_id    TEXT NOT NULL,
    project_id TEXT NOT NULL,
    key        TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id, key)
  );

  -- A1: live report metrics synced from an ad platform (Google Ads). One blob per
  -- project holding {meta, rows[]} — project-scoped (the synced data belongs to the
  -- project, not the user who triggered the sync). Absent → the report falls back
  -- to the scaled sample dataset (illustrative). See src/lib/report-metrics/.
  CREATE TABLE IF NOT EXISTS report_metrics (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- A2: live local signals (imported/synced keyword-rank ladder) per local project.
  -- One blob per project holding {meta, ladder[]}; absent → the map falls back to
  -- the sample ladder (illustrative). See src/lib/local-signals/.
  CREATE TABLE IF NOT EXISTS local_signals (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- A3: a project's real cost model (blended gross margin, monthly overhead,
  -- per-order cost) so the report shows true net profit after COGS. One blob per
  -- project; absent → the report stays on pre-COGS contribution. See src/lib/cost-model/.
  CREATE TABLE IF NOT EXISTS cost_model (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- C3: a project's optional competitor set (user-entered names + notes), fed into
  -- the recap + social grounding so the narrative is comparative, not just self-referential.
  CREATE TABLE IF NOT EXISTS competitors (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- LOCAL_DB mode only: a project's persisted warehouse/ERP connection. token_enc is
  -- the AES-GCM-encrypted API token (see token-crypto.ts) — never stored plaintext,
  -- never returned to the client. Mirrors the Firestore projectConnections doc.
  CREATE TABLE IF NOT EXISTS warehouse_connection (
    user_id       TEXT NOT NULL,
    project_id    TEXT NOT NULL,
    provider      TEXT NOT NULL,
    inventory_id  TEXT,
    token_enc     TEXT,
    config_json   TEXT,
    connected_at  TEXT NOT NULL,
    last_sync_at  TEXT,
    last_error    TEXT,
    last_error_at TEXT,
    fail_count    INTEGER,
    PRIMARY KEY (user_id, project_id)
  );

  -- LOCAL_DB mode only: a user's BYOM (bring-your-own-model) config — one JSON
  -- blob holding the active vendor and per-vendor ENCRYPTED provider API keys
  -- (see llm/keys/crypto.ts). Keys are never stored plaintext, never returned to
  -- the client. Mirrors the Firestore byomConfigs doc.
  CREATE TABLE IF NOT EXISTS byom_config (
    user_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

/** Marker identifying the current schema definition; when it changes, the schema
 *  is (idempotently) re-applied even to a cached handle. */
const SCHEMA_KEY = `${SCHEMA}\n--migrations--\n${COLUMN_MIGRATIONS.map((m) => m.ddl).join("\n")}`;

export function getDb(): DatabaseSync {
  let db = g.__systedoDb;
  if (!db) {
    // The test runner spawns one process per test file, all sharing this file; it sets
    // SYSTEDO_DB_FILE to a per-process path so parallel suites don't contend on one db.
    const dbFile = process.env.SYSTEDO_DB_FILE || join(process.cwd(), ".data", "systedo.db");
    mkdirSync(dirname(dbFile), { recursive: true });
    db = new DatabaseSync(dbFile);
    db.exec("PRAGMA journal_mode = WAL;");
    // Wait briefly for a contended write instead of throwing SQLITE_BUSY at once.
    // node:sqlite is synchronous, and the cron sync, concurrent requests, the
    // rate-limit writer and the HMR schema re-apply can all touch the file at once;
    // 5s is generous for this low-write workload.
    db.exec("PRAGMA busy_timeout = 5000;");
    g.__systedoDb = db;
  }

  // Apply (or re-apply) the schema whenever its definition changes. All statements
  // are idempotent (CREATE … IF NOT EXISTS), so this is safe to run on an existing
  // handle — it just creates anything missing. This is what makes a dev server that
  // survived an HMR across a schema edit (new table/column) self-heal without a
  // restart, and a db file created before a table existed get it created.
  if (g.__systedoSchema !== SCHEMA_KEY) {
    db.exec(SCHEMA);
    for (const m of COLUMN_MIGRATIONS) {
      if (hasColumn(db, m.table, m.column)) continue; // fresh db already has it via CREATE
      try {
        db.exec(m.ddl);
      } catch {
        /* a concurrent process added it first — node:sqlite throws, which is fine */
      }
    }
    g.__systedoSchema = SCHEMA_KEY;
  }

  return db;
}
