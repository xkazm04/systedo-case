/** Ranking for the auto-generated "Co stojí za pozornost" insights. The engine
 *  already grades every metric's period-over-period move as strong / weak / noise
 *  (see series.significanceFor); this pure comparator lets the insight list lead
 *  with the moves the engine is most confident are real, instead of a hardcoded
 *  authoring order. No React, no formatting — just the ordering rule, so it can be
 *  unit-tested in isolation. */

import type { Significance } from "./series";

/** What an insight needs to be ranked: the engine's confidence in its underlying
 *  metric's move, and a magnitude for tie-breaking within the same confidence tier
 *  (a relative fraction, so magnitudes stay comparable across metrics). */
export interface InsightRank {
  significance: Significance;
  /** |relative change| (or |relative gap to goal|) — larger sorts first on ties */
  magnitude: number;
}

/** Sort weight per significance tier — lower sorts first (leads the list).
 *  "orientational" (a value-ratio directional read with no significance test) sits
 *  below the confidently-real weak tier but above confirmed noise, so a ROAS/PNO
 *  move is still surfaced ahead of a move the engine knows is within variance. */
const SIG_ORDER: Record<Significance, number> = { strong: 0, weak: 1, orientational: 2, noise: 3 };

/**
 * Compare two insights for display order: strong before weak before orientational
 * before noise, and within a tier the larger magnitude first. Returns 0 for an
 * exact tie so a
 * stable sort preserves the caller's authoring order as the final tiebreak
 * (keeps related lines — e.g. a revenue move and its funnel explanation —
 * adjacent). Pure and total.
 */
export function compareInsightRank(a: InsightRank, b: InsightRank): number {
  const bySig = SIG_ORDER[a.significance] - SIG_ORDER[b.significance];
  if (bySig !== 0) return bySig;
  // Same confidence tier → louder move first. NaN-safe: treat a non-finite
  // magnitude as 0 so it never poisons the comparison.
  const ma = Number.isFinite(a.magnitude) ? a.magnitude : 0;
  const mb = Number.isFinite(b.magnitude) ? b.magnitude : 0;
  return mb - ma;
}
