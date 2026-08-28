/** The Overview's cross-project portfolio VIEW-MODEL, extracted from
 *  ProjectOverview so the computation has one owner and the public /dashboard's
 *  fully deterministic demo portfolio can be computed ONCE instead of on every
 *  request.
 *
 *  Two seams, both keyed strictly off `isDemoProjectId` (the one demo-ness seam —
 *  never a parallel prefix test):
 *   1. STORE SHORT-CIRCUIT — a demo fixture id is never persisted (persist-guard),
 *      so its store reads (local signals ×4, catalog plans, competitors, organic
 *      channels, synced metrics) always come back empty and every resolver falls through to its
 *      sample. The demo builders below construct those exact sample inputs purely,
 *      skipping the round-trips; the resolver path proves the equivalence in
 *      test-unit/demo-portfolio-model.test.mjs.
 *   2. MEMO — when EVERY project in the list is a demo fixture, the finished model
 *      is memoized at module level per (locale, id-list). The fixtures carry fixed
 *      timestamps (DEMO_TS; nothing reads Date.now on this path) and every input is
 *      seeded-deterministic, so the model can never go stale. Cache-Components
 *      compatible: no dynamic APIs, no force-dynamic. A list containing ANY real
 *      tenant id never touches the memo and always re-resolves its stores.
 *
 *  Server-only (the tenant path reads stores). */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import { isDemoProjectId } from "@/lib/projects/demo";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { bucketize, totalsOf } from "@/lib/metrics";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import {
  ALL_SAMPLE,
  collectRecommendations,
  type ChannelRecsInput,
  type LocalRecsInput,
} from "@/lib/insights/aggregate";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { resolveOrganicChannels } from "@/lib/organic-channels/resolve";
import { byImpact, type Recommendation } from "@/lib/insights/types";
import { SAMPLE_QUERIES, type CompareQuery } from "@/lib/seo-compare/sample";
import { comparisonQueriesFromCatalog } from "@/lib/seo-compare/catalog";
import { getCompetitors } from "@/lib/competitors/store";
import { curatedCompetitors } from "@/lib/competitors/types";
import { targetsForProject } from "@/lib/local/sample";
import { targetsFromCatalog } from "@/lib/local/catalog";
import { keywordLadder } from "@/lib/mappack/sample";
import { reviewsForProject } from "@/lib/reviews/sample";
import {
  resolveCoverage,
  resolveLocalLadder,
  resolvePacks,
  resolveReviews,
} from "@/lib/local-signals/resolve";
import { localitiesFor, plansFor, servicesFor } from "@/lib/catalog/resolve";
import type { CompareRow } from "./compare";

/** A recommendation tagged with the project it belongs to (for the combined feed). */
export type PortfolioRec = Recommendation & {
  projectId: string;
  projectName: string;
  projectAccent: string;
};

export interface PortfolioModel {
  rows: CompareRow[];
  /** cross-project recs, re-keyed per project and ranked by impact */
  combined: PortfolioRec[];
}

/* ------------------------------------------------------- tenant resolvers */

/** Resolve a `local` project's Overview rec signals the same way lokalni/page.tsx
 *  does — coverage targets (catalog-seeded, with imported page-presence overlaid),
 *  and the ladder + reviews live-over-sample — so the aggregator's local recs read
 *  the project's real data, not the HVAC sample. Null for non-local projects.
 *  Server-only I/O kept out of the pure aggregator; all four seams read through the
 *  ONE request-memoized local-signals blob (signalsForRequest), so this is a single
 *  store read per project per request. Also returns each seam's provenance (`live`)
 *  so the feed can disclose seeded signals. */
