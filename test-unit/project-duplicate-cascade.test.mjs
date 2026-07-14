/** Direction 2 — duplicate a project as a template: the fan-out that copies a
 *  project's SETUP into a fresh, independent project. Seeds a source project across
 *  BOTH the copied SETUP stores and several EXPLICITLY-EXCLUDED operating stores in
 *  the sqlite backend, runs `duplicateProject`, and asserts:
 *   - every SETUP store is carried onto the new project (with catalog re-homed)
 *   - every EXCLUDED store is verifiably absent on the new project
 *   - the new project is INDEPENDENT (editing it never touches the source)
 *   - project fields: type + accent kept, domain/adsCustomerId/logoUrl cleared
 *  LOCAL_DB backend; the tenant-keyed report-config copier is a cloud-only no-op
 *  locally (it reports ok but writes nothing — no firebase-admin under LOCAL_DB). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), "systedo-duplicate-cascade-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { createProject, updateProject } = await import("@/lib/projects/store");
const { duplicateProject, PROJECT_STORE_COPIERS } = await import("@/lib/projects/duplicate-cascade");

// SETUP stores that MUST copy.
const { saveOfferings, listOfferings } = await import("@/lib/catalog/store");
const { starterCatalog } = await import("@/lib/catalog/starter");
const { saveCostModel, getCostModel } = await import("@/lib/cost-model/store");
const { saveCompetitors, getCompetitors } = await import("@/lib/competitors/store");
const { saveOrganicChannels, getOrganicChannels } = await import("@/lib/organic-channels/store");

// EXCLUDED operating stores that MUST NOT copy.
const { saveProjectState, getProjectState } = await import("@/lib/project-state/store");
const { recordAnnotation, listAnnotations } = await import("@/lib/annotations/store");
const { saveTwin, getTwin } = await import("@/lib/twin/store");
const { sampleTwin } = await import("@/lib/twin/sample");
const { saveConnection, getConnection } = await import("@/lib/inventory/connection-store");

const USER = "u-dup-1";
const NOW = "2026-06-01T00:00:00.000Z";

/** Seed a source project: SETUP stores (copied) + EXCLUDED operating stores. */
async function seedSource(userId, projectId) {
  // --- SETUP (must copy) ---
  await saveOfferings(userId, projectId, starterCatalog(projectId, "eshop", "online", NOW));
  await saveCostModel(projectId, {
    grossMarginPct: 0.5,
    monthlyOverhead: 12000,
    perOrderCost: 40,
    updatedAt: NOW,
  });
  await saveCompetitors(projectId, {
    competitors: [{ name: "Rival A", note: "levnější" }, { name: "Rival B" }],
    updatedAt: NOW,
  });
  await saveOrganicChannels(projectId, { statuses: { seo: "done", gbp: "active" }, updatedAt: NOW });
  // --- EXCLUDED (must NOT copy) ---
  await saveProjectState(userId, projectId, "content-schedule", { items: [1, 2, 3] });
  await recordAnnotation(projectId, { date: "2026-05-10", text: "spuštění kampaně" });
  await saveTwin(projectId, sampleTwin("eshop"));
  await saveConnection(userId, projectId, { provider: "shopify", connectedAt: NOW });
}

test("registration list has no dup names and covers the SETUP stores", () => {
  const names = PROJECT_STORE_COPIERS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, "no duplicate copier names");
  for (const n of ["catalog", "cost-model", "competitors", "organic-channels", "report-config"]) {
    assert.ok(names.includes(n), `SETUP store ${n} is not registered in PROJECT_STORE_COPIERS`);
  }
});

