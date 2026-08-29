/** Unit tests for the versioned SQLite migration runner (src/lib/db.ts):
 *  runMigrations against fresh / legacy-no-version / mid-version fixture DBs, and
 *  the non-additive table-rebuild recipe (rebuildTable). Uses in-memory handles so
 *  nothing touches the on-disk `.data/systedo.db` or contends on a file lock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { runMigrations, rebuildTable, MIGRATION_VERSIONS } from "@/lib/db";

const LATEST = 22;

test("MIGRATIONS versions are unique + contiguous from 1 (the header's contract)", () => {
  const v = [...MIGRATION_VERSIONS];
  assert.equal(new Set(v).size, v.length, "versions must be unique");
  assert.deepEqual(v, [...v].sort((a, b) => a - b), "versions must be ascending");
  assert.deepEqual(
    v,
    Array.from({ length: v.length }, (_, i) => i + 1),
    "versions must be contiguous from 1 (no skipped version)"
  );
  assert.equal(v[v.length - 1], LATEST);
});

const cols = (db, table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

const ledger = (db) =>
  db.prepare("SELECT version FROM schema_version ORDER BY version").all().map((r) => r.version);

/** The pre-ledger base schema, as an OLD deployment created it: no schema_version
 *  table, and warehouse_connection / projects still missing the additive columns. */
const OLD_BASE = `
  CREATE TABLE rate_limits (
    bucket TEXT NOT NULL, ip TEXT NOT NULL, window_start INTEGER NOT NULL,
    count INTEGER NOT NULL, PRIMARY KEY (bucket, ip)
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    accent_color TEXT NOT NULL, domain TEXT, tenant TEXT, ads_customer_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE warehouse_connection (
    user_id TEXT NOT NULL, project_id TEXT NOT NULL, provider TEXT NOT NULL,
    inventory_id TEXT, token_enc TEXT, connected_at TEXT NOT NULL, last_sync_at TEXT,
    PRIMARY KEY (user_id, project_id)
  );
`;

test("fresh db → all migrations applied, ledger stamped to latest, full shape", () => {
  const db = new DatabaseSync(":memory:");
  const version = runMigrations(db);

  assert.equal(version, LATEST);
  assert.deepEqual(ledger(db), Array.from({ length: LATEST }, (_, i) => i + 1));
  // v1 base tables present… (incl. v7's lead_imports + v8's cron_sent_guard, also
  // created via v1's CREATE)
  for (const t of ["rate_limits", "users", "projects", "warehouse_connection", "byom_config", "lead_imports", "cron_sent_guard", "cron_runs", "inventory_plan", "finance_inputs", "twin_archive", "project_goal", "sklik_connection", "ai_response_cache", "campaign_docs", "tenant_docs"]) {
    assert.ok(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t),
      `${t} should exist`
    );
  }
  // …and the additive columns from v2..v6 are all there (via v1's CREATE shape).
  assert.ok(cols(db, "warehouse_connection").includes("config_json"));
  assert.ok(cols(db, "warehouse_connection").includes("fail_count"));
  assert.ok(cols(db, "projects").includes("logo_url"));
});

test("fresh db → running twice is a no-op (idempotent, no duplicate ledger rows)", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db);
  const version = runMigrations(db);
  assert.equal(version, LATEST);
  assert.deepEqual(ledger(db), Array.from({ length: LATEST }, (_, i) => i + 1));
});

test("legacy no-version db (already fully migrated) → detected + stamped, no re-ALTER", () => {
  const db = new DatabaseSync(":memory:");
  // Simulate a legacy db the OLD code kept fully migrated: full current shape, but
  // no schema_version ledger.
  db.exec(OLD_BASE);
  db.exec("ALTER TABLE warehouse_connection ADD COLUMN config_json TEXT");
  db.exec("ALTER TABLE warehouse_connection ADD COLUMN last_error TEXT");
  db.exec("ALTER TABLE warehouse_connection ADD COLUMN last_error_at TEXT");
  db.exec("ALTER TABLE warehouse_connection ADD COLUMN fail_count INTEGER");
  db.exec("ALTER TABLE projects ADD COLUMN logo_url TEXT");

  const version = runMigrations(db);

  // Every version is detected as already-applied and stamped WITHOUT throwing a
  // duplicate-column error.
  assert.equal(version, LATEST);
  assert.deepEqual(ledger(db), Array.from({ length: LATEST }, (_, i) => i + 1));
});

