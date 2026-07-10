/** The single abuse-guard sequence every paid *generation* endpoint runs (server-only).
 *
 *  `/api/ai`, `/api/images` and `/api/images/nobg` each shell out to a paid provider
 *  and were hand-assembling the identical three-step guard inline; this is the one
 *  place that sequence lives so the order can't silently drift between endpoints. In
 *  order:
 *   1. reject an oversized body from its content-length (413), before we read it;
 *   2. per-IP durable rate-limit + global daily spend ceiling (429), spendUnits: 1;
 *   3. take a process-wide concurrency slot so slow provider spawns can't stack (429).
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
import { durableGuard } from "./durable-limit";
import {
  RATE_RULES,
  acquireSlot,
  clientIp,
  payloadTooLarge,
  tooLarge,
  tooManyRequests,
} from "./rate-limit";

export async function guardPaidGeneration(
  request: Request,
  rateLimitedMessage: (retryAfter: number) => string = (s) =>
    `Příliš mnoho požadavků. Zkuste to prosím znovu za ${s} s.`
): Promise<Response | null> {
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = await durableGuard(
    clientIp(request),
    [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()],
    { spendUnits: 1 }
  );
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfter, rateLimitedMessage(limited.retryAfter));
  }
  if (!acquireSlot()) {
    return tooManyRequests(5, "Server je momentálně vytížený. Zkuste to prosím za chvíli.");
  }
  return null;
}
