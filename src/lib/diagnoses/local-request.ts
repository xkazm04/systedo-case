/** Shared, server-usable builder for the local-diagnosis request. Maps a local
 *  project's already-RESOLVED signals (coverage targets, the ranking ladder, the
 *  review set and — when present — the location roster) into the REAL-numbers-only
 *  request the gate-tracked `local-diagnosis` tool reads, so the SAME mapping is
 *  reused by the module/panel and any batch caller instead of being duplicated.
 *  Framework-free + pure; imports only the pure compute helpers (client-safe). */
import type { LocalDiagnosisGap, LocalDiagnosisRequest } from "../ai-types";
import type { LocalTarget } from "../local/sample";
import { gaps, localSummary } from "../local/compute";
import type { KeywordRank } from "../mappack/sample";
import { changeSinceLast, ladderSpanDays } from "../mappack/compute";
import type { ReviewItem } from "../reviews/sample";
import { sentiment, type InboxReview } from "../reviews/compute";
import { responseHealth } from "../reviews/health";
import type { LocationRow } from "../locations/sample";
import { needsAttention } from "../locations/compute";

/** The addressable gap label — worstGap must be exactly one of these. */
export function gapLabel(target: Pick<LocalTarget, "service" | "area">): string {
  return `${target.service} — ${target.area}`;
}

export interface LocalDiagnosisInputs {
  targets: LocalTarget[];
  ladder: KeywordRank[];
  /** whether the ladder is imported/synced (not the illustrative sample) */
  ladderLive: boolean;
  reviews: ReviewItem[];
  /** whether the reviews are imported (not the sample) */
  reviewsLive: boolean;
  /** ids of reviews the inbox triage marks answered. `undefined` = triage not loaded
   *  (leave the roster's unanswered untouched and omit reply-health); an empty array =
   *  triage loaded, nothing answered yet (reply-health surfaces 0%). */
  answeredReviewIds?: string[];
  /** the location roster, when available */
  locations?: LocationRow[];
  businessName?: string;
  /** how many top gaps to offer as worstGap candidates */
  topGaps?: number;
}

/** Build the local-diagnosis request from the resolved signals. Pure. */
export function buildLocalDiagnosisRequest(input: LocalDiagnosisInputs): LocalDiagnosisRequest {
  const s = localSummary(input.targets, []);
  const topGaps = input.topGaps ?? 8;
  const gapRows: LocalDiagnosisGap[] = gaps(input.targets)
    .slice(0, topGaps)
    .map((g) => ({
      label: gapLabel(g),
      service: g.service,
      area: g.area,
      monthlyVolume: g.monthlyVolume,
    }));

  const req: LocalDiagnosisRequest = {
    coveragePct: s.coverage,
    trackedCombos: s.total,
    withPage: s.withPage,
    gapVolume: s.gapVolume,
    gaps: gapRows,
  };
  if (input.businessName) req.businessName = input.businessName;

  // Ladder rollup + movement since the last import (live ladders only carry a
  // meaningful span; the sample's synthetic dates still compute honestly).
  if (input.ladder.length > 0) {
    const tracked = input.ladder.length;
    const inPack = input.ladder.filter((r) => r.current <= 3).length;
    const top1 = input.ladder.filter((r) => r.current === 1).length;
    const avgRank = input.ladder.reduce((a, r) => a + r.current, 0) / tracked;
    let improved = 0;
    let declined = 0;
    let netSinceLast = 0;
    for (const k of input.ladder) {
      const sl = changeSinceLast(k);
      if (sl === null) continue;
      netSinceLast += sl;
      if (sl > 0) improved++;
      else if (sl < 0) declined++;
    }
    req.ladder = {
      tracked,
      inPack,
      top1,
      avgRank,
      packRate: tracked > 0 ? inPack / tracked : 0,
      spanDays: ladderSpanDays(input.ladder),
      improved,
      declined,
      netSinceLast,
      live: input.ladderLive,
    };
  }

  // Review sentiment, plus reply-health from the inbox triage when it is loaded (D2).
  // The answered flag is the inbox's per-review triage overlaid on the resolved set.
  if (input.reviews.length > 0) {
    const answeredSet = input.answeredReviewIds ? new Set(input.answeredReviewIds) : null;
    const withState: InboxReview[] = input.reviews.map((r) => ({
      ...r,
      answered: answeredSet ? answeredSet.has(r.id) : false,
    }));
    const st = sentiment(withState);
    req.reviews = {
      total: st.total,
      positive: st.positive,
      neutral: st.neutral,
      negative: st.negative,
      avg: st.avg,
      live: input.reviewsLive,
    };
    // Reply-health only when triage is actually loaded — otherwise "0 % answered" would
    // be an artefact of missing state, not a real backlog.
    if (answeredSet) {
      const h = responseHealth(withState);
      req.reviews.replyRate = h.replyRate;
      req.reviews.medianResponseAgeDays = h.medianResponseAgeDays;
      req.reviews.sentimentTrend = h.trend;
    }
  }

  // Location-roster attention rollup, when a roster is available.
  if (input.locations && input.locations.length > 0) {
    // Reconcile the inbox triage into the roster's unanswered backlog (D1). Precedence:
    // a triage-answered review is IDENTIFIABLE against the roster only when its locality
    // matches a roster location's name — those subtract from the roster total; answered
    // reviews in a locality the roster doesn't list can't be attributed, so the GBP
    // roster figure wins for them. Clamped at 0 (never negative). With no triage loaded
    // (answeredReviewIds === undefined) the roster figure passes through unchanged.
    const rosterUnanswered = input.locations.reduce((a, r) => a + r.unanswered, 0);
    const rosterAreas = new Set(input.locations.map((l) => l.name));
    const answeredSet = input.answeredReviewIds ? new Set(input.answeredReviewIds) : null;
    const identifiableAnswered = answeredSet
      ? input.reviews.filter((r) => answeredSet.has(r.id) && rosterAreas.has(r.area)).length
      : 0;
    req.locations = {
      total: input.locations.length,
      attention: input.locations.filter(needsAttention).length,
      unanswered: Math.max(0, rosterUnanswered - identifiableAnswered),
    };
  }

  return req;
}
