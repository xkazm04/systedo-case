/** LLM-spend rollups: window filter, group-by (operation / model), totals.
 *  Pure & framework-free, tested. */
import type { SpendEntry } from "./sample";

export interface SpendTotals {
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface SpendRow extends SpendTotals {
  key: string;
}

export function filterSpend(entries: SpendEntry[], windowDays: number): SpendEntry[] {
  return windowDays > 0 ? entries.filter((e) => e.daysAgo <= windowDays) : entries;
}

export function totals(entries: SpendEntry[]): SpendTotals {
  return entries.reduce<SpendTotals>(
    (acc, e) => ({ calls: acc.calls + e.calls, tokens: acc.tokens + e.tokens, costUsd: acc.costUsd + e.costUsd }),
    { calls: 0, tokens: 0, costUsd: 0 }
  );
}

/** Group entries by a key, summing figures; rows sorted by cost desc. */
export function rollupBy(entries: SpendEntry[], keyFn: (e: SpendEntry) => string): SpendRow[] {
  const map = new Map<string, SpendRow>();
  for (const e of entries) {
    const k = keyFn(e);
    const row = map.get(k) ?? { key: k, calls: 0, tokens: 0, costUsd: 0 };
    row.calls += e.calls;
    row.tokens += e.tokens;
    row.costUsd += e.costUsd;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export const byOperation = (entries: SpendEntry[]): SpendRow[] => rollupBy(entries, (e) => e.toolId);
export const byModel = (entries: SpendEntry[]): SpendRow[] => rollupBy(entries, (e) => e.model);

/** Fraction of total cost a row represents (0 when the total is 0). */
export function costShare(row: SpendRow, total: number): number {
  return total > 0 ? row.costUsd / total : 0;
}
