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
// of opening a new handle every time this module is re-evaluated.
const g = globalThis as unknown as { __systedoDb?: DatabaseSync };

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

export function getDb(): DatabaseSync {
  if (g.__systedoDb) return g.__systedoDb;

  const dir = join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(join(dir, "systedo.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  // Additive migrations for databases created before a column existed — the
  // CREATE TABLE IF NOT EXISTS above won't add a column to an existing table.
  for (const stmt of ["ALTER TABLE reports ADD COLUMN input_hash TEXT"]) {
    try {
      db.exec(stmt);
    } catch {
      /* column already exists — node:sqlite throws, which is fine */
    }
  }

  g.__systedoDb = db;
  return db;
}