test("duplicate copies the SETUP stores and reports each outcome", async () => {
  const source = await createProject(USER, {
    name: "Klient A",
    type: "eshop",
    accentColor: "#123456",
    domain: "klient-a.cz",
  });
  // Give the source a domain + logo + Ads link that must NOT carry over.
  await updateProject(USER, source.id, { logoUrl: "https://x/logo.png", adsCustomerId: "111-222-3333" });
  await seedSource(USER, source.id);

  const result = await duplicateProject(USER, source.id, "Klient B");
  assert.ok(result, "duplicate returned a result");
  const dst = result.project;

  // Project fields: type + accent kept; domain / logo / Ads cleared.
  assert.notEqual(dst.id, source.id, "new project has a distinct id");
  assert.equal(dst.type, "eshop", "type kept");
  assert.equal(dst.accentColor, "#123456", "accent kept");
  assert.equal(dst.name, "Klient B", "new name applied");
  assert.equal(dst.domain, undefined, "domain cleared");
  assert.equal(dst.adsCustomerId, undefined, "Ads link cleared");
  assert.equal(dst.logoUrl, undefined, "logo cleared");

  // Every copier reported clean (report-config is a local no-op but still ok).
  assert.deepEqual(result.failed, []);
  for (const { name } of PROJECT_STORE_COPIERS) {
    assert.ok(result.copied.includes(name), `${name} not reported copied`);
  }

  // SETUP present on the new project.
  const dstOfferings = await listOfferings(USER, dst.id);
  assert.ok(dstOfferings && dstOfferings.length > 0, "catalog copied");
  // Catalog re-homed to the new project (ids + projectId point at the target).
  for (const o of dstOfferings) {
    assert.equal(o.projectId, dst.id, "offering re-homed to new project");
    assert.ok(o.id.startsWith(`${dst.id}:`), `offering id re-prefixed (${o.id})`);
  }
  assert.ok((await getCostModel(dst.id)) !== null, "cost model copied");
  const dstComp = await getCompetitors(dst.id);
  assert.equal(dstComp?.competitors.length, 2, "competitors copied");
  const dstOrg = await getOrganicChannels(dst.id);
  assert.equal(dstOrg?.statuses.seo, "done", "organic channels copied");
});

test("EXCLUDED operating stores are verifiably absent on the new project", async () => {
  const source = await createProject(USER, { name: "Src2", type: "eshop" });
  await seedSource(USER, source.id);

  const { project: dst } = await duplicateProject(USER, source.id, "Dst2");

  assert.equal(await getProjectState(USER, dst.id, "content-schedule"), null, "project-state NOT copied");
  assert.equal((await listAnnotations(dst.id)).length, 0, "annotations NOT copied");
  assert.equal(await getTwin(dst.id), null, "twin NOT copied");
  assert.equal(await getConnection(USER, dst.id), null, "warehouse connection NOT copied");

  // And the excluded stores are also NOT in the copied list (never registered).
  assert.ok(!dst || true);
  for (const n of ["twin", "annotations", "project-state", "warehouse-connection", "report-metrics"]) {
    assert.ok(
      !PROJECT_STORE_COPIERS.some((c) => c.name === n),
      `${n} must not be a registered copier`
    );
  }
});

test("the duplicate is fully independent — editing it never touches the source", async () => {
  const source = await createProject(USER, { name: "Origin", type: "eshop" });
  await seedSource(USER, source.id);
  const { project: dst } = await duplicateProject(USER, source.id, "Copy");

  // Mutate the duplicate's setup.
  await saveCostModel(dst.id, { grossMarginPct: 0.9, monthlyOverhead: 1, perOrderCost: 1, updatedAt: NOW });
  await saveCompetitors(dst.id, { competitors: [{ name: "Only-on-copy" }], updatedAt: NOW });

  // The source is unchanged.
  const srcCost = await getCostModel(source.id);
  assert.equal(srcCost?.grossMarginPct, 0.5, "source cost model untouched by copy edits");
  const srcComp = await getCompetitors(source.id);
  assert.equal(srcComp?.competitors.length, 2, "source competitors untouched");
  assert.ok(srcComp?.competitors.every((c) => c.name !== "Only-on-copy"), "no cross-contamination");
});

test("ownership — duplicating a project the user doesn't own returns null", async () => {
  const source = await createProject(USER, { name: "Mine", type: "eshop" });
  const result = await duplicateProject("someone-else", source.id, "Theirs");
  assert.equal(result, null, "cross-user duplicate refused");
});
