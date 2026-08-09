/** Bounded-concurrency task pool for the week planner's batch run — pure and
 *  framework-free so the scheduling arithmetic (wall time, fail-fast, indexing) is
 *  unit-testable offline.
 *
 *  Why a pool and not Promise.all: planWeek used to serialize up to 28 round-trips
 *  (7 AI drafts, each followed by its post saves) — minutes of wall time. Full
 *  parallelism is the wrong fix: the server's generation semaphore is 4-wide
 *  ACROSS ALL USERS (AI_MAX_CONCURRENT), so one browser firing 7 drafts at once
 *  would starve everyone else and trip its own per-minute IP budget faster. A
 *  small bound keeps the batch a polite tenant of shared capacity.
 *
 *  FAIL-FAST: the first rejection stops LAUNCHING new tasks (mirroring the serial
 *  loop's early break on a 429/500) but lets in-flight tasks settle, so their
 *  results are never lost — the caller can report exactly which items completed.
 *  Results and errors are indexed by item, not by completion order. */

export interface PoolOutcome<R> {
  /** per-item result — null where the task failed or was never launched */
  results: (R | null)[];
  /** per-item rejection — null where the task succeeded or was never launched */
  errors: (unknown | null)[];
  /** indices whose task resolved */
  succeeded: number[];
  /** true when at least one launched task rejected */
  failed: boolean;
  /** how many tasks were actually launched (fail-fast may skip the tail) */
  launched: number;
}

export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PoolOutcome<R>> {
  const width = Math.max(1, Math.floor(limit));
  const results: (R | null)[] = items.map(() => null);
  const errors: (unknown | null)[] = items.map(() => null);
  const done: boolean[] = items.map(() => false);
  let next = 0;
  let launched = 0;
  let failed = false;

  async function lane(): Promise<void> {
    while (!failed && next < items.length) {
      const i = next++;
      launched++;
      try {
        results[i] = await worker(items[i]!, i);
        done[i] = true;
      } catch (err) {
        errors[i] = err ?? new Error("pool task failed");
        failed = true; // stop launching; in-flight lanes settle on their own
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => lane()));

  const succeeded = items.map((_, i) => i).filter((i) => done[i]);
  return { results, errors, succeeded, failed, launched };
}
