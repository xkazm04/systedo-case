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
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Survive Next.js dev hot-reload: keep a single connection on globalThis instead
// of opening a new handle every time this module is re-evaluated. We also remember
// which schema definition was last applied to that handle, so a handle that
// outlived an HMR across a schema change still picks up new tables/columns.
const g = globalThis as unknown as { __systedoDb?: DatabaseSync; __systedoSchema?: string };

/** Additive migrations for databases created before a column existed — a
 *  `CREATE TABLE IF NOT EXISTS` won't add a column to an already-existing table.
 *  Empty now that the campaign/report tables moved to Firestore. */
const MIGRATIONS: string[] = [];

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
    domain          TEXT,
    tenant          TEXT,
    ads_customer_id TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user
    ON projects (user_id, created_at);
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
