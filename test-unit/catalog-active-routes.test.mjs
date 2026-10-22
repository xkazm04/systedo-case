/** The kind routes for plans and services (src/lib/catalog/load.ts, resolve.ts) and
 *  the local-page grounding. `toProducts` has always dropped a paused product at the
 *  adapter seam; the plan and service routes filtered on kind only, so the Katalog pause
 *  toggle did nothing for them: a paused plan's rivals still seeded the "vs" query slate,
 *  and a paused service still filled the service x locality coverage matrix and the
 *  location roster. The pause is one rule for every kind, applied where each route
 *  enters, so a consumer never sees an offering the user stopped selling. */
process.env.LOCAL_DB = "true";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-active-routes-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
register("./json-loader.mjs", import.meta.url);
mock.module("@/lib/session", {
  namedExports: { currentUserId: async () => "u-test", currentSession: async () => null },
});

const { loadPlansFor, loadServicesFor } = await import("@/lib/catalog/load");
const { isActivePlan, isActiveService } = await import("@/lib/catalog/offering");
const { saveOfferings } = await import("@/lib/catalog/store");
const { comparisonQueriesFromCatalog } = await import("@/lib/seo-compare/catalog");
const { targetsFromCatalog } = await import("@/lib/local/catalog");
const { buildLocalPageRequest } = await import("@/lib/local-signals/page-grounding");

const PROJECT = {
  id: "proj-active-routes",
  name: "Trasy",
  type: "leadgen",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const LOCALITIES = [{ id: "loc-a", name: "Brno" }];

const base = (over) => ({
  projectId: PROJECT.id, category: "Služby", nature: "local", price: 1000, currency: "CZK",
  channels: [], tags: [], source: "manual", updatedAt: "", ...over,
});
const plan = (id, name, active, rival) =>
  base({ kind: "plan", id, name, active, nature: "online", interval: "month",
    competitors: [{ name: rival }], differentiators: [] });
const service = (id, name, active) =>
  base({ kind: "service", id, name, active, priceModel: "from", serviceAreas: ["loc-a"] });

await saveOfferings("u-test", PROJECT.id, [
  plan("pl:live", "Live plan", true, "Rival Live"),
  plan("pl:paused", "Paused plan", false, "Rival Paused"),
  service("sv:live", "Live service", true),
  service("sv:paused", "Paused service", false),
]);

test("the plan route drops a paused plan, so its rivals seed no comparison query", async () => {
  const plans = await loadPlansFor(PROJECT);
  assert.deepEqual(plans.map((p) => p.id), ["pl:live"]);
  const queries = comparisonQueriesFromCatalog(PROJECT.name, plans).map((q) => q.query);
  assert.ok(queries.some((q) => q.includes("Rival Live")), "the live plan's rival is still compared");
  assert.ok(!queries.some((q) => q.includes("Rival Paused")), "a paused plan seeds nothing");
});

test("the service route drops a paused service from the coverage matrix", async () => {
  const services = await loadServicesFor(PROJECT);
  assert.deepEqual(services.map((s) => s.id), ["sv:live"]);
  const cells = targetsFromCatalog(services, LOCALITIES).map((t) => t.service);
  assert.deepEqual(cells, ["Live service"]);
});

test("a local page for a paused service is not grounded on the paused row", async () => {
  const live = await buildLocalPageRequest(PROJECT, "Live service", "Brno");
  assert.equal(live.request.priceModel, "from", "the live service still grounds price model");
  const paused = await buildLocalPageRequest(PROJECT, "Paused service", "Brno");
  assert.equal(paused.request.priceModel, undefined, "the paused row lends no catalog facts");
  assert.equal(paused.request.price, undefined);
});

test("the active predicates mirror isActiveProduct for the other two kinds", () => {
  assert.equal(isActivePlan(plan("a", "a", true, "r")), true);
  assert.equal(isActivePlan(plan("a", "a", false, "r")), false);
  assert.equal(isActivePlan(service("a", "a", true)), false);
  assert.equal(isActiveService(service("a", "a", true)), true);
  assert.equal(isActiveService(service("a", "a", false)), false);
  assert.equal(isActiveService(plan("a", "a", true, "r")), false);
});
