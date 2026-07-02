/** Pure budget-mutation arithmetic (no I/O), extracted from mutations.ts so the
 *  money-moving math — micros conversion, the donor floor, and exact-revert
 *  de-duplication — is unit-testable without a live Google Ads / Firestore stack.
 *  applyBudgetShift / restoreBudgets delegate here. */
import type { BudgetSnapshot } from "./control-plane-types";

/** The donor is never dropped below this daily budget, so it keeps serving. */
export const MIN_DAILY_MICROS = 10_000_000; // 10 CZK/day

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
