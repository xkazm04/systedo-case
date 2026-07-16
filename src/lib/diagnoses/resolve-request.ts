/** Direction 1 — diagnoses ground themselves. The click path used to trust the
 *  economics the client POSTed (cohort rows / lead seeds / local signals were built
 *  in the panel and shipped back over the wire — spoofable). These resolvers
 *  RE-DERIVE each diagnosis request SERVER-SIDE from the owned/demo project, reusing
 *  the SAME shared builders the pages and the weekly-digest cron use, so a tampered
 *  body can never alter a diagnosed number. Server-only (they hit the live-over-
 *  sample resolve seams). The tenancy check (demo-public / owner-only) lives one
 *  layer up in grounding.ts's resolveProjectAccess; these take an already-resolved
 *  Project.
 *
 *  Each returns `{ request, sample }`: `sample` is the honest provenance flag — true
 *  when the diagnosis rests on the illustrative sample (no live import), threaded to
 *  the result meta so the panel labels it truthfully. This is the click-path parity
 *  with the digest cron's honesty gate (digest-plan.ts): the cron REFUSES to diagnose
 *  sample data as if it were the client's own; the click path (a demo user may still
 *  explore) LABELS it instead of refusing. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type {
  CohortDiagnosisRequest,
  LeadSourceDiagnosisRequest,
  LocalDiagnosisRequest,
} from "@/lib/ai-types";
import type { RecentReview } from "@/lib/local/sample";

import { resolveCohorts } from "@/lib/ltv/resolve";
import { ltvSummary, withMetrics as cohortWithMetrics } from "@/lib/ltv/compute";
import { buildCohortRequest } from "./cohort-request";

import { resolveLeadSources } from "@/lib/lead-quality/resolve";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { withMetrics as sourceWithMetrics } from "@/lib/lead-quality/compute";
import { buildLeadSourceSeeds, seedToRequest } from "./lead-source-request";

import {
  SAMPLE_RECENT_REVIEWS,
  reviewsForProject as reviewProfilesForProject,
  targetsForProject,
  type LocalTarget,
  type ReviewProfile,
} from "@/lib/local/sample";
import { reviewsForProject as reviewInboxForProject } from "@/lib/reviews/sample";
import { targetsFromCatalog } from "@/lib/local/catalog";
import { profilesFromReviews } from "@/lib/local/compute";
import { keywordLadder } from "@/lib/mappack/sample";
import { locationsFromCatalog } from "@/lib/locations/sample";
import {
  resolveCoverage,
  resolveLocalLadder,
  resolveLocations,
  resolveReviews,
} from "@/lib/local-signals/resolve";
import type { LocalSignalsSource } from "@/lib/local-signals/types";
import { localitiesFor } from "@/lib/catalog/resolve";
import { loadServicesFor } from "@/lib/catalog/load";
import { buildLocalDiagnosisRequest } from "./local-request";

/** A server-rebuilt diagnosis request + its honest provenance flag. */
export interface ResolvedDiagnosisRequest<T> {
  request: T;
  /** true when the request rests on the illustrative sample (no live import) */
  sample: boolean;
}

/** Cohort economics have no live source yet (resolve.ts is always the project-varied
 *  sample — the honest floor), so a cohort diagnosis is ALWAYS sample-grounded. */
export function resolveCohortDiagnosisRequest(
  project: Project
): ResolvedDiagnosisRequest<CohortDiagnosisRequest> {
  const cohorts = resolveCohorts(project);
  const rows = cohorts.map((c) => cohortWithMetrics(c));
  const request = buildCohortRequest(rows, ltvSummary(cohorts), project.type === "eshop");
  return { request, sample: true };
}

/** Re-derive the lead-source diagnosis for one picked source from the funnel's
 *  ACTUAL resolved sources (imported-over-sample), reusing the SAME seeds the panel
 *  and cron build. Returns null when the source no longer stands out as diagnosable
 *  (nothing to diagnose). `sample` = the funnel is not on genuinely imported leads. */
export async function resolveLeadSourceDiagnosisRequest(
  project: Project,
  source: string
): Promise<ResolvedDiagnosisRequest<LeadSourceDiagnosisRequest> | null> {
  const resolved = await resolveLeadSources(project.id, sourcesForProject(project));
  const rows = resolved.sources
    .map(sourceWithMetrics)
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const seeds = buildLeadSourceSeeds(rows);
  if (seeds.length === 0) return null;
  // Honour the client's picked source when it is one of the diagnosable seeds;
  // otherwise fall back to the worst (first) seed so a stale selection still returns
  // an honest diagnosis rather than nothing.
  const seed = seeds.find((s) => s.source === source) ?? seeds[0]!;
  return { request: seedToRequest(seed), sample: !resolved.live };
}

