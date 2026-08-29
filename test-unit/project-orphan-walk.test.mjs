/** The DEPENDENT-side orphan walk (spec docs/specs/2026-08-30-orphan-dependent-walk.md).
 *
 *  The parent-first sweep builds its candidates from the ledger + supplied ids, so an
 *  orphan whose failed delete predates the ledger AND whose id nobody kept was
 *  invisible forever. This pins the other direction: enumerate the dependent stores
 *  themselves (schema-derived, never a second hand list), ask "does your owner still
 *  exist", report before deleting, delete only via the registry-derived sweep, and
 *  surface as residue whatever no registry unit owns.
 *
 *  LOCAL_DB backend against a throwaway db file, driving the REAL stores. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), `systedo-orphan-walk-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { createProject, deleteProject } = await import("@/lib/projects/store");
const { walkDependentStores } = await import("@/lib/projects/orphan-walk");
const { ledgerRecords, readOrphanLedger } = await import("@/lib/projects/orphan-ledger");
const { saveProjectState, getProjectState } = await import("@/lib/project-state/store");
const { saveReportMetrics, getReportMetrics } = await import("@/lib/report-metrics/store");
const { buildTenantKey } = await import("@/lib/campaigns/store-keys");
const { getDb } = await import("@/lib/db");

const U = "u-walk";

const metrics = () => ({ meta: { syncedAt: "2026-08-01T00:00:00.000Z" }, rows: [] });

async function seedProjectData(projectId) {
  await saveProjectState(U, projectId, "reviews", { answered: ["r1"] }); // Family B
  await saveReportMetrics(projectId, metrics()); // Family A (no user column)
  // A tenant-keyed twin row — the store class the cascade once missed entirely.
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO campaign_docs (tenant, collection, doc_id, data, period, updated_at)
       VALUES (?, 'campaigns', 'c1', '{}', NULL, ?)`
    )
    .run(buildTenantKey(U, projectId), new Date().toISOString());
}

const findingFor = (report, projectId) => report.findings.find((f) => f.projectId === projectId);

// ---------------------------------------------------------------------------
// Direction: the walk finds what the parent-first sweep structurally cannot
// ---------------------------------------------------------------------------

test("a PRE-LEDGER orphan (no ledger record, id kept nowhere) is found by walking the dependent side", async () => {
  const p = await createProject(U, { name: "Zapomenutý", type: "eshop" });
  await seedProjectData(p.id);
  // The exact bad state: the project row vanishes with NO cascade and NO ledger
  // entry — the failure mode from before the ledger existed. The id survives only
  // inside the dependent stores themselves.
  await deleteProject(U, p.id);
  assert.deepEqual(ledgerRecords(await readOrphanLedger(U)), [], "nothing recorded anywhere");

  const report = await walkDependentStores(U);
  const f = findingFor(report, p.id);
  assert.ok(f, "the dependent-side walk still finds it");
  assert.equal(f.status, "orphaned");
  for (const table of ["project_state", "report_metrics", "campaign_docs"]) {
    assert.ok(f.seenIn.includes(table), `${table} is enumerated (schema-derived work list)`);
  }
  assert.ok(f.ownerUserIds.includes(U), "attributed via user-carrying sightings");

  // REPORT-FIRST: looking removed nothing.
  assert.equal(report.applied, false);
  assert.notEqual(await getReportMetrics(p.id), null, "report mode deletes nothing");
  assert.notEqual(await getProjectState(U, p.id, "reviews"), null);

  // …and APPLY finishes the delete through the registry-derived sweep.
  const applied = await walkDependentStores(U, { apply: true });
  const af = findingFor(applied, p.id);
  assert.equal(af.status, "orphaned");
  assert.deepEqual(af.residue, [], "every sighting was owned by a registry unit");
  assert.equal(await getReportMetrics(p.id), null, "Family A cleaned");
  assert.equal(await getProjectState(U, p.id, "reviews"), null, "Family B cleaned");
  assert.equal(
    getDb().prepare("SELECT COUNT(*) AS n FROM campaign_docs WHERE tenant = ?").get(buildTenantKey(U, p.id)).n,
    0,
    "tenant-keyed twin cleaned"
  );
  assert.deepEqual(ledgerRecords(await readOrphanLedger(U)), [], "nothing left pending");

  // IDEMPOTENT: a second walk has no sighting left to report.
  const again = await walkDependentStores(U, { apply: true });
  assert.equal(findingFor(again, p.id), undefined, "a second run finds nothing left");
});

// ---------------------------------------------------------------------------
// Existence check: alive means untouchable
// ---------------------------------------------------------------------------

test("an ALIVE project's data is reported alive and never touched, even in apply mode", async () => {
  const p = await createProject(U, { name: "Živý", type: "eshop" });
  await seedProjectData(p.id);

  const applied = await walkDependentStores(U, { apply: true });
  const f = findingFor(applied, p.id);
  assert.equal(f.status, "alive");
  assert.notEqual(await getReportMetrics(p.id), null, "alive → nothing deleted");
  assert.notEqual(await getProjectState(U, p.id, "reviews"), null);
});

// ---------------------------------------------------------------------------
// Skip rules: fixtures and reserved scopes are not candidates
// ---------------------------------------------------------------------------

test("demo ids and reserved __ scopes are never candidates", async () => {
  await saveReportMetrics("demo-eshop", metrics());
  await saveProjectState(U, "__fake_scope", "reviews", { x: 1 });

  const report = await walkDependentStores(U);
  assert.equal(findingFor(report, "demo-eshop"), undefined, "demo fixture skipped");
  assert.equal(findingFor(report, "__fake_scope"), undefined, "reserved scope skipped");
  assert.notEqual(await getReportMetrics("demo-eshop"), null);

  // hygiene for the other tests
  getDb().prepare("DELETE FROM report_metrics WHERE project_id = 'demo-eshop'").run();
  getDb().prepare("DELETE FROM project_state WHERE project_id = '__fake_scope'").run();
});

// ---------------------------------------------------------------------------
// Residue: an unregistered store is exposed, never silently converged over
// ---------------------------------------------------------------------------

test("data in a project-keyed table NO registry unit owns surfaces as residue", async () => {
  const db = getDb();
  db.exec(
    `CREATE TABLE IF NOT EXISTS walk_test_stash (
       project_id TEXT PRIMARY KEY,
       data       TEXT NOT NULL
     )`
  );
  const p = await createProject(U, { name: "Se skrýší", type: "eshop" });
  await seedProjectData(p.id);
  db.prepare("INSERT OR REPLACE INTO walk_test_stash (project_id, data) VALUES (?, '{}')").run(p.id);
  await deleteProject(U, p.id);

  const report = await walkDependentStores(U);
  assert.ok(
    findingFor(report, p.id).seenIn.includes("walk_test_stash"),
    "the schema-derived walk sees a table the deleter registry does not know"
  );

  const applied = await walkDependentStores(U, { apply: true });
  const f = findingFor(applied, p.id);
  assert.deepEqual(f.residue, ["walk_test_stash"], "the registry gap is reported, not hidden");
  assert.equal(await getReportMetrics(p.id), null, "registered stores were still cleaned");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM walk_test_stash WHERE project_id = ?").get(p.id).n,
    1,
    "the walk itself never deletes — there is exactly one delete path"
  );

  // Stable on repeat: same residue, nothing else to do.
  const again = await walkDependentStores(U, { apply: true });
  assert.deepEqual(findingFor(again, p.id).residue, ["walk_test_stash"]);
});
