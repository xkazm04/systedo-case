/** W3-B — the ASSIGNMENT half of a hosted landing-page experiment: which arm does
 *  this request see, and what identity does that arm carry. Pure and framework-free
 *  (the RNG is injected), so the uniformity claim below is a unit test rather than a
 *  hope, and the public renderer imports no policy it cannot be tested without.
 *
 *  WHY THE SPLIT IS STATELESS. Nothing in this product sets a measurement cookie —
 *  the analytics store and the `/go/{id}` redirect both say so in their headers and
 *  both mean it (`analytics/track.ts:6-9`, `go/[id]/route.ts:19-20`). Sticky
 *  assignment needs per-visitor state: a cookie, a fingerprint, or a stored id. We
 *  keep none of those, so assignment is per REQUEST.
 *
 *  What that costs, stated plainly: a returning visitor may be shown a different arm
 *  than last time, so this measures "which page converts a visit", not "which page
 *  converts a person". What it does NOT cost is correctness of the arithmetic —
 *  every VIEW is its own trial, the served arm's id rides the rendered page into the
 *  conversion beacon, and a conversion is therefore attributed to the arm that was
 *  actually on screen when it happened. The conversion rate each arm reports is the
 *  rate for the pages it actually served. `evaluate()` reads exactly that.
 *
 *  The honest residual is a repeat visitor who sees arm A, leaves, comes back to arm B
 *  and converts: B gets the credit for a decision A may have started. That is the same
 *  trade every cookieless split makes, it does not bias toward any particular arm
 *  (assignment is uniform and independent of history), and it is disclosed on the page
 *  itself rather than only here. */

/** Anything that can hand back a number in [0,1) — `Math.random` in production, a
 *  deterministic sequence in the tests that pin uniformity. */
export type Rng = () => number;

/** The minimum an arm must carry to be servable: an identity to count against. */
export interface ServableArm {
  armId: string;
}

/** Pick ONE arm uniformly at random. Returns null for an empty list — the renderer
 *  turns that into a 404 rather than a blank public page.
 *
 *  Uniform means uniform: `Math.floor(r * n)` over a well-distributed r, with the
 *  r === 1 edge (a badly-behaved injected RNG) clamped to the last index instead of
 *  running off the end. No weighting, no ramping, no epsilon-greedy — a split that
 *  quietly re-weights itself toward the arm that is winning so far is how an A/B test
 *  turns into a self-fulfilling prophecy, and `evaluate()`'s significance math assumes
 *  equal, independent allocation. */
export function pickArm<T extends ServableArm>(arms: readonly T[], rng: Rng = Math.random): T | null {
  if (arms.length === 0) return null;
  const r = rng();
  const i = Number.isFinite(r) ? Math.floor(Math.max(0, Math.min(0.999999999, r)) * arms.length) : 0;
  return arms[Math.min(i, arms.length - 1)] ?? null;
}

/** Mint a fresh arm identity. Opaque and random rather than derived from the label:
 *  a derived id would change when the operator renames an arm, silently orphaning
 *  every counter row already attributed to it. Bounded well under ARM_ID_MAX. */
export function mintArmId(rng: Rng = Math.random): string {
  return `a${Math.floor(rng() * 0xfffffff).toString(36)}${Date.now().toString(36).slice(-4)}`;
}

/** Is `armId` one this payload actually serves? The convert beacon's whole
 *  authorization check: an id the page never rendered is not a conversion, it is a
 *  probe, and the route answers it with the same silent 204 either way. */
export function isServedArm(arms: readonly ServableArm[], armId: string): boolean {
  return arms.some((a) => a.armId === armId);
}
