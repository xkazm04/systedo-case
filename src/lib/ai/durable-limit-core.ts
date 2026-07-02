/** Pure decision helpers for the durable AI abuse guard (./durable-limit).
 *
 *  Kept free of the firebase-admin import so the fixed-window + ceiling logic is
 *  unit-testable without a Firestore round-trip (and without triggering Firebase
 *  init at module load). durable-limit.ts does the Firestore I/O and delegates
 *  every decision to these functions. */
import type { RateRule } from "./rate-limit";

/** The start of the fixed window `now` falls into, for a rule of `windowMs`. */
export function windowStartFor(rule: RateRule, now: number): number {
  return now - (now % rule.windowMs);
}

/** The effective count for a bucket: the stored count only counts if it belongs
 *  to the *current* window — a stored doc from an earlier window resets to 0. This
 *  is the bit that makes a fixed-window limiter forget old windows without needing
 *  a delete. */
export function currentCount(
  stored: { windowStart?: number; count?: number } | undefined,
  windowStart: number
): number {
  if (stored && (stored.windowStart ?? 0) >= windowStart) return stored.count ?? 0;
  return 0;
}

/** Whole seconds until the current window closes — the retry-after handed to a
 *  caller who exceeded a per-IP rule. */
export function retryAfterFor(windowStart: number, rule: RateRule, now: number): number {
  return Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
}

/** Would charging `units` push the day's total past the ceiling? A ceiling of 0
 *  (or negative) disables the check. */
export function ceilingExceeded(used: number, units: number, ceiling: number): boolean {
  return ceiling > 0 && used + units > ceiling;
}

/** Whole seconds from `now` until the next UTC midnight — the retry-after for a
 *  caller who trips the daily ceiling (it resets at the UTC day boundary, the same
 *  boundary the `_global_YYYY-MM-DD` doc id rolls on). */
export function secondsUntilUtcMidnight(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

/** Firestore document ids may not contain '/'. IPs and bucket names don't, but be
 *  defensive (and stay under the 1500-byte id limit). */
export function rateDocId(bucket: string, ip: string): string {
  return `${bucket}__${ip}`.replace(/\//g, "_").slice(0, 1400);
}
