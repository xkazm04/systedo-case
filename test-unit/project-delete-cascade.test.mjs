/** Direction 1 — project-deletion cascade: the fan-out that scrubs EVERY per-project
 *  store when a workspace is deleted. Seeds a project across both store families
 *  (project-scoped Family A + per-(user,project) Family B) in the sqlite backend,
 *  runs `deleteProjectCascade`, and asserts every row is gone, the registration list
 *  is complete + reported, and a SECOND project's data is left untouched (the delete
 *  never over-reaches). LOCAL_DB backend; the tenant-firestore step is a no-op locally
 *  (that data lives in the per-domain tables the cascade already cleared). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Some seeded stores transitively import @/data JSON — register the JSON hook.
register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), "systedo-delete-cascade-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { createProject } = await import("@/lib/projects/store");
const { deleteProjectCascade, PROJECT_STORE_DELETERS } = await import("@/lib/projects/delete-cascade");

// store getters/setters we seed + verify with
const { saveProjectState, getProjectState } = await import("@/lib/project-state/store");
const { saveOfferings, listOfferings } = await import("@/lib/catalog/store");
const { starterCatalog } = await import("@/lib/catalog/starter");
const { recordAnnotation, listAnnotations } = await import("@/lib/annotations/store");
const { saveConnection, getConnection } = await import("@/lib/inventory/connection-store");
const { saveTwin, getTwin } = await import("@/lib/twin/store");
const { sampleTwin } = await import("@/lib/twin/sample");
const { saveCostModel, getCostModel } = await import("@/lib/cost-model/store");
const { saveOrganicChannels, getOrganicChannels } = await import("@/lib/organic-channels/store");

const USER = "u-cascade-1";
const NOW = "2026-06-01T00:00:00.000Z";

/** Seed one project across six representative stores (both families). */
async function seed(userId, projectId) {
  await saveProjectState(userId, projectId, "content-schedule", { items: [1, 2, 3] });
  await saveOfferings(userId, projectId, starterCatalog(projectId, "eshop", "online", NOW));
  await recordAnnotation(projectId, { date: "2026-05-10", text: "spuštění kampaně" });
  await saveConnection(userId, projectId, { provider: "shopify", connectedAt: NOW });
  await saveTwin(projectId, sampleTwin("eshop"));
  await saveCostModel(projectId, {
    grossMarginPct: 0.5,
    monthlyOverhead: 10000,
    perOrderCost: 50,
    updatedAt: NOW,
  });
  await saveOrganicChannels(projectId, { statuses: { seo: "done" }, updatedAt: NOW });
}

/** Assert all seeded rows for a project are present (true) or gone (false). */
async function assertPresence(userId, projectId, present) {
  assert.equal((await getProjectState(userId, projectId, "content-schedule")) !== null, present);
  assert.equal((await listOfferings(userId, projectId)) !== null, present);
  assert.equal((await listAnnotations(projectId)).length > 0, present);
  assert.equal((await getConnection(userId, projectId)) !== null, present);
  assert.equal((await getTwin(projectId)) !== null, present);
  assert.equal((await getCostModel(projectId)) !== null, present);
  assert.equal((await getOrganicChannels(projectId)) !== null, present);
}

test("registration list covers every store family (the one obvious add-a-store point)", () => {
  const names = PROJECT_STORE_DELETERS.map((d) => d.name);
  // No dup names — each is the id the DELETE response + this test assert on.
  assert.equal(new Set(names).size, names.length);
  // The stores this fixture seeds must all be registered, or their rows would leak.
  for (const n of [
    "project-state",
    "catalog",
    "annotations",
    "warehouse-connection",
    "twin",
    "cost-model",
    "organic-channels",
  ]) {
    assert.ok(names.includes(n), `store ${n} is not registered in PROJECT_STORE_DELETERS`);
  }
});

test("cascade scrubs every seeded store + reports each outcome", async () => {
  const project = await createProject(USER, { name: "Doomed", type: "eshop" });
  await seed(USER, project.id);
  await assertPresence(USER, project.id, true);

  const result = await deleteProjectCascade(USER, project.id);

  // Every seeded row is gone.
  await assertPresence(USER, project.id, false);

  // Every registered store + the tenant scrub reported clean; nothing failed.
  assert.deepEqual(result.failed, []);
  for (const { name } of PROJECT_STORE_DELETERS) {
    assert.ok(result.cleaned.includes(name), `${name} not reported cleaned`);
  }
  assert.ok(result.cleaned.includes("tenant-firestore"), "tenant scrub not reported");
  assert.equal(result.outcomes.length, PROJECT_STORE_DELETERS.length + 1);
});

test("cascade never over-reaches — a sibling project's data survives", async () => {
  const a = await createProject(USER, { name: "A", type: "eshop" });
  const b = await createProject(USER, { name: "B", type: "eshop" });
  await seed(USER, a.id);
  await seed(USER, b.id);

  await deleteProjectCascade(USER, a.id);

  await assertPresence(USER, a.id, false);
  await assertPresence(USER, b.id, true); // untouched
});

test("one store throwing never aborts the rest (best-effort isolation)", async () => {
  // A registered deleter that always throws is quarantined into `failed` while every
  // other store still deletes — proven by injecting a poison entry over the real list.
  const project = await createProject(USER, { name: "Partial", type: "eshop" });
  await seed(USER, project.id);

  const poison = { name: "poison-store", delete: async () => { throw new Error("boom"); } };
  PROJECT_STORE_DELETERS.push(poison);
  try {
    const result = await deleteProjectCascade(USER, project.id);
    assert.ok(result.failed.some((f) => f.name === "poison-store" && /boom/.test(f.error)));
    // The real stores still got scrubbed despite the poison entry.
    await assertPresence(USER, project.id, false);
  } finally {
    PROJECT_STORE_DELETERS.pop();
  }
});
