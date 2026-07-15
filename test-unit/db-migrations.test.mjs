/** Unit tests for the versioned SQLite migration runner (src/lib/db.ts):
 *  runMigrations against fresh / legacy-no-version / mid-version fixture DBs, and
 *  the non-additive table-rebuild recipe (rebuildTable). Uses in-memory handles so
 *  nothing touches the on-disk `.data/systedo.db` or contends on a file lock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { runMigrations, rebuildTable } from "@/lib/db";

const LATEST = 13;

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
  assert.deepEqual(ledger(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  // v1 base tables present… (incl. v7's lead_imports + v8's cron_sent_guard, also
  // created via v1's CREATE)
  for (const t of ["rate_limits", "users", "projects", "warehouse_connection", "byom_config", "lead_imports", "cron_sent_guard", "cron_runs", "inventory_plan", "finance_inputs", "twin_archive", "sklik_connection"]) {
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
  assert.deepEqual(ledger(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
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
  assert.deepEqual(ledger(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test("mid-version legacy db → missing additive columns are added, stamped to latest", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_BASE); // base tables but none of the v2..v6 columns, no ledger

  assert.equal(cols(db, "warehouse_connection").includes("config_json"), false);
  assert.equal(cols(db, "projects").includes("logo_url"), false);

  const version = runMigrations(db);

  assert.equal(version, LATEST);
  assert.deepEqual(ledger(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
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
  assert.deepEqual(ledger(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
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