export async function resolveLocalRecsInput(project: Project): Promise<LocalRecsInput | null> {
  if (project.type !== "local") return null;
  // Demo fixture ids resolve at the seam: never persisted (persist-guard), so every
  // store read below would come back empty and each resolver would return exactly the
  // sample it was passed — the pure builder constructs that result without the I/O.
  if (isDemoProjectId(project.id)) return demoLocalRecsInput(project);
  // Lazy: catalog/load pulls the auth session chain, which only the tenant path needs.
  const { loadServicesFor } = await import("@/lib/catalog/load");
  const localities = localitiesFor(project);
  const services = await loadServicesFor(project);
  const seedTargets =
    services.length > 0 ? targetsFromCatalog(services, localities) : targetsForProject(project);
  const [resolvedCoverage, resolvedLadder, resolvedReviews, resolvedPacks] = await Promise.all([
    resolveCoverage(project.id, seedTargets),
    resolveLocalLadder(project.id, keywordLadder(project, localities, services)),
    resolveReviews(project.id, reviewsForProject(project, localities)),
    // No pack-derived recommendation yet, so only the PROVENANCE is consumed here —
    // an empty sample keeps this a flag read, not a pack computation.
    resolvePacks(project.id, []),
  ]);
  return {
    targets: resolvedCoverage.targets,
    ladder: resolvedLadder.ladder,
    reviews: resolvedReviews.reviews,
    live: {
      coverage: resolvedCoverage.live,
      ladder: resolvedLadder.live,
      reviews: resolvedReviews.live,
      pack: resolvedPacks.live,
    },
  };
}

/** Resolve an `app` project's comparison-query slate the same way srovnani-seo/page.tsx
 *  does — catalog-generated from the brand + CURATED plan competitors when the catalog
 *  has plans, else the sample set. Null for non-app projects (the aggregator then keeps
 *  its SAMPLE_QUERIES default). */
export async function resolveSeoQueries(project: Project): Promise<CompareQuery[] | null> {
  if (project.type !== "app") return null;
  // Same seam as resolveLocalRecsInput: a demo id's stores are provably empty.
  if (isDemoProjectId(project.id)) return demoSeoQueries(project);
  const { loadPlansFor } = await import("@/lib/catalog/load");
  const [plans, competitorSet] = await Promise.all([
    loadPlansFor(project),
    getCompetitors(project.id),
  ]);
  const storedCompetitors = curatedCompetitors(competitorSet?.competitors).map((c) => c.name);
  const generated = comparisonQueriesFromCatalog(project.name, plans, storedCompetitors);
  return generated.length > 0 ? generated : SAMPLE_QUERIES;
}

/** Resolve the project's ACTIVE organic-channel plan the same way `/kanaly` does —
 *  `resolveOrganicChannels`, which returns the pinned AI plan when the tenant has
 *  one and the seeded sample otherwise, with the tracked lifecycle merged in. The
 *  Overview's "Kanál zdarma" rec used to compute off the seed unconditionally, so
 *  it recommended a channel the tenant's own pinned plan might not even contain.
 *
 *  Runs for every project type (unlike the local/SEO resolvers): the Kanály module
 *  is available to all five. `degraded` needs no branch here — resolveOrganicChannels
 *  already answers a failed read with the sample AND `source: "sample"`, so the rec
 *  falls back to the seed and keeps its sample badge, which is the honest outcome. */
export async function resolveChannelRecsInput(project: Project): Promise<ChannelRecsInput> {
  // Same seam as the resolvers above: a demo fixture id is never persisted, so its
  // store read is provably empty and the resolver returns exactly the passed sample.
  if (isDemoProjectId(project.id)) return demoChannelRecsInput(project);
  const resolved = await resolveOrganicChannels(project.id, channelPlanForProject(project));
  return { channels: resolved.channels, tracks: resolved.tracks, source: resolved.source };
}

/* ------------------------------------------------ pure demo counterparts */

/** What {@link resolveChannelRecsInput} provably returns for a DEMO fixture id — an
 *  empty store means no pinned plan and no tracked lifecycle, so the seeded plan is
 *  the active plan. Pure (no I/O). */
export function demoChannelRecsInput(project: Project): ChannelRecsInput {
  return { channels: channelPlanForProject(project), tracks: {}, source: "sample" };
}


