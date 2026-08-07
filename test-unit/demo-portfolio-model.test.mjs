/** Direction: demo portfolio computed once. The public /dashboard portfolio must be
 *  (a) byte-identical to the store-resolver computation it replaced, (b) memoized for
 *  all-demo project lists, and (c) never short-circuited or cached for anything
 *  involving a REAL tenant id. Runs on the LOCAL sqlite store (empty per-pid db =
 *  exactly what a never-persisted demo id resolves to in every environment). */
process.env.LOCAL_DB = "true";
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { DEMO_PROJECTS } = await import("@/lib/demo/projects");
const {
  getPortfolioModel,
  demoLocalRecsInput,
  demoSeoQueries,
  resolveLocalRecsInput,
  resolveSeoQueries,
} = await import("@/components/app/overview/portfolio-model");
const { collectRecommendations } = await import("@/lib/insights/aggregate");
const { byImpact } = await import("@/lib/insights/types");
const { getProjectDataset } = await import("@/lib/project-data/dataset");
const { totalsOf, bucketize } = await import("@/lib/metrics");
const { hasSyncedMetrics } = await import("@/lib/report-metrics/store");
const { isDemoProjectId } = await import("@/lib/projects/demo");
const { ALL_SAMPLE } = await import("@/lib/insights/aggregate");
const { resolveCoverage, resolveLocalLadder, resolvePacks, resolveReviews } = await import(
  "@/lib/local-signals/resolve"
);
const { localitiesFor, servicesFor, plansFor } = await import("@/lib/catalog/resolve");
const { targetsFromCatalog } = await import("@/lib/local/catalog");
const { targetsForProject } = await import("@/lib/local/sample");
const { keywordLadder } = await import("@/lib/mappack/sample");
const { reviewsForProject } = await import("@/lib/reviews/sample");
const { comparisonQueriesFromCatalog } = await import("@/lib/seo-compare/catalog");
const { SAMPLE_QUERIES } = await import("@/lib/seo-compare/sample");
const { getCompetitors } = await import("@/lib/competitors/store");
const { curatedCompetitors } = await import("@/lib/competitors/types");

/** The pre-extraction ProjectOverview portfolio computation, verbatim: resolver-based
 *  local inputs + SEO slates + synced flags (demo ids short-circuit only the synced
 *  read, as the pill did), rows, then the re-keyed impact-ranked combined feed. */
async function legacyPortfolioModel(projects, locale) {
  const syncedById = new Map(
    await Promise.all(
      projects.map(async (p) => [p.id, isDemoProjectId(p.id) ? false : await hasSyncedMetrics(p.id)])
    )
  );
  const rows = projects.map((p) => {
    const data = getProjectDataset(p);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      accentColor: p.accentColor,
      domain: p.domain,
      live: syncedById.get(p.id) ?? false,
      totals: totalsOf(data.daily.slice(-30)),
      revenueSpark: bucketize(data.daily.slice(-365), "month").map((b) => b.revenue),
    };
  });
  const localInputs = new Map(
    await Promise.all(projects.map(async (p) => [p.id, await resolveLocalRecsInput(p)]))
  );
  const seoQueries = new Map(
    await Promise.all(projects.map(async (p) => [p.id, await resolveSeoQueries(p)]))
  );
  const combined = projects
    .flatMap((p) =>
      collectRecommendations(p, locale, localInputs.get(p.id), seoQueries.get(p.id), syncedById.get(p.id) ?? false).map(
        (r) => ({ ...r, id: `${p.id}:${r.id}`, projectId: p.id, projectName: p.name, projectAccent: p.accentColor })
      )
    )
    .sort(byImpact);
  return { rows, combined };
}

const demoLocal = DEMO_PROJECTS.find((p) => p.type === "local");
const demoApp = DEMO_PROJECTS.find((p) => p.type === "app");

