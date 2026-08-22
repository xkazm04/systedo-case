/** The single abuse-guard sequence every paid *generation* endpoint runs (server-only).
 *
 *  `/api/ai`, `/api/images` and `/api/images/nobg` each shell out to a paid provider
 *  and were hand-assembling the identical three-step guard inline; this is the one
 *  place that sequence lives so the order can't silently drift between endpoints. In
 *  order:
 *   1. reject an oversized body from its content-length (413), before we read it;
 *   2. take a process-wide concurrency slot so slow provider spawns can't stack (429);
 *   3. per-IP durable rate-limit + global daily spend ceiling (429), spendUnits: 1 —
 *      releasing the slot first if this fails.
 *
 *  The slot is acquired BEFORE the durable spend charge (a cheap in-process semaphore
 *  taken first, released on any later failure) so a server-busy rejection never commits
 *  a durable spend/rate unit for a request that did zero provider work. The old order
 *  (charge then slot) let every request that lost the 4-slot race still burn the daily
 *  spend ceiling and per-IP budget.
 *
 *  Returns the FIRST failing Response, or `null` to proceed. IMPORTANT: on a `null`
 *  return the caller has been granted a concurrency slot and MUST call `releaseSlot()`
 *  in its own `finally` (unchanged from the inline version). On any non-null return no
 *  slot was taken, so the caller must NOT release.
 *
 *  `rateLimitedMessage` builds the 429 body from the retry-after seconds — the only
 *  thing that differed across the three inline copies (the Czech noun).
 *
 *  NOT for the reference-image UPLOAD route (`/api/images/upload-ref`): that is a
 *  deliberately lighter, IP-throttle-only upload (aiPerMin only, no daily ceiling, its
 *  own multipart 8 MB file-size cap, and no concurrency slot) — a different guard
 *  class, consistent with `durableGuard`'s "an upload omits spendUnits" carve-out. */
import { durableGuard, peekDurableRemaining, peekGlobalSpend } from "./durable-limit";
import {
  RATE_RULES,
  acquireSlot,
  clientIp,
  layerForRule,
  payloadTooLarge,
  releaseSlot,
  tooLarge,
  tooManyRequests,
  type RateResult,
  type RateRule,
  type RefusalDetail,
} from "./rate-limit";

const DAY_SECONDS = 86_400;

/** Work out WHICH layer refused and where the caller stands, for the refusal body.
 *
 *  The local limiter reports this itself (`result.refusal`); the durable one cannot
 *  today — its decision happens inside a Firestore transaction whose result type is
 *  shared with the local path — so on that path we re-read the same counters through
 *  the existing read-only peeks (`peekDurableRemaining` / `peekGlobalSpend`, which
 *  already back /api/ai/status) and identify the exhausted layer by elimination: a
 *  rule with nothing remaining is the one that said no, otherwise it was the global
 *  ceiling. Two extra reads on the REFUSAL path only.
 *
 *  Best-effort by construction: any failure returns undefined and the 429 keeps its
 *  historical shape. A diagnostic must never turn a refusal into a 500. */
export async function describeRefusal(
  ip: string,
  rules: RateRule[],
  result: RateResult
): Promise<RefusalDetail | undefined> {
  if (result.refusal) return result.refusal;
  try {
    const [remaining, spend] = await Promise.all([
      peekDurableRemaining(ip, rules),
      peekGlobalSpend(),
    ]);
    for (let i = 0; i < rules.length; i++) {
      if ((remaining[i] ?? 1) > 0) continue;
      return {
        layer: layerForRule(rules[i]),
        limit: rules[i].limit,
        windowSeconds: Math.round(rules[i].windowMs / 1000),
        used: rules[i].limit,
        remaining: 0,
        bucket: rules[i].bucket,
      };
    }
    if (spend.ceiling > 0 && spend.used >= spend.ceiling) {
      return {
        layer: "global-ceiling",
        limit: spend.ceiling,
        windowSeconds: DAY_SECONDS,
        used: spend.used,
        remaining: 0,
        bucket: "_global_",
      };
    }
  } catch {
    /* peek failed — fall through to the historical, detail-free 429 */
  }
  return undefined;
}

export async function guardPaidGeneration(
  request: Request,
  rateLimitedMessage: (retryAfter: number) => string = (s) =>
    `Příliš mnoho požadavků. Zkuste to prosím znovu za ${s} s.`
): Promise<Response | null> {
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  // Take the cheap in-process slot first: if the server is at capacity we reject
  // here BEFORE any durable spend/rate unit is committed, so a lost slot race costs
  // the caller nothing.
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }
  const ip = clientIp(request);
  const rules = [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()];
  const limited = await durableGuard(ip, rules, { spendUnits: 1 });
  if (!limited.ok) {
    releaseSlot(); // no provider work will run — don't hold the slot for a 429.
    return tooManyRequests(
      limited.retryAfter,
      rateLimitedMessage(limited.retryAfter),
      await describeRefusal(ip, rules, limited)
    );
  }
  return null;
}
