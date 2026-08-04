/** Anti-abuse floor for the BYOM "probe" surfaces — the two routes that make a
 *  REAL provider call on demand: `POST /api/byom/validate` (test connection) and
 *  the post-store test inside `POST /api/byom/keys`. Not a route file (the app
 *  router only mounts `route.ts`), just a helper the sibling routes import.
 *  Server-only.
 *
 *  WHY a separate guard instead of `guardPaidGeneration`: that sequence exists to
 *  protect the APP's provider budget, and its third step charges the GLOBAL daily
 *  spend ceiling (`durableGuard({ spendUnits: 1 })`). A BYOM probe spends the
 *  USER's own provider credit, so putting it on the shared app ceiling would let a
 *  paying customer testing their own key exhaust the budget that guards everyone
 *  else's generations — the exact inversion we do not want. The concurrency slot is
 *  likewise skipped: it is a 4-wide process-global semaphore sized for the app's
 *  generation traffic, and letting a key test 429 a real generation would be a
 *  regression, not a guard.
 *
 *  What remains is the honest need: this is an authenticated, unmetered, real
 *  provider-call surface that today is bounded by nothing at all. So the floor is
 *  PER-USER (these routes are authed and entitlement-gated — the user id is the
 *  right actor key; an IP key would both punish an office NAT and be weaker than an
 *  identity we already have), built on the same durable limiter every other paid
 *  route uses (`durableGuard`, minus `spendUnits`), and returns the same
 *  `tooManyRequests` 429 envelope (`code: "rate_limited"` + `retryAfter`), which
 *  the settings UI localizes by code.
 *
 *  The caps are deliberately far above any human "paste key, test, fix model, test
 *  again" loop, so normal single-key validation is unaffected. */
import { durableGuard } from "@/lib/ai/durable-limit";
import { tooManyRequests, type RateRule } from "@/lib/ai/rate-limit";
import { envInt } from "@/lib/env";

const MIN = 60_000;
const DAY = 86_400_000;

/** Per-user caps for the BYOM probe surfaces, built lazily so env overrides are
 *  read at call time (same idiom as RATE_RULES / WORKSPACE_RATE). One bucket pair
 *  shared by BOTH probe routes — see `guardByomProbe`. */
export const BYOM_PROBE_RATE = {
  perMin: (): RateRule => ({
    bucket: "byom-probe:min",
    limit: envInt("BYOM_PROBE_PER_MIN", 6),
    windowMs: MIN,
  }),
  perDay: (): RateRule => ({
    bucket: "byom-probe:day",
    limit: envInt("BYOM_PROBE_PER_DAY", 60),
    windowMs: DAY,
  }),
};

/** Take a probe slot for `userId`, or return a ready 429 the caller returns as-is.
 *
 *  BOTH probe routes share this one bucket pair on purpose: `POST /api/byom/keys`
 *  re-tests the key it just stored, so a separate (or absent) budget there would be
 *  a trivial bypass — re-POSTing the same key drives exactly the same provider call
 *  as `/validate`. Sharing means "N provider probes per user per window", however
 *  the user gets to them.
 *
 *  Nothing is charged when the check fails (durableGuard only commits when every
 *  rule passes), so a throttled caller never deepens their own hole. */
export async function guardByomProbe(userId: string): Promise<Response | null> {
  const limited = await durableGuard(`user:${userId}`, [
    BYOM_PROBE_RATE.perMin(),
    BYOM_PROBE_RATE.perDay(),
  ]);
  if (limited.ok) return null;
  // Czech is the source-of-truth copy; the client switches on `code: "rate_limited"`
  // (+ `retryAfter`) to render the localized string, per the BYOM code envelope.
  return tooManyRequests(
    limited.retryAfter,
    `Příliš mnoho testů klíče. Zkuste to prosím znovu za ${limited.retryAfter} s.`
  );
}