test("pure demo builders ≡ the real store-resolver computation on an empty store", async () => {
  // Reconstruct what the resolver path computes for a never-persisted id, using the
  // REAL local-signals resolvers against the (empty) LOCAL store — the exact state a
  // demo id resolves to in every environment (persist-guard forbids writing one).
  const p = demoLocal;
  const localities = localitiesFor(p);
  const services = servicesFor(p); // == loadServicesFor's demo branch (seed catalog)
  const seedTargets =
    services.length > 0 ? targetsFromCatalog(services, localities) : targetsForProject(p);
  const [cov, lad, rev, packs] = await Promise.all([
    resolveCoverage(p.id, seedTargets),
    resolveLocalLadder(p.id, keywordLadder(p, localities, services)),
    resolveReviews(p.id, reviewsForProject(p, localities)),
    resolvePacks(p.id, []),
  ]);
  assert.deepEqual(demoLocalRecsInput(p), {
    targets: cov.targets,
    ladder: lad.ladder,
    reviews: rev.reviews,
    live: { coverage: cov.live, ladder: lad.live, reviews: rev.live, pack: packs.live },
  });
  assert.deepEqual(demoLocalRecsInput(p).live, ALL_SAMPLE, "empty store → every seam sample");

  // SEO slate: seed plans + the (empty) competitor store, exactly as the tenant path.
  const stored = curatedCompetitors((await getCompetitors(demoApp.id))?.competitors).map((c) => c.name);
  const generated = comparisonQueriesFromCatalog(demoApp.name, plansFor(demoApp), stored);
  assert.deepEqual(demoSeoQueries(demoApp), generated.length > 0 ? generated : SAMPLE_QUERIES);

  // The exported resolvers short-circuit demo ids to the same pure result.
  assert.deepEqual(await resolveLocalRecsInput(p), demoLocalRecsInput(p));
  assert.deepEqual(await resolveSeoQueries(demoApp), demoSeoQueries(demoApp));
  // Non-matching types stay null on both paths.
  assert.equal(demoLocalRecsInput(demoApp), null);
  assert.equal(demoSeoQueries(demoLocal), null);
});

test("the demo portfolio model is byte-identical to the legacy per-request computation", async () => {
  for (const locale of ["cs", "en"]) {
    const legacy = await legacyPortfolioModel(DEMO_PROJECTS, locale);
    const model = await getPortfolioModel(DEMO_PROJECTS, locale);
    assert.equal(
      JSON.stringify(model),
      JSON.stringify(legacy),
      `serialized ${locale} view-model must not change`
    );
  }
});

test("all-demo lists are memoized per (locale, id-list); locales don't collide", async () => {
  const a = await getPortfolioModel(DEMO_PROJECTS, "cs");
  const b = await getPortfolioModel(DEMO_PROJECTS, "cs");
  assert.equal(a, b, "second request reuses the SAME computed model");
  const en = await getPortfolioModel(DEMO_PROJECTS, "en");
  assert.notEqual(a, en, "a different locale is a different model");
});

test("a list containing a REAL tenant id is never memoized (fresh objects per call)", async () => {
  // A content-type tenant: its rec inputs resolve to null on type alone, so the test
  // exercises the store path (hasSyncedMetrics) without needing the auth session
  // chain that catalog/load would lazily pull for a local/app tenant.
  const tenant = {
    ...demoLocal,
    id: "11111111-2222-4333-8444-555555555555",
    name: "Tenant",
    type: "content",
  };
  const list = [...DEMO_PROJECTS, tenant];
  const a = await getPortfolioModel(list, "cs");
  const b = await getPortfolioModel(list, "cs");
  assert.notEqual(a, b, "tenant-bearing lists recompute per request");
  assert.deepEqual(a, b, "…deterministically, on the empty store");
  // The tenant row went through the store path (nothing synced → not live) and its
  // recs derive from the resolver fallbacks, not the demo short-circuit cache.
  const row = a.rows.find((r) => r.id === tenant.id);
  assert.ok(row && row.live === false);
});
