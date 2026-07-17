/** Shared color language for the local-SEO surfaces (map pack, ladder, locations,
 *  reputation). Extracted so the rank→tone ramp, rating→tone ramp and the "4,6 ★"
 *  label live in ONE place instead of being copy-pasted (and drifting) across
 *  RankLadder / LocationsModule / MapPackClient / LocalModule / LocalReviews /
 *  ReviewInbox. Pure — no React, no formatter runtime — so it is unit-tested. */
import type { PillTone } from "@/components/ui";

/** A local SERP rank → Pill tone, MONOTONE in severity so the color never
 *  contradicts the data: 1–3 `positive` (in the pack), 4–10 `coral` (warning —
 *  close but outside the pack), 11+ `negative` (worst — off the first screen).
 *  A higher (worse) rank must never look softer than a better one. */
export function rankTone(rank: number): PillTone {
  if (rank <= 3) return "positive";
  if (rank <= 10) return "coral";
  return "negative";
}

/** A star rating → Pill tone: 4–5 `positive`, exactly 3 `coral` (mixed), ≤2
 *  `negative` (poor). */
export function ratingTone(rating: number): PillTone {
  if (rating >= 4) return "positive";
  if (rating === 3) return "coral";
  return "negative";
}

/** Locale-aware "4,6 ★" rating label — the comma decimal comes from the passed
 *  formatter, not a hand-faked replace. */
export function star(rating: number, fmtDecimal: (n: number, digits?: number) => string): string {
  return `${fmtDecimal(rating, 1)} ★`;
}
