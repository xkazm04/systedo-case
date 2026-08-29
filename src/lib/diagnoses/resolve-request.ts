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
  AdsDiagnosisPlatform,
  AdsDiagnosisRequest,
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
  targetsForProject,
  type LocalTarget,
  type ReviewProfile,
} from "@/lib/local/sample";
import { reviewsForProject as reviewInboxForProject } from "@/lib/reviews/sample";
import { targetsFromCatalog } from "@/lib/local/catalog";
import { profilesFromReviews } from "@/lib/local/compute";
import { businessTypeFromServices } from "@/lib/local/business-type";
import { currentUserId } from "@/lib/session";
import { getProjectState } from "@/lib/project-state/store";
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

import { getLatestChanges, listCampaignsForProject } from "@/lib/campaigns/store";
import { resolveTenant } from "@/lib/campaigns/connector";
import { getClientProfile } from "@/lib/campaigns/report-config";
import { indexChanges, withMetrics as campaignWithMetrics } from "@/lib/campaigns/types";
import { triageGoals } from "@/lib/campaigns/triage";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { buildAdsDiagnosisRequest, hasLivePlatform, priorWindowTotals } from "./ads-request";

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

  const [resolvedReviews, resolvedLadder, resolvedLocations, resolvedCoverage, answeredReviewIds] =
    await Promise.all([
      resolveReviews(project.id, reviewInboxForProject(project, localities)),
      resolveLocalLadder(project.id, keywordLadder(project, localities, services)),
      resolveLocations(project.id, locationsFromCatalog(project, localities, services)),
      resolveCoverage(project.id, seedTargets),
      resolveAnsweredTriage(project.id),
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
    // The inbox triage feeds BOTH the reconciled unanswered signal (D1) and the
    // reply-health grounding (D2); undefined when no triage is stored for this user.
    ...(answeredReviewIds ? { answeredReviewIds } : {}),
    locations: resolvedLocations.rows,
    businessName: project.name,
  });

  const recentReviews: RecentReview[] = resolvedReviews.live
    ? resolvedReviews.reviews
        .slice(0, 8)
        .map((r) => ({ id: r.id, area: r.area, author: r.author, rating: r.rating, text: r.text }))
    : SAMPLE_RECENT_REVIEWS;

  const businessType = businessTypeFromServices(services);

  return {
    request,
    // Honest composition (D1): the diagnosis rests on the SAMPLE only when NONE of its
    // three import-first inputs is live — the ladder, the reviews, AND coverage. Any one
    // of them being real means the diagnosed picture is grounded in genuine data, so the
    // panel should not label the whole thing illustrative.
    sample: !resolvedLadder.live && !resolvedReviews.live && !resolvedCoverage.live,
    targets,
    // ONE reputation truth (D1): the /lokalni reputation cards aggregate the SAME resolved
    // review set the /recenze inbox renders — live per-locality profiles when reviews are
    // imported, else the sample INBOX set (reviews/sample), NOT the separate local/sample
    // reviewProfiles that used to disagree with the inbox's averages. So both surfaces
    // report the same count and the same review-weighted rating by construction.
    reviewProfiles: profilesFromReviews(resolvedReviews.reviews),
    reviewsLive: resolvedReviews.live,
    coverageLive: resolvedCoverage.live,
    coverageSource: resolvedCoverage.source,
    coverageSyncedAt: resolvedCoverage.syncedAt,
    coverageSourceUrl: resolvedCoverage.sourceUrl,
    recentReviews,
    businessType,
  };
}

/** The inbox triage's answered review-ids for the current user + project, or undefined
 *  when no triage is stored (or there is no signed-in user). Best-effort: a store hiccup
 *  degrades to "no triage" so the diagnosis still resolves on the roster figures alone.
 *  The "reviews" key mirrors ReviewInbox's persisted state shape (answered/flagged/drafts). */
async function resolveAnsweredTriage(projectId: string): Promise<string[] | undefined> {
  try {
    const uid = await currentUserId();
    if (!uid) return undefined;
    const state = await getProjectState<{ answered?: string[] }>(uid, projectId, "reviews");
    return Array.isArray(state?.answered) ? state.answered : undefined;
  } catch {
    return undefined;
  }
}

/** The diagnosed ads window. Fixed at 30 days: it is the campaign spine's own
 *  mid-range read, long enough for the waste ranking to be stable and short enough
 *  that a recommendation is still actionable. */
const ADS_WINDOW = "30d" as const;
const ADS_WINDOW_DAYS = 30;

/** Re-derive the ads-performance diagnosis request from the project's ACTUAL synced
 *  portfolio — the ADR-0010 UNION of its per-account tenants, so a dual-network
 *  client is diagnosed on both without choosing one. Returns null when the project
 *  has no campaigns at all (genuinely nothing to diagnose).
 *
 *  Every enrichment is best-effort and degrades to "not supplied" rather than to a
 *  fabricated zero: a missing change diff drops the per-campaign deltas, a missing
 *  client profile falls back to the paid-portfolio target, and the prior window is
 *  attached ONLY when both the portfolio and the report series are genuinely live
 *  (pairing a live portfolio with the illustrative series would invent a trend).
 *  `sample` = no genuinely synced network stands behind the rows.
 *
 *  Mutations stay per-tenant elsewhere; this is a read, and the union is exactly
 *  what makes it honest for a tenant with two accounts. */
export async function resolveAdsDiagnosisRequest(
  project: Project,
  userId: string | null
): Promise<ResolvedDiagnosisRequest<AdsDiagnosisRequest> | null> {
  const campaigns = await listCampaignsForProject(userId, project.id, ADS_WINDOW);
  if (campaigns.length === 0) return null;
  const rows = campaigns.map(campaignWithMetrics);
  const live = hasLivePlatform(rows);

  // The change diff and the agreed goal are per-tenant reads; the PRIMARY tenant is
  // the one the console already treats as canonical. A secondary network simply has
  // no diff entries, which reads as "no movement supplied" — never as zero movement.
  const tenant = await resolveTenant(userId, project.id);
  const [changesById, goals, dataset] = await Promise.all([
    getLatestChanges(tenant)
      .then(indexChanges)
      .catch(() => ({})),
    getClientProfile(tenant)
      .then((p) => triageGoals(p.pnoGoal))
      .catch(() => undefined),
    resolveReportDataset(project),
  ]);

  const prior =
    live && dataset.live ? priorWindowTotals(dataset.data.daily, ADS_WINDOW_DAYS) : null;
  const primaryPlatform: AdsDiagnosisPlatform | undefined =
    dataset.source === "google-ads" || dataset.source === "sklik" ? dataset.source : undefined;

  const request = buildAdsDiagnosisRequest({
    rows,
    changesById,
    currency: (live && dataset.currencyCode) || "CZK",
    ...(dataset.mixedCurrency ? { mixedCurrency: true } : {}),
    ...(primaryPlatform ? { primaryPlatform } : {}),
    ...(goals ? { goals, targetPno: goals.targetPno } : {}),
    ...(prior ? { prior } : {}),
  });
  if (!request) return null;
  return { request, sample: !live };
}
