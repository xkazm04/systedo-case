/** Local coverage + reputation rollups. Pure. */
import type { LocalTarget, ReviewProfile } from "./sample";

export interface LocalSummary {
  total: number;
  withPage: number;
  /** withPage / total */
  coverage: number;
  /** search volume sitting in uncovered service×area gaps */
  gapVolume: number;
  reviews: number;
  /** review-weighted average rating */
  avgRating: number;
}

export function localSummary(targets: LocalTarget[], reviews: ReviewProfile[]): LocalSummary {
  const withPage = targets.filter((t) => t.hasPage).length;
  const gapVolume = targets.filter((t) => !t.hasPage).reduce((a, t) => a + t.monthlyVolume, 0);
  const totalReviews = reviews.reduce((a, r) => a + r.reviews, 0);
  const ratingSum = reviews.reduce((a, r) => a + r.rating * r.reviews, 0);
  return {
    total: targets.length,
    withPage,
    coverage: targets.length > 0 ? withPage / targets.length : 0,
    gapVolume,
    reviews: totalReviews,
    avgRating: totalReviews > 0 ? ratingSum / totalReviews : 0,
  };
}

/** Uncovered targets (no page), highest-volume first. */
export function gaps(targets: LocalTarget[]): LocalTarget[] {
  return targets.filter((t) => !t.hasPage).sort((a, b) => b.monthlyVolume - a.monthlyVolume);
}
