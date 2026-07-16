/** Response-health derivations over the inbox's reviews + triage (D2). Pure and
 *  framework-free, so the /recenze strip, the local diagnosis grounding and any
 *  batch caller share ONE implementation and it carries a test-unit.
 *
 *  Everything here is derived from data we already hold — the resolved review set
 *  and the per-review answered flag — no new source. Two honesty notes:
 *
 *  1. medianResponseAgeDays is a PROXY. We never store the reply's timestamp, only
 *     the review's age (`daysAgo`), so we cannot measure true reply latency. We report
 *     the median AGE of the answered reviews instead — a lower bound on how long they
 *     waited, and an honest read of "how old are the things you've gotten to".
 *  2. trend is deterministic: split the review set by recency into an older half and a
 *     newer half and compare each half's positive share. No smoothing, no randomness. */
import { bandOf, type InboxReview } from "./compute";

export type Trend = "up" | "down" | "flat";

export interface ResponseHealth {
  total: number;
  answered: number;
  /** answered / total, 0–1 (0 when there are no reviews) */
  replyRate: number;
  /** median `daysAgo` of answered reviews — a proxy for response age (see file note);
   *  null when nothing is answered */
  medianResponseAgeDays: number | null;
  /** positive share (4–5★) of the older half of the window, 0–1 */
  olderPositiveShare: number;
  /** positive share (4–5★) of the newer half of the window, 0–1 */
  newerPositiveShare: number;
  /** newer-vs-older sentiment direction; "flat" when equal or the window is too thin */
  trend: Trend;
}

/** Median of a numeric list (average of the two middles for an even count). Empty → null. */
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Positive share (4–5★) of a review slice, 0–1 (0 for an empty slice). */
function positiveShare(items: InboxReview[]): number {
  if (items.length === 0) return 0;
  const pos = items.filter((r) => bandOf(r.rating) === "positive").length;
  return pos / items.length;
}

/** Roll the review set + its answered flags into a response-health snapshot. Pure. */
export function responseHealth(reviews: InboxReview[]): ResponseHealth {
  const total = reviews.length;
  const answeredItems = reviews.filter((r) => r.answered);
  const answered = answeredItems.length;

  // Recency split for the sentiment trend: oldest → newest by age, then halve. With an
  // odd count the middle review sits in BOTH halves (a deliberate, deterministic choice
  // so a 3-review window still yields two comparable bands rather than a 1-vs-2 skew).
  const byAge = [...reviews].sort((a, b) => b.daysAgo - a.daysAgo); // oldest first
  const half = Math.ceil(byAge.length / 2);
  const older = byAge.slice(0, half);
  const newer = byAge.slice(byAge.length - half);
  const olderPositiveShare = positiveShare(older);
  const newerPositiveShare = positiveShare(newer);
  const trend: Trend =
    total < 2 || newerPositiveShare === olderPositiveShare
      ? "flat"
      : newerPositiveShare > olderPositiveShare
        ? "up"
        : "down";

  return {
    total,
    answered,
    replyRate: total > 0 ? answered / total : 0,
    medianResponseAgeDays: median(answeredItems.map((r) => r.daysAgo)),
    olderPositiveShare,
    newerPositiveShare,
    trend,
  };
}
