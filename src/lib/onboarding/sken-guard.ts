/** The per-IP daily cap on the PUBLIC website scan (`onboarding-scan-public`).
 *
 *  The authed `onboarding-scan` mode's guard is a sign-in wall: an anonymous caller
 *  must not be able to make the server fetch a URL of their choosing, let alone
 *  spend on a provider. `/sken` removes that wall on purpose — the whole point is a
 *  prospect with no account getting a real answer — so something else has to bound
 *  it, and this is that something.
 *
 *  It is an ADDITION, not a replacement. Every POST /api/ai already passes
 *  `guardPaidGeneration` (body cap → concurrency slot → per-IP minute + day →
 *  global daily spend ceiling). This adds ONE more rule on its own bucket, so a
 *  visitor who has burned their five public scans still cannot borrow the general
 *  `ai:day` budget, and a burst of anonymous scans still cannot outrun the shared
 *  ceiling. No `spendUnits` here — the ceiling was already charged by
 *  `guardPaidGeneration` for this same request, and charging twice would make the
 *  public path cost double against a budget it does not spend double of.
 *
 *  `durableGuard` is imported LAZILY: it pulls firebase-admin transitively, and this
 *  module is also the unit-testable seam (the tests hand in a fake guard), so the
 *  import must not happen just because the module was loaded. */
import { RATE_RULES, tooManyRequests, type RateResult, type RateRule } from "@/lib/ai/rate-limit";

/** The slice of the /api/ai DispatchCtx this guard reads. Structural on purpose —
 *  the mode table hands it the whole ctx, a test hands it two fields. */
export interface SkenGuardCtx {
  /** the caller's IP as resolved by `clientIp(request)` in the route. Absent means
   *  the dispatch context never carried one, which must NOT open the gate: every
   *  such caller then shares one "unknown" bucket, exactly like `clientIp`'s own
   *  missing-header fallback. */
  ip?: string;
}

type GuardFn = (ip: string, rules: RateRule[]) => Promise<RateResult>;

async function defaultGuard(ip: string, rules: RateRule[]): Promise<RateResult> {
  const { durableGuard } = await import("@/lib/ai/durable-limit");
  return durableGuard(ip, rules);
}

/** Czech, because every other /api/ai refusal string is (the client maps `code`,
 *  not the text). Names the enforced number so the message and the rule cannot
 *  drift apart. */
const message = (limit: number): string =>
  `Denní limit bezplatných skenů je vyčerpaný (${limit} za den z jedné adresy). ` +
  `Zkuste to zítra, nebo si založte účet a skenujte z aplikace.`;

/** Null → proceed. A Response → the caller is over the public-scan cap; it carries
 *  `retryAfter` plus the full refusal detail (which layer, what the allowance is,
 *  where the caller stands) so the client can count down instead of guessing.
 *
 *  `durableGuard` does not populate `refusal` on its Firestore path (only the local
 *  fallback limiter does), so the detail is reconstructed from the rule that was
 *  actually enforced — the same rule object, so it cannot describe a different
 *  allowance than the one that refused. */
export async function guardSkenDaily(
  ctx: SkenGuardCtx,
  deps: { guard?: GuardFn; rule?: RateRule } = {}
): Promise<Response | null> {
  const rule = deps.rule ?? RATE_RULES.skenPerDay();
  const guard = deps.guard ?? defaultGuard;
  const ip = ctx.ip?.trim() || "unknown";

  const res = await guard(ip, [rule]);
  if (res.ok) return null;

  return tooManyRequests(
    res.retryAfter,
    message(rule.limit),
    res.refusal ?? {
      layer: "per-ip-day",
      limit: rule.limit,
      windowSeconds: Math.round(rule.windowMs / 1000),
      used: rule.limit,
      remaining: 0,
      bucket: rule.bucket,
    }
  );
}
