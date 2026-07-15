/** Pure budget-mutation arithmetic (no I/O), extracted from mutations.ts so the
 *  money-moving math — micros conversion, the donor floor, and exact-revert
 *  de-duplication — is unit-testable without a live Google Ads / Firestore stack.
 *  applyBudgetShift / restoreBudgets delegate here. */
import type { BudgetSnapshot } from "./control-plane-types";

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

/** De-duplicate revert snapshots by budget, keeping the FIRST (prior-most) value
 *  for each — the exact inverse of an apply, with no re-flooring drift. */
export function dedupeSnapshots(snapshots: BudgetSnapshot[]): Map<string, number> {
  const byBudget = new Map<string, number>();
  for (const s of snapshots) {
    if (!byBudget.has(s.budgetResourceName)) byBudget.set(s.budgetResourceName, s.prevMicros);
  }
  return byBudget;
}
