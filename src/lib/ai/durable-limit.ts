/** Durable, cross-instance abuse guard for the paid AI endpoints (server-only).
 *
 *  The node:sqlite counter in ./rate-limit is per-process and, on Vercel's
 *  read-only + ephemeral serverless filesystem, effectively per-instance and
 *  short-lived — so the per-IP caps that are the ONLY budget guard for anonymous
 *  callers barely bind in production: a caller who lands on a fresh instance, or
 *  hits the app after a scale event, starts counting from zero. This backs the
 *  same fixed-window logic with Firestore (shared across every instance) and adds
 *  a GLOBAL daily spend ceiling so that even distributed abuse across many IPs
 *  can't run the provider bill past a hard cap.
 *
 *  One Firestore transaction does both checks (all reads, then all writes) so a
 *  request costs a single round-trip, and — exactly like the local limiter —
 *  NOTHING is incremented unless every check passes, so a rejected request never
 *  consumes budget. The pure decision logic lives in ./durable-limit-core so it
 *  stays unit-testable without a Firestore round-trip.
 *
 *  Availability posture:
 *   - On any Firestore error the guard falls back to the local sqlite limiter, so
 *     a store outage still throttles per-instance rather than opening the gate.
 *   - The global ceiling is fail-OPEN by default (a Firestore outage shouldn't
 *     brick a public demo, and the per-IP fallback still throttles). Set
 *     AI_CEILING_FAIL_CLOSED=1 to instead refuse paid calls when the ceiling
 *     can't be read — the stricter budget stance.
 *
 *  Tunable via env (read at call time):
 *   - AI_GLOBAL_DAILY_CEILING  total paid provider ops/day across ALL callers
 *                              before paid work is refused (default 2000; 0 = off)
 *   - AI_CEILING_FAIL_CLOSED   "1" → refuse paid calls when Firestore is unreachable
 */
import { firestore } from "@/lib/firebase";
import {
  peekRateLimit as localPeekRateLimit,
  rateLimit as localRateLimit,
  type RateRule,
  type RateResult,
} from "./rate-limit";
import {
  ceilingExceeded,
  currentCount,
  rateDocId,
  retryAfterFor,
  secondsUntilUtcMidnight,
  windowStartFor,
} from "./durable-limit-core";
import { envInt } from "@/lib/env";

const DAY = 86_400_000;
const COLL = "ratelimits";

// allowZero: a ceiling of 0 means "disabled" (see ceilingExceeded), so 0 is a valid
// configured value here — unlike the rate/byte/concurrency knobs, where 0 falls back.
const globalDailyCeiling = (): number => envInt("AI_GLOBAL_DAILY_CEILING", 2000, { allowZero: true });
const ceilingFailClosed = (): boolean => process.env.AI_CEILING_FAIL_CLOSED === "1";

/** Durable fixed-window rate limit + optional global daily spend ceiling.
 *
 *  Mirrors localRateLimit: the first exceeded rule wins, with its retry-after in
 *  seconds; counters increment only when every check passes. Pass `spendUnits` on
 *  the endpoints that actually spend on a provider so they also count toward — and
 *  are gated by — the global ceiling. Endpoints that only need throttling (a sync,
 *  an upload) omit it and skip the ceiling entirely. */
export async function durableGuard(
  ip: string,
  rules: RateRule[],
  opts: { spendUnits?: number } = {}
): Promise<RateResult> {
  const now = Date.now();
  const ceiling = globalDailyCeiling();
  const spendUnits = Math.max(0, Math.floor(opts.spendUnits ?? 0));
  const countSpend = spendUnits > 0 && ceiling > 0;

  try {
    return await firestore.runTransaction(async (tx) => {
      const buckets = rules.map((rule) => ({
        rule,
        windowStart: windowStartFor(rule, now),
        ref: firestore.collection(COLL).doc(rateDocId(rule.bucket, ip)),
      }));
      const day = new Date(now).toISOString().slice(0, 10);
      const globalRef = firestore.collection(COLL).doc(`_global_${day}`);

      // --- all reads first (Firestore requires reads before writes) ---
      const bucketSnaps = await Promise.all(buckets.map((b) => tx.get(b.ref)));
      const globalSnap = countSpend ? await tx.get(globalRef) : null;

      // --- per-IP fixed-window checks (no writes yet) ---
      const nextCounts: number[] = [];
      for (let i = 0; i < buckets.length; i++) {
        const { rule, windowStart } = buckets[i];
        const stored = bucketSnaps[i].data() as { windowStart?: number; count?: number } | undefined;
        const current = currentCount(stored, windowStart);
        if (current >= rule.limit) {
          return { ok: false, retryAfter: retryAfterFor(windowStart, rule, now) };
        }
        nextCounts[i] = current + 1;
      }

      // --- global daily ceiling ---
      const globalUsed = (globalSnap?.data()?.count as number) ?? 0;
      if (countSpend && ceilingExceeded(globalUsed, spendUnits, ceiling)) {
        return { ok: false, retryAfter: secondsUntilUtcMidnight(now) };
      }

      // --- commit (reached only when every check passed) ---
      for (let i = 0; i < buckets.length; i++) {
        const { ref, windowStart } = buckets[i];
        tx.set(
          ref,
          { windowStart, count: nextCounts[i], expireAt: new Date(windowStart + DAY) },
          { merge: true }
        );
      }
      if (countSpend) {
        tx.set(
          globalRef,
          { count: globalUsed + spendUnits, day, expireAt: new Date(now + 2 * DAY) },
          { merge: true }
        );
      }
      return { ok: true, retryAfter: 0 };
    });
  } catch (err) {
    // Firestore unavailable / misconfigured (e.g. local dev without credentials).
    // Fall back to the per-instance sqlite limiter so we still throttle, rather
    // than opening the gate — unless the operator has demanded a fail-closed
    // ceiling for spending endpoints, in which case refuse.
    console.error("[durable-limit] Firestore guard failed; using local fallback:", err);
    if (countSpend && ceilingFailClosed()) {
      return { ok: false, retryAfter: 60 };
    }
    return localRateLimit(ip, rules);
  }
}

/** Read-only peek at the durable counters: how many requests remain per rule for
 *  `ip`, WITHOUT incrementing anything — the data behind the preflight
 *  /api/ai/status endpoint. Reads the same Firestore docs durableGuard writes
 *  (plain gets, no transaction — a peek needs no atomicity), so the number the
 *  banner shows matches the budget the paid route will actually enforce. Falls
 *  back to the local sqlite peek when Firestore is unreachable, mirroring the
 *  guard's own fallback path. */
export async function peekDurableRemaining(ip: string, rules: RateRule[]): Promise<number[]> {
  const now = Date.now();
  try {
    const snaps = await Promise.all(
      rules.map((rule) => firestore.collection(COLL).doc(rateDocId(rule.bucket, ip)).get())
    );
    return rules.map((rule, i) => {
      const stored = snaps[i].data() as { windowStart?: number; count?: number } | undefined;
      const current = currentCount(stored, windowStartFor(rule, now));
      return Math.max(0, rule.limit - current);
    });
  } catch (err) {
    console.error("[durable-limit] Firestore peek failed; using local fallback:", err);
    return localPeekRateLimit(ip, rules);
  }
}
