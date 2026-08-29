/** The two public-scan funnel emitters (server-only), siblings of
 *  lib/analytics/track.ts and bound by exactly the same contract: best-effort by
 *  design — a recording failure must NEVER break the surface it instruments — and
 *  aggregated-only, so nothing but a (metric, UTC-day) counter is ever written. No
 *  IP, no user agent, no session id, no per-visitor row: the funnel these back
 *  measures VOLUMES in a window, and that is all it can measure.
 *
 *  They live beside the /sken code rather than in analytics/track.ts because the
 *  two call sites (the public mode's prepare, the redeem route) are the only ones
 *  that will ever exist, and the write set for WP W2-B does not include track.ts.
 *  Folding them into track.ts at the seams commit would be a pure move — the
 *  metric names are already in lib/analytics/funnel.ts, which is where a reader of
 *  the funnel starts. */
import "server-only";
import { bumpDailyMetric } from "@/lib/analytics/store";
import { utcDay } from "@/lib/analytics/track";
import { METRIC_SKEN_CLAIM, METRIC_SKEN_SCAN } from "@/lib/analytics/funnel";

async function bump(metric: string): Promise<void> {
  try {
    await bumpDailyMetric(metric, utcDay());
  } catch (err) {
    console.error(`[analytics] bump ${metric} failed (non-fatal):`, err);
  }
}

/** A public website scan actually ran (counted once per generation, in the mode's
 *  prepare — after the guards passed, so a refused request is not a scan). */
export function recordSkenScan(): Promise<void> {
  return bump(METRIC_SKEN_SCAN);
}

/** A parked scan became a real, seeded project (counted in the redeem route, after
 *  the project exists — so the number is claims COMPLETED, not claims attempted). */
export function recordSkenClaim(): Promise<void> {
  return bump(METRIC_SKEN_CLAIM);
}
