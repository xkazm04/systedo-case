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
import { sentiment } from "../reviews/compute";
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

  // Review sentiment (the resolved reviews carry no per-review answered flag, so the
  // rollup reads sentiment only — the panel/module surface the reply queue).
  if (input.reviews.length > 0) {
    const st = sentiment(input.reviews);
    req.reviews = {
      total: st.total,
      positive: st.positive,
      neutral: st.neutral,
      negative: st.negative,
      avg: st.avg,
      live: input.reviewsLive,
    };
  }

  // Location-roster attention rollup, when a roster is available.
  if (input.locations && input.locations.length > 0) {
    req.locations = {
      total: input.locations.length,
      attention: input.locations.filter(needsAttention).length,
      unanswered: input.locations.reduce((a, r) => a + r.unanswered, 0),
    };
  }

  return req;
}