/** What {@link resolveLocalRecsInput} provably returns for a DEMO fixture id — the
 *  stores hold nothing for a never-persisted id, so every resolver falls through to
 *  the sample it was passed, with every seam's liveness false. Pure (no I/O). */
export function demoLocalRecsInput(project: Project): LocalRecsInput | null {
  if (project.type !== "local") return null;
  const localities = localitiesFor(project);
  const services = servicesFor(project);
  const targets =
    services.length > 0 ? targetsFromCatalog(services, localities) : targetsForProject(project);
  return {
    targets,
    ladder: keywordLadder(project, localities, services),
    reviews: reviewsForProject(project, localities),
    live: ALL_SAMPLE,
  };
}

/** What {@link resolveSeoQueries} provably returns for a DEMO fixture id — the demo
 *  catalog seed's plans, no stored competitors. Pure (no I/O). */
export function demoSeoQueries(project: Project): CompareQuery[] | null {
  if (project.type !== "app") return null;
  const generated = comparisonQueriesFromCatalog(project.name, plansFor(project), []);
  return generated.length > 0 ? generated : SAMPLE_QUERIES;
}

/* ----------------------------------------------------------------- model */

async function buildPortfolioModel(
  projects: Project[],
  locale: SupportedLocale
): Promise<PortfolioModel> {
  const perProject = await Promise.all(
    projects.map(async (p) => {
      const demo = isDemoProjectId(p.id);
      const [localInput, seoQueries, synced, channelPlan] = demo
        ? ([demoLocalRecsInput(p), demoSeoQueries(p), false, demoChannelRecsInput(p)] as const)
        : await Promise.all([
            resolveLocalRecsInput(p),
            resolveSeoQueries(p),
            hasSyncedMetrics(p.id),
            resolveChannelRecsInput(p),
          ]);
      const data = getProjectDataset(p);
      const row: CompareRow = {
        id: p.id,
        name: p.name,
        type: p.type,
        accentColor: p.accentColor,
        domain: p.domain,
        live: synced,
        totals: totalsOf(data.daily.slice(-30)),
        revenueSpark: bucketize(data.daily.slice(-365), "month").map((b) => b.revenue),
      };
      // Re-keyed per project (rec ids aren't project-scoped) and tagged for the feed.
      const recs: PortfolioRec[] = collectRecommendations(
        p,
        locale,
        localInput,
        seoQueries,
        synced,
        channelPlan
      ).map(
        (r) => ({
          ...r,
          id: `${p.id}:${r.id}`,
          projectId: p.id,
          projectName: p.name,
          projectAccent: p.accentColor,
        })
      );
      return { row, recs };
    })
  );
  return {
    rows: perProject.map((x) => x.row),
    // Stable sort over the project-ordered flatMap — identical ranking to sorting
    // the per-project lists after concatenation (what ProjectOverview always did).
    combined: perProject.flatMap((x) => x.recs).sort(byImpact),
  };
}

/** Module-level memo for the all-demo portfolio (see the header). Keyed by locale +
 *  the exact id list; holds the promise so concurrent first requests share one
 *  computation. A rejected promise is evicted (defensive — the demo path is pure). */
const demoModelMemo = new Map<string, Promise<PortfolioModel>>();

/** The portfolio view-model for a workspace. Demo-fixture-only lists are computed
 *  once per (locale, id-list) and memoized; anything involving a real tenant id is
 *  computed fresh on every request, stores and all. */
export function getPortfolioModel(
  projects: Project[],
  locale: SupportedLocale
): Promise<PortfolioModel> {
  const allDemo = projects.length > 0 && projects.every((p) => isDemoProjectId(p.id));
  if (!allDemo) return buildPortfolioModel(projects, locale);
  const key = `${locale}|${projects.map((p) => p.id).join(",")}`;
  let hit = demoModelMemo.get(key);
  if (!hit) {
    hit = buildPortfolioModel(projects, locale);
    hit.catch(() => demoModelMemo.delete(key));
    demoModelMemo.set(key, hit);
  }
  return hit;
}
