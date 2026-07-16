/** Local coverage + reputation rollups. Pure. */
import type { LocalTarget, ReviewProfile } from "./sample";
import type { ReviewItem } from "@/lib/reviews/sample";

/** Aggregate resolved reviews into per-locality reputation profiles (count + review-
 *  weighted average rating), so the reputation cards can read GENUINELY live figures
 *  when reviews are imported — and be labelled live — instead of always showing the
 *  illustrative sample profiles. Highest review count first. Pure (D1). */
export function profilesFromReviews(reviews: ReviewItem[]): ReviewProfile[] {
  const byArea = new Map<string, { reviews: number; ratingSum: number }>();
  for (const r of reviews) {
    const key = r.area || "—";
    const acc = byArea.get(key) ?? { reviews: 0, ratingSum: 0 };
    acc.reviews += 1;
    acc.ratingSum += r.rating;
    byArea.set(key, acc);
  }
  return [...byArea.entries()]
    .map(([area, a]) => ({ area, reviews: a.reviews, rating: a.reviews > 0 ? a.ratingSum / a.reviews : 0 }))
    .sort((a, b) => b.reviews - a.reviews);
}

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
  /** covered combinations (hasPage) ranking outside the top 10 (rank > 10) */
  coveredButWeak: number;
}

export function localSummary(targets: LocalTarget[], reviews: ReviewProfile[]): LocalSummary {
  const withPage = targets.filter((t) => t.hasPage).length;
  const gapVolume = targets.filter((t) => !t.hasPage).reduce((a, t) => a + t.monthlyVolume, 0);
  const totalReviews = reviews.reduce((a, r) => a + r.reviews, 0);
  const ratingSum = reviews.reduce((a, r) => a + r.rating * r.reviews, 0);
  const coveredButWeak = targets.filter((t) => t.hasPage && t.rank !== null && t.rank > 10).length;
  return {
    total: targets.length,
    withPage,
    coverage: targets.length > 0 ? withPage / targets.length : 0,
    gapVolume,
    reviews: totalReviews,
    avgRating: totalReviews > 0 ? ratingSum / totalReviews : 0,
    coveredButWeak,
  };
}

/** Uncovered targets (no page), highest-volume first. */
export function gaps(targets: LocalTarget[]): LocalTarget[] {
  return targets.filter((t) => !t.hasPage).sort((a, b) => b.monthlyVolume - a.monthlyVolume);
}

export interface LocalMatrix {
  /** distinct services, in first-seen order — the matrix rows */
  services: string[];
  /** distinct areas, in first-seen order — the matrix columns */
  areas: string[];
  /** cell lookup keyed `${service}|${area}`; missing key = no target tracked */
  cell: Map<string, LocalTarget>;
}

/** Pivot targets into a service×area grid (rows = services, columns = areas). Pure. */
export function matrix(targets: LocalTarget[]): LocalMatrix {
  const services: string[] = [];
  const areas: string[] = [];
  const cell = new Map<string, LocalTarget>();
  for (const t of targets) {
    if (!services.includes(t.service)) services.push(t.service);
    if (!areas.includes(t.area)) areas.push(t.area);
    cell.set(`${t.service}|${t.area}`, t);
  }
  return { services, areas, cell };
}