test("mid-version legacy db → missing additive columns are added, stamped to latest", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_BASE); // base tables but none of the v2..v6 columns, no ledger

  assert.equal(cols(db, "warehouse_connection").includes("config_json"), false);
  assert.equal(cols(db, "projects").includes("logo_url"), false);

  const version = runMigrations(db);

  assert.equal(version, LATEST);
  assert.deepEqual(ledger(db), Array.from({ length: LATEST }, (_, i) => i + 1));
  assert.ok(cols(db, "warehouse_connection").includes("config_json"));
  assert.ok(cols(db, "warehouse_connection").includes("last_error"));
  assert.ok(cols(db, "warehouse_connection").includes("last_error_at"));
  assert.ok(cols(db, "warehouse_connection").includes("fail_count"));
  assert.ok(cols(db, "projects").includes("logo_url"));
});

test("partially-recorded ledger → only the unrecorded tail runs", () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db);
  // Wind the ledger back to v3 as if only the first three ever ran.
  db.exec("DELETE FROM schema_version WHERE version > 3");
  assert.deepEqual(ledger(db), [1, 2, 3]);

  const version = runMigrations(db);
  assert.equal(version, LATEST);
  assert.deepEqual(ledger(db), Array.from({ length: LATEST }, (_, i) => i + 1));
});

/** The set of user tables on a handle (excluding SQLite internals + the ledger). */
const tableSet = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)
    .filter((n) => n !== "schema_version")
    .sort();

/** The set of named indexes on a handle. `sql IS NOT NULL` drops the implicit
 *  indexes SQLite creates for PRIMARY KEY / UNIQUE, which are a consequence of the
 *  column set (already compared) rather than an independently-declared object. */
const indexSet = (db) =>
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
    )
    .all()
    .map((r) => r.name)
    .sort();

/** One table's columns as an ORDER-INSENSITIVE set of normalized descriptors.
 *
 *  Order-insensitive on purpose, and this is the whole reason the comparison is a
 *  set rather than a list: `ALTER TABLE ADD COLUMN` can only APPEND, while SCHEMA
 *  declares columns wherever they read best. `projects.logo_url` (v2) and
 *  `warehouse_connection.config_json` (v6) therefore sit mid-table on a fresh db and
 *  last on a migrated one. That fork is legitimate and permanent — comparing
 *  ordinals would fail the build forever on a difference no query can observe
 *  (node:sqlite returns name-keyed rows, and the repo has zero positional
 *  `INSERT INTO t VALUES (...)` statements). What a query CAN observe — a column
 *  that is missing, differently typed, differently defaulted, or no longer part of
 *  the primary key — is exactly what this descriptor captures. */
