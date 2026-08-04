/** Nothing outlives its project — the integrity sweep + the durable orphan ledger.
 *
 *  The deletion cascade is best-effort and non-atomic: the `projects` doc is removed
 *  regardless of `cascade.failed.length`, so once a store failed, its data was
 *  unreachable — nothing could re-target that projectId again except a human reading
 *  the old id out of an audit-log detail string. This pins the replacement: a durable
 *  per-user ledger of what is still dirty, and a sweep that REPORTS before it deletes,
 *  is derived from the cascade's own registry, and is safe to run twice.
 *
 *  LOCAL_DB backend against a throwaway db file, driving the REAL stores. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), `systedo-orphan-sweep-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { createProject, deleteProject, getProject } = await import("@/lib/projects/store");
const { PROJECT_STORE_DELETERS, projectCleanupUnits, runProjectCleanup, TENANT_DATA_UNIT } =
  await import("@/lib/projects/delete-cascade");
const {
  ORPHAN_LEDGER_CAP,
  ORPHAN_LEDGER_SCOPE,
  emptyLedger,
  forgetOrphan,
  ledgerRecords,
  readOrphanLedger,
  recordOrphan,
  upsertOrphan,
} = await import("@/lib/projects/orphan-ledger");
const { sweepProjectOrphans } = await import("@/lib/projects/orphan-sweep");
const { saveProjectState, getProjectState } = await import("@/lib/project-state/store");
const { saveReportMetrics, getReportMetrics } = await import("@/lib/report-metrics/store");

const U = "u-orphan";
const T0 = new Date("2026-08-01T00:00:00.000Z");
const T1 = new Date("2026-08-02T00:00:00.000Z");

const metrics = () => ({ meta: { syncedAt: T0.toISOString() }, rows: [] });

async function seedProjectData(projectId) {
  await saveProjectState(U, projectId, "reviews", { answered: ["r1"] });
  await saveReportMetrics(projectId, metrics());
}

async function projectDataPresent(projectId) {
  const state = await getProjectState(U, projectId, "reviews");
  const rm = await getReportMetrics(projectId);
  return { state: state !== null, metrics: rm !== null };
}

// ---------------------------------------------------------------------------
// The work list comes from the cascade's registry, never a second list
// ---------------------------------------------------------------------------

test("the sweep's cleanup units ARE the cascade's registry (plus the tenant scrub)", () => {
  assert.deepEqual(projectCleanupUnits(), [
    ...PROJECT_STORE_DELETERS.map((d) => d.name),
    TENANT_DATA_UNIT,
  ]);
  assert.ok(PROJECT_STORE_DELETERS.length >= 19, "the registry is the full set");
});

test("runProjectCleanup narrows to the named units and ignores unknown ones", async () => {
  const p = await createProject(U, { name: "Narrow", type: "eshop" });
  await seedProjectData(p.id);

  const res = await runProjectCleanup(U, p.id, ["project-state", "no-such-store"]);
  assert.deepEqual(res.cleaned, ["project-state"], "only the named, known unit ran");
  assert.deepEqual(res.failed, []);

  const after = await projectDataPresent(p.id);
  assert.equal(after.state, false, "the named store was cleaned");
  assert.equal(after.metrics, true, "an un-named store was left alone");
});

// ---------------------------------------------------------------------------
// The ledger's pure transitions
// ---------------------------------------------------------------------------

test("upsertOrphan: records, then MERGES a resumed attempt", () => {
  const first = upsertOrphan(null, { projectId: "p1", projectName: "Klient", pending: ["catalog", "twin"] }, T0);
  assert.equal(first.records.length, 1);
  assert.deepEqual(first.records[0].pending, ["catalog", "twin"]);
  assert.equal(first.records[0].attempts, 1);
  assert.equal(first.records[0].firstSeenAt, T0.toISOString());

  const second = upsertOrphan(first, { projectId: "p1", pending: ["twin"] }, T1);
  assert.equal(second.records.length, 1, "the same project is one record, not two");
  assert.deepEqual(second.records[0].pending, ["twin"], "only what is STILL dirty");
  assert.equal(second.records[0].attempts, 2);
  assert.equal(second.records[0].firstSeenAt, T0.toISOString(), "the original failure time is kept");
  assert.equal(second.records[0].projectName, "Klient", "the name survives a nameless retry");
});

test("upsertOrphan: an empty pending set RESOLVES the record (→ a second run is a no-op)", () => {
  const led = upsertOrphan(null, { projectId: "p1", pending: ["twin"] }, T0);
  assert.deepEqual(upsertOrphan(led, { projectId: "p1", pending: [] }, T1).records, []);
});

test("the ledger is bounded and forgettable", () => {
  let led = emptyLedger(T0);
  for (let i = 0; i < ORPHAN_LEDGER_CAP + 5; i++) {
    led = upsertOrphan(led, { projectId: `p${i}`, pending: ["twin"] }, T0);
  }
  assert.equal(led.records.length, ORPHAN_LEDGER_CAP);
  assert.equal(ledgerRecords(forgetOrphan(led, led.records[0].projectId, T1)).length, ORPHAN_LEDGER_CAP - 1);
  assert.deepEqual(ledgerRecords(null), [], "a never-written ledger reads as empty");
});

test("the ledger persists under a RESERVED scope no project can own", async () => {
  await recordOrphan(U, { projectId: "p-ghost", projectName: "Duch", pending: ["twin"] });
  const led = await readOrphanLedger(U);
  assert.equal(ledgerRecords(led).length, 1);
  assert.match(ORPHAN_LEDGER_SCOPE, /^__/, "not an id any generator can produce");
  // …and it is NOT reachable as a project, so no cascade can delete the evidence.
  assert.equal(await getProject(U, ORPHAN_LEDGER_SCOPE), null);
  await recordOrphan(U, { projectId: "p-ghost", pending: [] }); // clean up for later tests
  assert.deepEqual(ledgerRecords(await readOrphanLedger(U)), []);
});

// ---------------------------------------------------------------------------
// The sweep, end to end
// ---------------------------------------------------------------------------

test("a failed cascade becomes a REPORT first — the sweep deletes nothing by looking", async () => {
  const p = await createProject(U, { name: "Ztracený", type: "eshop" });
  await seedProjectData(p.id);
  // Simulate the exact bad state: the cascade failed for two stores, the project doc
  // was removed anyway (which is what the route does), and the id survived only here.
  await recordOrphan(U, {
    projectId: p.id,
    projectName: p.name,
    pending: ["project-state", "report-metrics"],
    lastError: "backend unavailable",
  });
  await deleteProject(U, p.id);

  const report = await sweepProjectOrphans(U);
  assert.equal(report.applied, false);
  assert.equal(report.orphanCount, 1);
  const found = report.findings.find((f) => f.projectId === p.id);
  assert.equal(found.status, "orphaned");
  assert.equal(found.projectName, "Ztracený", "the name the audit string used to hold");
  assert.deepEqual(found.pending, ["project-state", "report-metrics"]);
  assert.equal(found.source, "ledger");

  const still = await projectDataPresent(p.id);
  assert.deepEqual(still, { state: true, metrics: true }, "a REPORT removes nothing");
});

test("apply finishes the cleanup, clears the ledger, and is safe to run twice", async () => {
  const before = await sweepProjectOrphans(U);
  const target = before.findings.find((f) => f.status === "orphaned");
  assert.ok(target, "the previous test left an orphan to clean");

  const applied = await sweepProjectOrphans(U, { apply: true });
  assert.equal(applied.applied, true);
  const done = applied.findings.find((f) => f.projectId === target.projectId);
  assert.deepEqual(done.stillFailing, [], "every pending unit cleaned");
  assert.deepEqual(done.cleaned.sort(), ["project-state", "report-metrics"]);

  assert.deepEqual(await projectDataPresent(target.projectId), { state: false, metrics: false });
  assert.deepEqual(ledgerRecords(await readOrphanLedger(U)), [], "the resolved record is dropped");

  // Run it again: nothing to find, nothing to do, no throw.
  const second = await sweepProjectOrphans(U, { apply: true });
  assert.equal(second.checked, 0);
  assert.equal(second.orphanCount, 0);
});

test("a candidate whose project STILL EXISTS is reported alive, never scrubbed", async () => {
  const p = await createProject(U, { name: "Živý", type: "eshop" });
  await seedProjectData(p.id);
  // A stale ledger entry for a project that is (still) there — the dangerous case.
  await recordOrphan(U, { projectId: p.id, projectName: "starý název", pending: ["project-state"] });

  const report = await sweepProjectOrphans(U);
  const found = report.findings.find((f) => f.projectId === p.id);
  assert.equal(found.status, "alive");
  assert.equal(found.projectName, "Živý", "reported under the LIVE name, not the stale one");
  assert.equal(report.orphanCount, 0);

  await sweepProjectOrphans(U, { apply: true });
  assert.deepEqual(
    await projectDataPresent(p.id),
    { state: true, metrics: true },
    "a live project's data is never touched by the sweep"
  );
  assert.deepEqual(ledgerRecords(await readOrphanLedger(U)), [], "…and the stale record is dropped");

  await deleteProject(U, p.id);
});

test("a PRE-LEDGER orphan can be swept from a supplied id — after an existence check", async () => {
  const ghost = await createProject(U, { name: "Prastarý", type: "eshop" });
  await seedProjectData(ghost.id);
  await deleteProject(U, ghost.id); // deleted before the ledger existed → no record

  const live = await createProject(U, { name: "Nedotknutelný", type: "eshop" });
  await seedProjectData(live.id);

  // Report first: the dead id is orphaned with EVERY registry unit pending; the live
  // id (a plausible operator typo) is reported alive and cannot be scrubbed.
  const report = await sweepProjectOrphans(U, { projectIds: [ghost.id, live.id] });
  const dead = report.findings.find((f) => f.projectId === ghost.id);
  assert.equal(dead.status, "orphaned");
  assert.equal(dead.source, "supplied");
  assert.deepEqual(dead.pending, projectCleanupUnits(), "no known-dirty subset → assume all");
  assert.equal(report.findings.find((f) => f.projectId === live.id).status, "alive");

  await sweepProjectOrphans(U, { apply: true, projectIds: [ghost.id, live.id] });
  assert.deepEqual(await projectDataPresent(ghost.id), { state: false, metrics: false });
  assert.deepEqual(await projectDataPresent(live.id), { state: true, metrics: true });
  assert.deepEqual(ledgerRecords(await readOrphanLedger(U)), [], "a supplied id leaves no residue");

  await deleteProject(U, live.id);
});
