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

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (c) => c.name === column
  );
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) != null
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

  -- The Kanály module's organic (zero ad-spend) visibility plan: per-project tracked
  -- channel status (the checklist) + an optional pinned AI plan, as one {statuses,
  -- plan?} blob. Absent → the module runs on the seeded per-type sample with no
  -- statuses. See src/lib/organic-channels/.
  CREATE TABLE IF NOT EXISTS organic_channels (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Persisted AI diagnoses (LTV cohort + lead-source root-cause): per-project
  -- {items[], updatedAt} blob, each item carrying its kind, result payload,
  -- status lifecycle (new→acknowledged→resolved), created timestamp and the input
  -- digest it was computed from. Newest-first, capped per kind. Absent → no saved
  -- diagnoses yet (the panels render their idle hint). See src/lib/diagnoses/.
  CREATE TABLE IF NOT EXISTS diagnoses (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Persisted monthly recaps: per-project {items[], updatedAt} blob, each item a
  -- generated recap for a period (the result payload, the createdAt timestamp, the
  -- input hash it was computed from — for the stale marker — and the locale). The
  -- most report-like AI artifact used to regenerate on every visit; now it is a
  -- record with capped history (newest-first, capped per period). Absent → nothing
  -- generated yet (the narrative renders its idle hint). See src/lib/recaps/.
  CREATE TABLE IF NOT EXISTS recaps (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Per-project report annotations ("what happened here" client-authored business
  -- events pinned to a date), as one {items, updatedAt} blob. Absent → the report
  -- has no notes yet. Live datasets map these into the chart's event markers + the
  -- recap grounding (a demo dataset carries its own authored event calendar). See
  -- src/lib/annotations/.
  CREATE TABLE IF NOT EXISTS annotations (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Persisted landing-page experiments per project: one {items[], updatedAt} blob,
  -- each item an LpExperiment (cluster + control/challenger variants with visitors +
  -- signups + a status running|done). Absent → the module runs on the seeded
  -- per-project sample experiments (illustrative, never mined as account-proven). A
  -- REAL persisted experiment's significant winner IS mined as a live creative pattern
  -- (see patterns/extract.ts extractExperimentPatterns). See src/lib/lp-exp/.
  CREATE TABLE IF NOT EXISTS lp_experiments (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- The Twin module's communication double: the per-channel trained voice, the
  -- style facts it was trained on, the channel/autonomy config and the draft
  -- outbox, as one blob. Absent → the seeded per-type sample (an untrained twin
  -- with a generic register and an empty outbox). See src/lib/twin/.
  CREATE TABLE IF NOT EXISTS twin (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Imported CRM leads per project: one {items[], source, syncedAt, updatedAt} blob,
  -- each item a raw lead (source + stage + date + optional value/closeDate). Absent →
  -- the funnel runs on the seeded per-project sample (illustrative). Present → the
  -- funnel/velocity/alerts + AI grounding compute over the imported rows, honestly
  -- labelled live. See src/lib/lead-quality/ (import.ts aggregates → LeadSource shape).
  CREATE TABLE IF NOT EXISTS lead_imports (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- The Start module's onboarding state: the applied website-scan business profile
  -- + a couple of flags (scanApplied, dismissed), as one blob. Absent → a fresh
  -- project (nothing scanned yet); the connector checklist's per-step "done" is
  -- derived live from the real stores, never stored here. See src/lib/onboarding/.
  CREATE TABLE IF NOT EXISTS onboarding (
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

  -- Per-(tenant, kind) claim-first double-run guard for scheduled crons. The
  -- period column is the claimed window key (e.g. the digest's Monday-anchored ISO
  -- week); a claim is an UPSERT that only updates when the period CHANGES, so an
  -- already-sent window can't be re-sent by a manual re-fire. Mirrors the Firestore
  -- tenants/{tenant}/config/{kind} doc. See src/lib/cron/sent-guard.*.
  CREATE TABLE IF NOT EXISTS cron_sent_guard (
    tenant     TEXT NOT NULL,
    kind       TEXT NOT NULL,
    period     TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    PRIMARY KEY (tenant, kind)
  );
`;

/** One ordered, versioned schema change. `up` performs it; `applied` reports
 *  whether its effect is ALREADY present on the handle. `applied` is what lets a
 *  database that predates the `schema_version` ledger (or one a concurrent
 *  process just migrated) be stamped without re-running the DDL — the runner
 *  probes the real shape via PRAGMA/sqlite_master instead of trusting a version
 *  it never wrote. Keep this list append-only and contiguous from 1. */
type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
  applied: (db: DatabaseSync) => boolean;
};

/** The migration ledger. v1 is the whole base schema (all `CREATE … IF NOT
 *  EXISTS` above, still idempotent); v2..v6 are the additive columns that used to
 *  live in COLUMN_MIGRATIONS, re-expressed as ordered versions. A fresh database
 *  gets v1's CREATEs (which already include every later column), so v2..v6 detect
 *  their column as present and are stamped without a redundant ALTER.
 *
 *  Non-additive changes (a type change, rename, drop, PK change) have NO ALTER in
 *  SQLite — use the table-rebuild recipe in `rebuildTable` below as the `up` of a
 *  new version, with an `applied` probe of the post-rebuild shape. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "base schema (20 tables + projects index)",
    up: (db) => db.exec(SCHEMA),
    // rate_limits is the always-on table; its presence means the base schema ran.
    applied: (db) => tableExists(db, "rate_limits"),
  },
  {
    version: 2,
    name: "warehouse_connection.config_json (generic ERP adapter config)",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN config_json TEXT"),
    applied: (db) => hasColumn(db, "warehouse_connection", "config_json"),
  },
  {
    version: 3,
    name: "warehouse_connection.last_error (sync-health tracking)",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN last_error TEXT"),
    applied: (db) => hasColumn(db, "warehouse_connection", "last_error"),
  },
  {
    version: 4,
    name: "warehouse_connection.last_error_at",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN last_error_at TEXT"),
    applied: (db) => hasColumn(db, "warehouse_connection", "last_error_at"),
  },
  {
    version: 5,
    name: "warehouse_connection.fail_count",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN fail_count INTEGER"),
    applied: (db) => hasColumn(db, "warehouse_connection", "fail_count"),
  },
  {
    version: 6,
    name: "projects.logo_url (client branding for reports)",
    up: (db) => db.exec("ALTER TABLE projects ADD COLUMN logo_url TEXT"),
    applied: (db) => hasColumn(db, "projects", "logo_url"),
  },
  {
    version: 7,
    name: "lead_imports (imported CRM leads → live funnel)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS lead_imports (
          project_id TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ),
    applied: (db) => tableExists(db, "lead_imports"),
  },
  {
    version: 8,
    name: "cron_sent_guard (claim-first double-run guard for scheduled crons)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS cron_sent_guard (
          tenant     TEXT NOT NULL,
          kind       TEXT NOT NULL,
          period     TEXT NOT NULL,
          claimed_at TEXT NOT NULL,
          PRIMARY KEY (tenant, kind)
        )`
      ),
    applied: (db) => tableExists(db, "cron_sent_guard"),
  },
];

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** The `schema_version` ledger: one row per applied migration. */
const VERSION_TABLE = `CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}

/** Errors we tolerate when applying a migration: another process (parallel test
 *  workers, the cron, a concurrent request, an HMR re-apply) won the same race and
 *  already applied it. Anything else is a real schema bug and must surface. */
function isBenignMigrationError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return msg.includes("duplicate column name") || msg.includes("already exists");
}

/** Versioned migration runner. Idempotent and concurrency-tolerant:
 *   - the `schema_version` ledger is authoritative for versions it records;
 *   - a version not in the ledger whose effect is already present (a legacy
 *     pre-ledger db, or a racing process) is stamped WITHOUT re-running its DDL;
 *   - otherwise the DDL runs, and a benign "already applied" race is tolerated
 *     while any other failure throws LOUD (surfaced in dev, never swallowed).
 *  Returns the version the db is at afterward. Exported for unit tests. */
export function runMigrations(db: DatabaseSync): number {
  db.exec(VERSION_TABLE);
  const recorded = currentVersion(db);

  for (const m of MIGRATIONS) {
    if (m.version <= recorded) continue; // ledger already covers this version

    if (m.applied(db)) {
      // Effect present but unrecorded → legacy db (created before the ledger) or a
      // concurrent process just applied it. Stamp the ledger to match reality.
      stamp(db, m);
      continue;
    }

    try {
      m.up(db);
    } catch (err) {
      // A racing process may have applied it between our probe and our DDL.
      if (m.applied(db) || isBenignMigrationError(err)) {
        stamp(db, m);
        continue;
      }
      console.error(
        `[db] migration v${m.version} (${m.name}) FAILED — schema is inconsistent:`,
        err
      );
      throw err;
    }
    stamp(db, m);
  }

  return currentVersion(db);
}

function stamp(db: DatabaseSync, m: Migration): void {
  // OR IGNORE: a concurrent process may have stamped this version already.
  db.prepare(
    "INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)"
  ).run(m.version, m.name, new Date().toISOString());
}

/** Non-additive schema change recipe. SQLite cannot ALTER a column's type, rename
 *  a PK, or (pre-3.35) drop a column, so the portable path is: create the new
 *  table, copy the data across, drop the old, rename the new into place. This
 *  helper runs that sequence as one transaction, following the safe order in
 *  https://www.sqlite.org/lang_altertable.html#otheralter (FK enforcement off for
 *  the swap, an integrity check before commit). It is the executable form of the
 *  recipe — a future non-additive `Migration.up` calls it, e.g.:
 *
 *    up: (db) => rebuildTable(db, {
 *      table: "projects",
 *      // must create `${table}__new`:
 *      newTableSql: `CREATE TABLE projects__new ( ... accent_color TEXT ... )`,
 *      copySql: `INSERT INTO projects__new (id, user_id, ...)
 *                SELECT id, user_id, ... FROM projects`,
 *      indexes: [`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id, created_at)`],
 *    })
 */
export function rebuildTable(
  db: DatabaseSync,
  opts: { table: string; newTableSql: string; copySql: string; indexes?: string[] }
): void {
  const { table, newTableSql, copySql, indexes = [] } = opts;
  const tmp = `${table}__new`;
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN;");
    db.exec(newTableSql); // creates `${table}__new`
    db.exec(copySql); // INSERT INTO `${table}__new` ... SELECT ... FROM `${table}`
    db.exec(`DROP TABLE "${table}";`);
    db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}";`);
    for (const idx of indexes) db.exec(idx);
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(
        `foreign_key_check failed after rebuilding ${table}: ${JSON.stringify(violations)}`
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* no active transaction to roll back */
    }
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/** Marker identifying the current schema definition; when it changes across an
 *  HMR (a schema edit adds a table/column/version), the runner re-runs even on a
 *  cached handle so a long-lived dev server self-heals without a restart. */
const SCHEMA_KEY = `${SCHEMA}\n--v${LATEST_VERSION}--\n${MIGRATIONS.map(
  (m) => `${m.version}:${m.name}`
).join("\n")}`;

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
    // Enforce declared foreign keys (off by default per-connection in SQLite). The
    // current 18-table schema declares none, so this is forward-looking hygiene; it
    // must be set here because rebuildTable toggles it and PRAGMAs are per-connection.
    db.exec("PRAGMA foreign_keys = ON;");
    g.__systedoDb = db;
  }

  // Run the versioned migrations whenever the schema definition changed since we
  // last applied it to this cached handle. runMigrations is itself idempotent, so
  // this is safe on an existing handle — it just brings the ledger and shape up to
  // date (new tables via v1's IF NOT EXISTS, new columns via later versions).
  if (g.__systedoSchema !== SCHEMA_KEY) {
    runMigrations(db);
    g.__systedoSchema = SCHEMA_KEY;
  }

  return db;
}
