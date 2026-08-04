/** Direction 1 — project-deletion cascade: the fan-out that scrubs EVERY per-project
 *  store when a workspace is deleted.
 *
 *  The fixture is a TABLE with one entry per REGISTERED store (both families:
 *  project-scoped Family A + per-(user,project) Family B), each knowing how to seed
 *  itself and how to answer "is my row still there?". The table's names are asserted
 *  to equal `PROJECT_STORE_DELETERS` EXACTLY — so a store added to the registry
 *  without a fixture entry fails here rather than shipping a subset-only proof (the
 *  gap that let four stores stay unregistered: this test used to seed 7 of 15).
 *
 *  On top of the stores it covers the tenant scrub, which is NO LONGER a local no-op:
 *  `campaign_docs` and `tenant_docs` are tenant-keyed generic doc twins that no store
 *  deleter owns, so they are seeded (base tenant AND an account-scoped one) and
 *  asserted gone too. LOCAL_DB backend throughout. */
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
const { buildTenantKey } = await import("@/lib/campaigns/store-keys");

// store getters/setters we seed + verify with — one import per registered store
const { saveProjectState, getProjectState } = await import("@/lib/project-state/store");
const { saveOfferings, listOfferings } = await import("@/lib/catalog/store");
const { starterCatalog } = await import("@/lib/catalog/starter");
const { recordAnnotation, listAnnotations } = await import("@/lib/annotations/store");
const { saveConnection, getConnection } = await import("@/lib/inventory/connection-store");
const { saveTwin, getTwin } = await import("@/lib/twin/store");
const { sampleTwin } = await import("@/lib/twin/sample");
const { saveCostModel, getCostModel } = await import("@/lib/cost-model/store");
const { saveOrganicChannels, getOrganicChannels } = await import("@/lib/organic-channels/store");
const { saveReportMetrics, getReportMetrics } = await import("@/lib/report-metrics/store");
const { saveLocalSignals, getLocalSignals } = await import("@/lib/local-signals/store");
const { saveCompetitors, getCompetitors } = await import("@/lib/competitors/store");
const { saveDiagnoses, getDiagnoses } = await import("@/lib/diagnoses/store");
const { saveRecaps, getRecaps } = await import("@/lib/recaps/store");
const { saveExperiments, getExperiments } = await import("@/lib/lp-exp/store");
const { saveLeadImports, getLeadImports } = await import("@/lib/lead-quality/store");
const { saveOnboarding, getOnboarding } = await import("@/lib/onboarding/store");
const { archiveDrafts, listArchivedDrafts } = await import("@/lib/twin/archive-store");
const { saveProjectGoal, getProjectGoal } = await import("@/lib/goals/store");
const { saveInventoryPlanState, getInventoryPlanState } = await import("@/lib/inventory/plan-store");
const { saveFinanceInputs, getFinanceInputs } = await import("@/lib/profit/finance-inputs/store");

// the two tenant-keyed generic doc twins the tenant scrub owns (no store deleter does)
const { localTenantStore } = await import("@/lib/campaigns/store/local-docs");
const { localTenantDocs } = await import("@/lib/tenant-docs/local");

const USER = "u-cascade-1";
const NOW = "2026-06-01T00:00:00.000Z";
const CUSTOMER = "123-456-7890";

/** One registered store's fixture: how to seed it, and how to see if it's still there.
 *  `name` MUST match the store's id in PROJECT_STORE_DELETERS (asserted below). */
const STORE_FIXTURES = [
  {
    name: "report-metrics",
    seed: (u, p) => saveReportMetrics(p, { period: "30d", syncedAt: NOW, rows: [] }),
    present: async (u, p) => (await getReportMetrics(p)) !== null,
  },
  {
    name: "local-signals",
    seed: (u, p) => saveLocalSignals(p, { updatedAt: NOW, ranks: [], reviews: [] }),
    present: async (u, p) => (await getLocalSignals(p)) !== null,
  },
  {
    name: "cost-model",
    seed: (u, p) =>
      saveCostModel(p, { grossMarginPct: 0.5, monthlyOverhead: 10000, perOrderCost: 50, updatedAt: NOW }),
    present: async (u, p) => (await getCostModel(p)) !== null,
  },
  {
    name: "competitors",
    seed: (u, p) => saveCompetitors(p, { competitors: [{ id: "c1", name: "Rival" }], updatedAt: NOW }),
    present: async (u, p) => (await getCompetitors(p)) !== null,
  },
  {
    name: "organic-channels",
    seed: (u, p) => saveOrganicChannels(p, { statuses: { seo: "done" }, updatedAt: NOW }),
    present: async (u, p) => (await getOrganicChannels(p)) !== null,
  },
  {
    name: "diagnoses",
    seed: (u, p) => saveDiagnoses(p, { diagnoses: [], updatedAt: NOW }),
    present: async (u, p) => (await getDiagnoses(p)) !== null,
  },
  {
    name: "recaps",
    seed: (u, p) => saveRecaps(p, { recaps: [], updatedAt: NOW }),
    present: async (u, p) => (await getRecaps(p)) !== null,
  },
  {
    name: "annotations",
    seed: (u, p) => recordAnnotation(p, { date: "2026-05-10", text: "spuštění kampaně" }),
    present: async (u, p) => (await listAnnotations(p)).length > 0,
  },
  {
    name: "lp-experiments",
    seed: (u, p) => saveExperiments(p, { experiments: [], updatedAt: NOW }),
    present: async (u, p) => (await getExperiments(p)) !== null,
  },
  {
    name: "twin",
    seed: (u, p) => saveTwin(p, sampleTwin("eshop")),
    present: async (u, p) => (await getTwin(p)) !== null,
  },
  {
    name: "twin-archive",
    seed: (u, p) =>
      archiveDrafts(p, [
        { id: "d1", channel: "email", status: "sent", createdAt: NOW, sentAt: NOW, body: "ahoj" },
      ]),
    present: async (u, p) => (await listArchivedDrafts(p)).length > 0,
  },
  {
    name: "project-goal",
    seed: (u, p) => saveProjectGoal(p, { goal: 500000, history: [{ month: "2026-06", goal: 500000 }] }),
    present: async (u, p) => (await getProjectGoal(p)) !== null,
  },
  {
    name: "inventory-plan",
    seed: (u, p) =>
      saveInventoryPlanState(p, {
        plan: { moves: [], states: {}, digest: "d", createdAt: NOW },
        stockAlerts: {},
        updatedAt: NOW,
      }),
    present: async (u, p) => (await getInventoryPlanState(p)) !== null,
  },
  {
    name: "finance-inputs",
    seed: (u, p) =>
      saveFinanceInputs(p, { channelMargins: [], scenarios: [], realNumbers: {}, updatedAt: NOW }),
    present: async (u, p) => (await getFinanceInputs(p)) !== null,
  },
  {
    name: "lead-imports",
    seed: (u, p) => saveLeadImports(p, { leads: [], updatedAt: NOW }),
    present: async (u, p) => (await getLeadImports(p)) !== null,
  },
  {
    name: "onboarding",
    seed: (u, p) => saveOnboarding(p, { steps: {}, updatedAt: NOW }),
    present: async (u, p) => (await getOnboarding(p)) !== null,
  },
  {
    name: "catalog",
    seed: (u, p) => saveOfferings(u, p, starterCatalog(p, "eshop", "online", NOW)),
    present: async (u, p) => (await listOfferings(u, p)) !== null,
  },
  {
    name: "project-state",
    seed: (u, p) => saveProjectState(u, p, "content-schedule", { items: [1, 2, 3] }),
    present: async (u, p) => (await getProjectState(u, p, "content-schedule")) !== null,
  },
  {
    name: "warehouse-connection",
    seed: (u, p) => saveConnection(u, p, { provider: "shopify", connectedAt: NOW }),
    present: async (u, p) => (await getConnection(u, p)) !== null,
  },
];