const columnSet = (db, table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value ?? ""}:${c.pk}`)
    .sort();

/** A v1-era database, frozen as it looked when the schema_version ledger was
 *  introduced: every base table that has NO dedicated table-adding migration.
 *  warehouse_connection / projects deliberately omit the v2..v6 additive columns
 *  so those column migrations still run. Any table added ONLY to SCHEMA after this
 *  point (no matching Migration) will appear in a fresh db but NOT here — which is
 *  the split-brain the diff below guards. Do not add later tables here. */
const V1_ERA_BASE = `
  CREATE TABLE rate_limits (bucket TEXT NOT NULL, ip TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (bucket, ip));
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT, created_at TEXT NOT NULL);
  CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, accent_color TEXT NOT NULL, domain TEXT, tenant TEXT, ads_customer_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE project_catalog (user_id TEXT NOT NULL, project_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, project_id));
  CREATE TABLE project_state (user_id TEXT NOT NULL, project_id TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, project_id, key));
  CREATE TABLE report_metrics (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE local_signals (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE cost_model (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE competitors (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE organic_channels (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE diagnoses (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE recaps (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE annotations (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE lp_experiments (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE twin (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE onboarding (project_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE warehouse_connection (user_id TEXT NOT NULL, project_id TEXT NOT NULL, provider TEXT NOT NULL, inventory_id TEXT, token_enc TEXT, connected_at TEXT NOT NULL, last_sync_at TEXT, PRIMARY KEY (user_id, project_id));
  CREATE TABLE byom_config (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

test("no SCHEMA/MIGRATIONS split-brain: a pre-existing (v1-stamped) db reaches the full table set", () => {
  // A fresh db: v1 runs SCHEMA, so it holds every table the code expects.
  const fresh = new DatabaseSync(":memory:");
  runMigrations(fresh);

  // A v1-era db: it never re-runs v1 (rate_limits already present → v1 stamped
  // without SCHEMA), so it can ONLY gain later tables through their own migration.
  const legacy = new DatabaseSync(":memory:");
  legacy.exec(V1_ERA_BASE);
  runMigrations(legacy);

  // If someone adds a table to SCHEMA without a matching MIGRATIONS entry, `fresh`
  // gains it while `legacy` (and every real production db) does not — this diff fails.
  assert.deepEqual(
    tableSet(legacy),
    tableSet(fresh),
    "a table added only to SCHEMA never reaches existing databases — add an append-only Migration too"
  );

  // Same split-brain, one level down. Until 2026-08-29 this test compared table
  // names ONLY, so it stayed green while idx_projects_user existed on fresh
  // databases and on no migrated one — the hub's hot path silently table-scanning
  // for every pre-existing install. An index is as invisible to a table-name diff
  // as a whole table is to no diff at all.
  assert.deepEqual(
    indexSet(legacy),
    indexSet(fresh),
    "an index added only to SCHEMA never reaches existing databases — add an append-only Migration too"
  );

  // And one level down again: a column added to SCHEMA without an ALTER migration.
  // Compared per table as an unordered set — see columnSet for why ordinals are
  // deliberately NOT compared.
  for (const table of tableSet(fresh)) {
    assert.deepEqual(
      columnSet(legacy, table),
      columnSet(fresh, table),
      `${table}: a column added only to SCHEMA never reaches existing databases — add an append-only ALTER migration too`
    );
  }
});

test("rebuildTable: create-new/copy/drop/rename preserves data (the non-additive recipe)", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE widget (id TEXT PRIMARY KEY, qty INTEGER NOT NULL);");
  db.prepare("INSERT INTO widget (id, qty) VALUES (?, ?)").run("a", 3);
  db.prepare("INSERT INTO widget (id, qty) VALUES (?, ?)").run("b", 7);

  // Rebuild to rename qty → quantity and change its declared type.
  rebuildTable(db, {
    table: "widget",
    newTableSql: "CREATE TABLE widget__new (id TEXT PRIMARY KEY, quantity TEXT NOT NULL);",
    copySql: "INSERT INTO widget__new (id, quantity) SELECT id, qty FROM widget;",
    indexes: ["CREATE INDEX IF NOT EXISTS idx_widget_qty ON widget (quantity);"],
  });

  assert.deepEqual(cols(db, "widget"), ["id", "quantity"]);
  const rows = db
    .prepare("SELECT id, quantity FROM widget ORDER BY id")
    .all()
    .map((r) => ({ id: r.id, quantity: r.quantity }));
  assert.deepEqual(rows, [
    { id: "a", quantity: "3" },
    { id: "b", quantity: "7" },
  ]);
  // FK enforcement is restored after the swap.
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});
