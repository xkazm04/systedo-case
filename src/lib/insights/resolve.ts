/** ONE resolver for every Overview recommendation producer's input.
 *
 *  `collectRecommendations` is a pure aggregator: each producer that reads a store
 *  gets its input threaded in by the caller. There used to be two hand-copied
 *  callers (ProjectOverview and the portfolio model), each assembling a 4-resolver
 *  fanout and a 6-of-7 positional call — so the cadence producer never ran, and the
 *  local review nudge skipped the inbox triage the local diagnosis joins. Now both
 *  surfaces call `resolveRecommendationInputs` + `recommendationsFor`, and the next
 *  producer seam is one field on `RecommendationInputs`.
 *
 *  Demo fixture ids resolve at the seam (`isDemoProjectId`, the one demo-ness test):
 *  a demo id is never persisted (persist-guard), so every store read would come back
 *  empty and each resolver would return exactly the sample it was passed. The pure
 *  demo builders construct that result without the I/O — the equivalence is proven
 *  in test-unit/demo-portfolio-model.test.mjs.
 *
 *  Server-only (the tenant path reads stores). */
import "server-only";
import type { Project } from "@/lib/projects/types";
import { isDemoProjectId } from "@/lib/projects/demo";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import {
  ALL_SAMPLE,
  type ChannelRecsInput,
  type LocalRecsInput,
  type PublishingRecsInput,
  type RecommendationInputs,
} from "./aggregate";
import { channelPlanForProject } from "@/lib/organic-channels/sample";
import { resolveOrganicChannels } from "@/lib/organic-channels/resolve";
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
import { resolveCadenceRules, resolvePublishingCalendar } from "@/lib/publishing/resolve";
import { weekCadence } from "@/lib/publishing/cadence";
import { resolveAnsweredTriage } from "@/lib/diagnoses/answered-triage";

/* ------------------------------------------------------- tenant resolvers */

/** Resolve a `local` project's Overview rec signals the same way lokalni/page.tsx
 *  does — coverage targets (catalog-seeded, with imported page-presence overlaid),
 *  and the ladder + reviews live-over-sample — so the aggregator's local recs read
 *  the project's real data, not the HVAC sample. Null for non-local projects.
 *  All four seams read through the ONE request-memoized local-signals blob, so this
 *  is a single store read per project per request. Also returns each seam's
 *  provenance (`live`) so the feed can disclose seeded signals, and — with a `uid` —
 *  the inbox triage's answered ids, through the SAME read the local diagnosis joins. */
export async function resolveLocalRecsInput(
  project: Project,
  uid: string | null = null
): Promise<LocalRecsInput | null> {
  if (project.type !== "local") return null;
  if (isDemoProjectId(project.id)) return demoLocalRecsInput(project);
  // Lazy: catalog/load pulls the auth session chain, which only the tenant path needs.
  const { loadServicesFor } = await import("@/lib/catalog/load");
  const localities = localitiesFor(project);
  const services = await loadServicesFor(project);
  const seedTargets =
    services.length > 0 ? targetsFromCatalog(services, localities) : targetsForProject(project);
  const [resolvedCoverage, resolvedLadder, resolvedReviews, resolvedPacks, answered] =
    await Promise.all([
      resolveCoverage(project.id, seedTargets),
      resolveLocalLadder(project.id, keywordLadder(project, localities, services)),
      resolveReviews(project.id, reviewsForProject(project, localities)),
      // No pack-derived recommendation yet, so only the PROVENANCE is consumed here —
      // an empty sample keeps this a flag read, not a pack computation.
      resolvePacks(project.id, []),
      resolveAnsweredTriage(uid, project.id),
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
    ...(answered ? { answeredReviewIds: answered } : {}),
  };
}

/** Resolve an `app` project's comparison-query slate the same way srovnani-seo/page.tsx
 *  does — catalog-generated from the brand + CURATED plan competitors when the catalog
 *  has plans, else the sample set. Null for non-app projects (the aggregator then keeps
 *  its SAMPLE_QUERIES default). */
export async function resolveSeoQueries(project: Project): Promise<CompareQuery[] | null> {
  if (project.type !== "app") return null;
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
 *  the pinned AI plan when the tenant has one, else the seeded sample, with the
 *  tracked lifecycle merged in. Runs for every project type (Kanály is available to
 *  all five). A failed read already answers with the sample AND `source: "sample"`,
 *  so the rec keeps its sample badge — the honest outcome, no branch needed here. */
export async function resolveChannelRecsInput(project: Project): Promise<ChannelRecsInput> {
  if (isDemoProjectId(project.id)) return demoChannelRecsInput(project);
  const resolved = await resolveOrganicChannels(project.id, channelPlanForProject(project));
  return { channels: resolved.channels, tracks: resolved.tracks, source: resolved.source };
}

/** The current week's cadence checks over the four schedulers — the cadence
 *  producer's input. Null (silence) for an anonymous viewer, a demo id, or a project
 *  with no cadence cap: the caps are one cached kanály read, and only a capped
 *  project pays for the calendar's four-scheduler read (the portfolio renders this
 *  per project). A calendar source that FAILED marks the input `degraded`: an
 *  unreadable scheduler is not an empty week, so the zero-planned claim is withheld.
 *  Best-effort — an Overview render never fails on this seam. */
export async function resolvePublishingRecsInput(
  project: Project,
  uid: string | null,
  at: string = new Date().toISOString()
): Promise<PublishingRecsInput | null> {
  if (!uid || isDemoProjectId(project.id)) return null;
  try {
    const rules = await resolveCadenceRules(project.id);
    if (rules.length === 0) return null;
    const calendar = await resolvePublishingCalendar(uid, project.id);
    const degraded = Object.values(calendar.sources).some((h) => h === "error");
    return {
      checks: weekCadence(calendar.items, at, calendar.rules),
      ...(degraded ? { degraded: true } : {}),
    };
  } catch {
    return null;
  }
}

/** Every producer's resolved input for one project. `uid` is the viewer (null when
 *  anonymous — the triage and the calendar are per-user reads); `at` pins "this week"
 *  for the cadence checks (defaults to now). A demo id makes zero store calls. */
export async function resolveRecommendationInputs(
  project: Project,
  { uid, at }: { uid: string | null; at?: string }
): Promise<RecommendationInputs> {
  if (isDemoProjectId(project.id)) return demoRecommendationInputs(project);
  const [local, seoQueries, metricsLive, channelPlan, publishing] = await Promise.all([
    resolveLocalRecsInput(project, uid),
    resolveSeoQueries(project),
    hasSyncedMetrics(project.id),
    resolveChannelRecsInput(project),
    resolvePublishingRecsInput(project, uid, at),
  ]);
  return { local, seoQueries, metricsLive, channelPlan, publishing };
}

/* ------------------------------------------------ pure demo counterparts */

/** What {@link resolveRecommendationInputs} provably returns for a DEMO fixture id —
 *  nothing synced, no triage, no cadence caps. Pure (no I/O). */
export function demoRecommendationInputs(project: Project): RecommendationInputs {
  return {
    local: demoLocalRecsInput(project),
    seoQueries: demoSeoQueries(project),
    metricsLive: false,
    channelPlan: demoChannelRecsInput(project),
    publishing: null,
  };
}

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
