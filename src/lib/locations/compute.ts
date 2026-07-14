/** Location-roster rollups + attention ranking. Pure (no imports beyond the row
 *  type), so it has a matching test-unit and can run anywhere. */
import type { ImportedGbpRow } from "@/lib/local-signals/types";
import type { LocationRow } from "./sample";

/** Case- and diacritic-insensitive key for matching an imported location to a
 *  catalog locality by name ("Plzeň" ↔ "plzen"). */
function nameKey(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Merge imported GBP rows onto the seeded roster: a row matched to a catalog
 *  locality by name overrides its status / review count / rating / unanswered with the
 *  real figures (map rank, tasks, budget stay seeded — the export doesn't carry them);
 *  an UNMATCHED imported row still renders as its own location (mapRank 0 = unknown, so
 *  the UI shows "—"). Attention math is unchanged — its inputs simply become real. Pure. */
export function mergeGbp(sample: LocationRow[], imported: ImportedGbpRow[]): LocationRow[] {
  const usedKeys = new Set<string>();
  const impByKey = new Map(imported.map((i) => [nameKey(i.name), i]));

  const out = sample.map((r) => {
    const imp = impByKey.get(nameKey(r.name));
    if (!imp) return r;
    usedKeys.add(nameKey(r.name));
    return { ...r, gbp: imp.status, reviews: imp.reviews, rating: imp.rating, unanswered: imp.unanswered };
  });

  for (const imp of imported) {
    const key = nameKey(imp.name);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    out.push({
      id: `gbp-${key || imp.name}`,
      name: imp.name,
      region: "",
      services: 0,
      gbp: imp.status,
      autopilot: false,
      rating: imp.rating,
      reviews: imp.reviews,
      unanswered: imp.unanswered,
      mapRank: 0, // unknown — no ladder for an imported-only location
      openTasks: 0,
      flagged: 0,
      drafts: 0,
      monthlyBudget: 0,
    });
  }
  return out;
}

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
