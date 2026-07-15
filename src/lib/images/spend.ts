/** How many units of the GLOBAL paid-spend ceiling one Creative Studio generation
 *  should debit — the honest charge math, kept pure and side-effect free so it is
 *  unit-testable without a Firestore round-trip.
 *
 *  The `AI_GLOBAL_DAILY_CEILING` (durable-limit.ts) tracks real *provider ops* so
 *  distributed abuse across many IPs can't run the provider bill past a hard cap.
 *  A creative request is NOT one op: it fires one Leonardo image generation PER
 *  candidate AND one Gemini vision score per candidate, so an N-candidate set is up
 *  to 2N provider calls. The shared `guardPaidGeneration` debits a flat 1 up front
 *  (it runs before the body — and therefore `count` — is known, and it must gate
 *  before any work); the route then trues that reservation up to the real figure
 *  once the set has been generated. Charging the flat 1 alone undercounted the
 *  priciest path in the app by 4–8×.
 *
 *  Charge = candidates actually generated (Leonardo calls) + one vision score per
 *  candidate WHERE scoring happened. The demo/no-key path does zero provider work,
 *  so its charge is 0 (the reservation is refunded in full). */
export function creativeSpendUnits(opts: {
  /** candidates actually generated & downloaded (one Leonardo image call each) */
  candidates: number;
  /** whether each candidate was Gemini-vision scored (one call per candidate) */
  visionScored: boolean;
}): number {
  const n = Math.max(0, Math.floor(opts.candidates));
  return n + (opts.visionScored ? n : 0);
}