/** Seed the two tenant-keyed doc twins under BOTH tenant key shapes a project writes
 *  under — the account-agnostic base and an account-scoped `{base}_{customerId}`. */
async function seedTenantDocs(userId, projectId) {
  for (const tenant of [
    buildTenantKey(userId, projectId),
    buildTenantKey(userId, projectId, CUSTOMER),
  ]) {
    await localTenantStore.setRoot(tenant, { activePeriod: "30d" }, { merge: false });
    await localTenantStore.setDoc(tenant, "campaigns", "30d_c1", { period: "30d", name: "Brand" });
    await localTenantStore.setDoc(tenant, "reports", "2026-06", { period: "2026-06" });
    await localTenantDocs.setDoc(tenant, "keywordLists", "k1", { name: "Seznam", createdAt: NOW });
    await localTenantDocs.setDoc(tenant, "social_posts", "s1", { body: "post", createdAt: NOW });
  }
}

/** Is ANY tenant-doc row left for the project (either table, either key shape)? */
async function tenantDocsPresent(userId, projectId) {
  for (const tenant of [
    buildTenantKey(userId, projectId),
    buildTenantKey(userId, projectId, CUSTOMER),
  ]) {
    if ((await localTenantStore.getRoot(tenant)) !== undefined) return true;
    if ((await localTenantStore.getDoc(tenant, "campaigns", "30d_c1")) !== undefined) return true;
    if ((await localTenantStore.getDoc(tenant, "reports", "2026-06")) !== undefined) return true;
    if ((await localTenantDocs.listDocs(tenant, "keywordLists")).length > 0) return true;
    if ((await localTenantDocs.listDocs(tenant, "social_posts")).length > 0) return true;
  }
  return false;
}

async function seed(userId, projectId) {
  for (const f of STORE_FIXTURES) await f.seed(userId, projectId);
  await seedTenantDocs(userId, projectId);
}

/** Assert EVERY seeded row for a project is present (true) or gone (false). */
async function assertPresence(userId, projectId, present) {
  for (const f of STORE_FIXTURES) {
    assert.equal(await f.present(userId, projectId), present, `${f.name} presence !== ${present}`);
  }
  assert.equal(await tenantDocsPresent(userId, projectId), present, `tenant docs !== ${present}`);
}

test("the fixture covers EVERY registered store — no subset proof", () => {
  const registered = PROJECT_STORE_DELETERS.map((d) => d.name);
  // No dup names — each is the id the DELETE response + this test assert on.
  assert.equal(new Set(registered).size, registered.length);
  // Set equality, not "includes": a store added to the registry without a fixture
  // entry (or a fixture for a store nobody registered) fails right here.
  assert.deepEqual(
    [...STORE_FIXTURES.map((f) => f.name)].sort(),
    [...registered].sort(),
    "STORE_FIXTURES and PROJECT_STORE_DELETERS disagree — every registered store must be seeded + asserted"
  );
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
  assert.ok(result.cleaned.includes("tenant-data"), "tenant scrub not reported");
  assert.equal(result.outcomes.length, PROJECT_STORE_DELETERS.length + 1);
});

test("cascade never over-reaches — a sibling project's data survives", async () => {
  const a = await createProject(USER, { name: "A", type: "eshop" });
  const b = await createProject(USER, { name: "B", type: "eshop" });
  await seed(USER, a.id);
  await seed(USER, b.id);

  await deleteProjectCascade(USER, a.id);

  await assertPresence(USER, a.id, false);
  await assertPresence(USER, b.id, true); // untouched — incl. the tenant prefix sweep
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
