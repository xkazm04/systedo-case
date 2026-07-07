/** Review-inbox filtering, sorting, sentiment rollup and saved-reply macro
 *  expansion. Pure (framework-free), so it carries a test-unit and both the
 *  client inbox and any batch job share one implementation. */
import { interpolate } from "@/lib/i18n/interpolate";
import type { ReviewItem } from "./sample";

export type Band = "positive" | "neutral" | "negative";

/** Rating → sentiment band: 4–5 positive, 3 neutral, 1–2 negative. */
export function bandOf(rating: number): Band {
  return rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
}

/** A review augmented with the client's per-review state (answered / flagged). */
export type InboxReview = ReviewItem & { answered?: boolean; flagged?: boolean };

export type BandFilter = "all" | Band;
export type StatusFilter = "all" | "unanswered" | "answered" | "flagged";
export type SortKey = "newest" | "oldest" | "rating-desc" | "rating-asc";

export interface ReviewFilter {
  query: string;
  band: BandFilter;
  /** locality name, or "all" */
  area: string;
  status: StatusFilter;
}

export function filterReviews(items: InboxReview[], f: ReviewFilter): InboxReview[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((r) => {
    if (f.band !== "all" && bandOf(r.rating) !== f.band) return false;
    if (f.area !== "all" && r.area !== f.area) return false;
    if (f.status === "unanswered" && r.answered) return false;
    if (f.status === "answered" && !r.answered) return false;
    if (f.status === "flagged" && !r.flagged) return false;
    if (q && !(`${r.author} ${r.text} ${r.area}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

export function sortReviews(items: InboxReview[], sort: SortKey): InboxReview[] {
  const copy = [...items];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => a.daysAgo - b.daysAgo);
    case "oldest":
      return copy.sort((a, b) => b.daysAgo - a.daysAgo);
    case "rating-desc":
      return copy.sort((a, b) => b.rating - a.rating || a.daysAgo - b.daysAgo);
    case "rating-asc":
      return copy.sort((a, b) => a.rating - b.rating || a.daysAgo - b.daysAgo);
  }
}

export interface Sentiment {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  /** average star rating */
  avg: number;
  /** reviews without a reply */
  unanswered: number;
}

export function sentiment(items: InboxReview[]): Sentiment {
  const total = items.length;
  let positive = 0, neutral = 0, negative = 0, ratingSum = 0, unanswered = 0;
  for (const r of items) {
    const b = bandOf(r.rating);
    if (b === "positive") positive++;
    else if (b === "neutral") neutral++;
    else negative++;
    ratingSum += r.rating;
    if (!r.answered) unanswered++;
  }
  return { total, positive, neutral, negative, avg: total > 0 ? ratingSum / total : 0, unanswered };
}

/** Expand a saved-reply macro — `{author}`, `{business}`, `{area}` placeholders
 *  are replaced; unknown placeholders are left intact (shared interpolate). */
export function expandMacro(
  template: string,
  vars: { author?: string; business?: string; area?: string }
): string {
  return interpolate(template, {
    author: vars.author ?? "",
    business: vars.business ?? "",
    area: vars.area ?? "",
  });
}
