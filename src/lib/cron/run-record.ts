/** Durable cron run records — the PURE shapes + helpers (framework-free,
 *  firebase-free, no I/O), so the record shape, its truncation, and the
 *  /api/health projection are unit-testable in isolation. The store (both
 *  backends) and the failure-tolerant recording helper live alongside. */

/** How many runs are retained per cron (enforced on write by the store). */
export const CRON_RUN_RETENTION = 20;

/** Caps on the durable results/errors snapshot so one record can't grow
 *  unbounded — the cron's own JSON response carries the full detail; the record
 *  keeps a bounded trace for "did last night's run deliver?". */
export const MAX_RECORD_RESULTS = 20;
export const MAX_RECORD_ERRORS = 20;

/** What a cron reports about one invocation to the recorder. */
export interface CronRunOutcome {
  /** true when no tenant failed (the cron's own success criterion) */
  ok: boolean;
  /** headline tallies for the run (e.g. { synced, failed, alerted }) */
  counts: Record<string, number>;
  /** per-tenant result rows (truncated into the record) */
  results?: unknown[];
  /** failure rows / messages (truncated into the record) */
  errors?: unknown[];
}

/** One persisted record per cron invocation. */
export interface CronRunRecord {
  id: string;
  cron: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  counts: Record<string, number>;
  results: unknown[];
  errors: unknown[];
  /** true when results/errors were capped (the full set was larger) */
  truncated: boolean;
}

/** The last-run-per-cron shape /api/health surfaces. */
export interface CronHealth {
  cron: string;
  finishedAt: string;
  ok: boolean;
  durationMs: number;
  counts: Record<string, number>;
}

/** Build a bounded, serialisable record from a run's start/finish + outcome.
 *  Pure: no clock, no id-source beyond what's passed (finishedAt seeds the id),
 *  so it's deterministic to test. */
export function buildCronRunRecord(
  cron: string,
  startedAt: Date,
  finishedAt: Date,
  outcome: CronRunOutcome
): CronRunRecord {
  const results = outcome.results ?? [];
  const errors = outcome.errors ?? [];
  return {
    id: `${cron}_${finishedAt.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    cron,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    ok: outcome.ok,
    counts: outcome.counts ?? {},
    results: results.slice(0, MAX_RECORD_RESULTS),
    errors: errors.slice(0, MAX_RECORD_ERRORS),
    truncated: results.length > MAX_RECORD_RESULTS || errors.length > MAX_RECORD_ERRORS,
  };
}

/** Reduce a flat list of records to the single most-recent run per cron, for the
 *  operator health probe. Sorted by cron name for a stable projection. */
export function projectCronHealth(runs: CronRunRecord[]): CronHealth[] {
  const latest = new Map<string, CronRunRecord>();
  for (const r of runs) {
    const cur = latest.get(r.cron);
    if (!cur || r.finishedAt > cur.finishedAt) latest.set(r.cron, r);
  }
  return [...latest.values()]
    .map((r) => ({
      cron: r.cron,
      finishedAt: r.finishedAt,
      ok: r.ok,
      durationMs: r.durationMs,
      counts: r.counts,
    }))
    .sort((a, b) => a.cron.localeCompare(b.cron));
}

/** Keep the newest `retention` records per cron — the pure retention decision the
 *  store applies on write (returns the ids to DELETE). */
export function recordsToEvict(
  existing: { id: string; cron: string; finishedAt: string }[],
  retention: number = CRON_RUN_RETENTION
): string[] {
  const byCron = new Map<string, { id: string; finishedAt: string }[]>();
  for (const r of existing) {
    const list = byCron.get(r.cron) ?? [];
    list.push({ id: r.id, finishedAt: r.finishedAt });
    byCron.set(r.cron, list);
  }
  const evict: string[] = [];
  for (const list of byCron.values()) {
    list.sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : a.finishedAt > b.finishedAt ? -1 : 0));
    for (const r of list.slice(retention)) evict.push(r.id);
  }
  return evict;
}
