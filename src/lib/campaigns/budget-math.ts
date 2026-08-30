/** Pure budget-mutation arithmetic (no I/O), extracted from mutations.ts so the
 *  money-moving math — micros conversion, the donor floor, and exact-revert
 *  de-duplication — is unit-testable without a live Google Ads / Firestore stack.
 *  applyBudgetShift / restoreBudgets delegate here. */
import type { GoogleBudgetSnapshot, SklikBudgetSnapshot } from "./control-plane-types";

/** The donor is never dropped below this daily budget, so it keeps serving. */
export const MIN_DAILY_MICROS = 10_000_000; // 10 CZK/day

/** The same floor in whole CZK/day — the unit the (period-total) recommender and
 *  its value estimate reason in, so the projection can be floored consistently
 *  with what the live mutation will actually move. */
export const MIN_DAILY_CZK = MIN_DAILY_MICROS / 1_000_000; // 10 CZK/day

/** The most of a requested period reallocation the live mutation can actually move
 *  off a donor. `applyBudgetShift` floors the donor's DAILY budget at
 *  MIN_DAILY_CZK, so over the synced period at most `(budgetPerDay − MIN_DAILY_CZK)
 *  × days` can leave the donor — a projection built on the full requested amount
 *  over-promises whenever that floor would bite. Returns the requested amount
 *  unchanged when the donor's daily budget is unknown (older synced docs carry no
 *  budgetPerDay) or the day count is unknown — there is nothing to floor against,
 *  so the pre-floor behaviour is preserved byte-for-byte. Never negative. */
export function movableAmount(
  requested: number,
  budgetPerDay: number | undefined,
  days: number | undefined
): number {
  const amount = Math.max(0, requested);
  if (typeof budgetPerDay !== "number" || budgetPerDay <= 0 || typeof days !== "number" || days <= 0) {
    return amount;
  }
  const giveable = Math.max(0, (budgetPerDay - MIN_DAILY_CZK) * days);
  return Math.min(amount, giveable);
}

/** A recommended move's `amount` is a period total (CZK); convert it to the daily
 *  micros delta to apply, over the synced period length in days. */
export function computeDailyMicros(amount: number, days: number): number {
  return Math.round((amount / days) * 1_000_000);
}

export interface BudgetMovePlan {
  /** donor's new (floored) daily budget in micros */
  fromNew: number;
  /** recipient's new daily budget in micros */
  toNew: number;
  /** micros actually moved (may be less than requested once the donor floors) */
  movedMicros: number;
}

/** Lower the donor by `dailyMicros` (never below the floor) and raise the
 *  recipient by exactly what was taken — so the two budgets net out and the
 *  recipient only ever gains what the donor actually gave up. Returns
 *  `{ error: "at_min" }` when the donor is already at/below the floor so nothing
 *  can move. */
export function planBudgetMove(params: {
  dailyMicros: number;
  fromMicros: number;
  toMicros: number;
  minDailyMicros?: number;
}): BudgetMovePlan | { error: "at_min" } {
  const min = params.minDailyMicros ?? MIN_DAILY_MICROS;
  const fromNew = Math.max(min, params.fromMicros - params.dailyMicros);
  const movedMicros = params.fromMicros - fromNew;
  if (movedMicros <= 0) return { error: "at_min" };
  return { fromNew, toNew: params.toMicros + movedMicros, movedMicros };
}

/** De-duplicate GOOGLE revert snapshots by budget resource, keeping the FIRST
 *  (prior-most) value for each — the exact inverse of an apply, with no re-flooring
 *  drift.
 *
 *  WP S1 made {@link BudgetSnapshot} a per-platform union, and the de-dupe KEY is
 *  what has to become platform-aware: two campaigns on different networks can share
 *  an id, and only Google has a budget resource at all. Rather than key a single map
 *  on a synthetic `platform + id` string, `restoreBudgets` partitions first
 *  (`partitionBudgetSnapshots`) and de-dupes each group with its own natural key —
 *  which keeps THIS function's key, value and behaviour exactly what they were, so
 *  the Google restore (and the audit doc's `budgets:` array of resource names) is
 *  unchanged down to the byte. */
export function dedupeSnapshots(snapshots: GoogleBudgetSnapshot[]): Map<string, number> {
  const byBudget = new Map<string, number>();
  for (const s of snapshots) {
    if (!byBudget.has(s.budgetResourceName)) byBudget.set(s.budgetResourceName, s.prevMicros);
  }
  return byBudget;
}

/** The Sklik half of {@link dedupeSnapshots}: keyed by CAMPAIGN id (Sklik has no
 *  budget resource — the daily cap lives on the campaign), valued in native CZK.
 *  Same first-wins rule, for the same reason. */
export function dedupeSklikSnapshots(snapshots: SklikBudgetSnapshot[]): Map<string, number> {
  const byCampaign = new Map<string, number>();
  for (const s of snapshots) {
    if (!byCampaign.has(s.campaignId)) byCampaign.set(s.campaignId, s.prevDayBudgetCzk);
  }
  return byCampaign;
}

/** CZK ⇄ micros for the shared budget planner. `planBudgetMove` (and therefore the
 *  MIN_DAILY_CZK donor floor) is the ONE piece of budget arithmetic both networks
 *  run through, so the Sklik path lifts its native-CZK budgets into micros, plans,
 *  and comes back down — instead of forking the floor into a second constant that
 *  could drift from this one. */
export function czkToMicros(czk: number): number {
  return Math.round(czk * 1_000_000);
}
