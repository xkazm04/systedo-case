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
