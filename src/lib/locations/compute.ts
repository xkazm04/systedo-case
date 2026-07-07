/** Location-roster rollups + attention ranking. Pure (no imports beyond the row
 *  type), so it has a matching test-unit and can run anywhere. */
import type { LocationRow } from "./sample";

export interface FleetSummary {
  total: number;
  onAutopilot: number;
  /** locations that need a human's attention (see {@link needsAttention}) */
  needsAttention: number;
  /** reviews awaiting a reply across all locations */
  unanswered: number;
  /** drafts pending approval across all locations */
  drafts: number;
  totalReviews: number;
  /** review-weighted average rating across locations */
  avgRating: number;
}

/** A location needs attention when its Google profile isn't cleanly connected,
 *  a human flagged something, it's ranking outside the map pack (>10), or it has
 *  a backlog of unanswered reviews. Pure. */
export function needsAttention(r: LocationRow): boolean {
  return r.gbp !== "connected" || r.flagged > 0 || r.mapRank > 10 || r.unanswered > 2;
}

export function fleetSummary(rows: LocationRow[]): FleetSummary {
  const totalReviews = rows.reduce((a, r) => a + r.reviews, 0);
  const ratingSum = rows.reduce((a, r) => a + r.rating * r.reviews, 0);
  return {
    total: rows.length,
    onAutopilot: rows.filter((r) => r.autopilot).length,
    needsAttention: rows.filter(needsAttention).length,
    unanswered: rows.reduce((a, r) => a + r.unanswered, 0),
    drafts: rows.reduce((a, r) => a + r.drafts, 0),
    totalReviews,
    avgRating: totalReviews > 0 ? ratingSum / totalReviews : 0,
  };
}

/** Urgency score used to rank the roster — higher = more urgent. Weights a
 *  disconnected profile above a flagged item above an unanswered-review backlog.
 *  Pure. */
export function attentionScore(r: LocationRow): number {
  return (
    (r.gbp === "disconnected" ? 100 : r.gbp === "attention" ? 50 : 0) +
    r.flagged * 20 +
    r.unanswered * 6 +
    (r.mapRank > 10 ? 15 : 0) +
    r.openTasks * 4
  );
}

/** Roster ordered most-urgent first (stable copy — does not mutate the input). */
export function sortByAttention(rows: LocationRow[]): LocationRow[] {
  return [...rows]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => attentionScore(b.r) - attentionScore(a.r) || a.i - b.i)
    .map(({ r }) => r);
}