/** The resolved local-visibility inputs, so the /lokalni page and the /api/ai
 *  resolver derive the diagnosis request from ONE place (and the page reuses the
 *  resolved services / reviews / targets for its own rendering without re-resolving). */
export interface ResolvedLocalInputs {
  request: LocalDiagnosisRequest;
  sample: boolean;
  targets: LocalTarget[];
  /** reputation cards: live per-locality profiles when reviews are imported, else the
   *  illustrative sample profiles — `reviewsLive` says which, for the provenance chip */
  reviewProfiles: ReviewProfile[];
  reviewsLive: boolean;
  /** coverage-matrix provenance (D1): true when live page-presence is overlaid */
  coverageLive: boolean;
  coverageSource: "sample" | LocalSignalsSource;
  coverageSyncedAt?: string;
  coverageSourceUrl?: string;
  /** live-over-sample recent reviews for the reply queue */
  recentReviews: RecentReview[];
  /** business-type label derived from the catalogue (grounds AI review replies) */
  businessType?: string;
}

/** Re-derive the local-diagnosis request server-side from the project's resolved
 *  signals (coverage targets, the live-over-sample ranking ladder, review set and
 *  location roster) — the SAME derivation the /lokalni page performed inline, now
 *  shared so the click path and the page agree exactly. `sample` = neither the
 *  ladder nor the reviews are live. */
export async function resolveLocalDiagnosisRequest(
  project: Project
): Promise<ResolvedLocalInputs> {
  const localities = localitiesFor(project);
  const services = await loadServicesFor(project);
  const seedTargets =
    services.length > 0 ? targetsFromCatalog(services, localities) : targetsForProject(project);

  const [resolvedReviews, resolvedLadder, resolvedLocations, resolvedCoverage] = await Promise.all([
    resolveReviews(project.id, reviewInboxForProject(project, localities)),
    resolveLocalLadder(project.id, keywordLadder(project, localities, services)),
    resolveLocations(project.id, locationsFromCatalog(project, localities, services)),
    resolveCoverage(project.id, seedTargets),
  ]);

  // Live page-presence overlaid on the seed drives the whole coverage picture — the
  // matrix, worstGap, gapVolume AND the round-10 outcome chip's coveragePct (now
  // genuinely movable, not a snapshot==current constant by construction).
  const targets = resolvedCoverage.targets;

  const request = buildLocalDiagnosisRequest({
    targets,
    ladder: resolvedLadder.ladder,
    ladderLive: resolvedLadder.live,
    reviews: resolvedReviews.reviews,
    reviewsLive: resolvedReviews.live,
    locations: resolvedLocations.rows,
    businessName: project.name,
  });

  const recentReviews: RecentReview[] = resolvedReviews.live
    ? resolvedReviews.reviews
        .slice(0, 8)
        .map((r) => ({ id: r.id, area: r.area, author: r.author, rating: r.rating, text: r.text }))
    : SAMPLE_RECENT_REVIEWS;

  const businessType =
    [...new Set(services.map((s) => s.category).filter(Boolean))]
      .slice(0, 2)
      .join(" a ")
      .toLowerCase() || undefined;

  return {
    request,
    // Honest composition (D1): the diagnosis rests on the SAMPLE only when NONE of its
    // three import-first inputs is live — the ladder, the reviews, AND coverage. Any one
    // of them being real means the diagnosed picture is grounded in genuine data, so the
    // panel should not label the whole thing illustrative.
    sample: !resolvedLadder.live && !resolvedReviews.live && !resolvedCoverage.live,
    targets,
    // Reputation cards read live per-locality profiles when reviews are imported (so the
    // provenance chip can say so honestly), else the illustrative sample profiles.
    reviewProfiles: resolvedReviews.live
      ? profilesFromReviews(resolvedReviews.reviews)
      : reviewProfilesForProject(project),
    reviewsLive: resolvedReviews.live,
    coverageLive: resolvedCoverage.live,
    coverageSource: resolvedCoverage.source,
    coverageSyncedAt: resolvedCoverage.syncedAt,
    coverageSourceUrl: resolvedCoverage.sourceUrl,
    recentReviews,
    businessType,
  };
}
