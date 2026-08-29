/** The ledgers cron's step registry + planner — PURE (framework-free,
 *  firebase-free, no I/O of its own), so which steps are due, how a failing step
 *  is isolated, and how the run is aggregated into a `cron_runs` record are all
 *  unit-testable without a route or a store.
 *
 *  Why a registry: every ledger-shaped background job (drain a conversion queue,
 *  retry a webhook, roll up go-link clicks, read social metrics back) wants the
 *  same three things — a schedule, a CRON_SECRET guard, and a durable run record.
 *  Giving each one its own `vercel.json` entry burns a platform cron slot per job
 *  and spreads the guard across N route files. Instead ONE guarded route
 *  (`/api/cron/ledgers`) iterates this registry, so a later WP ships a step by
 *  appending to {@link LEDGER_STEPS} and NOBODY edits `vercel.json` again.
 *
 *  The two invariants that make that safe:
 *   1. **Failure isolation.** One step throwing, rejecting or returning
 *      `{ ok: false }` never stops the others — {@link runLedgerSteps} runs each
 *      inside its own try/catch and turns a throw into an error row.
 *   2. **Durable per-step timestamps.** `CronRunOutcome.counts` is
 *      `Record<string, number>` and cannot carry an ISO string, so each step's
 *      `lastRunAt` rides in the record's `results` payload
 *      ({@link LedgerStepRow}) and is read back by {@link lastRunsFromRecords}.
 *      A step that was NOT due this run keeps its previous timestamp — the row is
 *      re-emitted with `skipped: true` — so a due-gate that spans several runs
 *      does not reset itself every tick. */
import type { CronRunRecord } from "./run-record";
import { webhookRetryStep } from "@/lib/outbound/retry-step";

/** The cron name this registry runs under — the `cron` key of its run records,
 *  the `vercel.json` path's last segment, and the `/api/health` staleness key. */
export const LEDGERS_CRON = "ledgers";

/** What one step reports about its own work. `counts` is the step's headline
 *  tallies (e.g. `{ drained: 12, failed: 0 }`); they are namespaced per step
 *  before they enter the run record, so two steps may use the same key names. */
export interface LedgerStepResult {
  ok: boolean;
  counts: Record<string, number>;
  error?: string;
}

/** One registered ledger step. */
export interface LedgerStep {
  /** Stable id — the record/response key and the `ledger-<id>` sent-guard kind.
   *  Keep it slash-free and kebab-case: it becomes a Firestore document id in the
   *  sent-guard backend, where `/` would be a path separator. */
  id: string;
  /** Is this step due? `lastRunAt` is the ISO time the step last actually RAN
   *  (null when it never has, or when the record has aged out of retention).
   *  Must be pure and cheap — it is called on every tick, before any work. */
  due(now: Date, lastRunAt: string | null): boolean;
  /** Do the work. Should resolve `{ ok: false, error }` for an expected failure;
   *  a throw is caught and recorded too, so neither can stop a sibling step. */
  run(ctx: { now: Date; startedAt: Date }): Promise<LedgerStepResult>;
}

/** One step's row in the run record's `results` payload. It doubles as the
 *  durable per-step `lastRunAt` store — see the module note. */
export interface LedgerStepRow {
  step: string;
  ok: boolean;
  /** true when the step was not due this tick (the row only carries forward its
   *  previous `lastRunAt`; `counts` is empty and `ok` is true — not-due is not a
   *  failure). */
  skipped?: boolean;
  counts: Record<string, number>;
  error?: string;
  /** ISO time this step last actually ran, or null if it never has. */
  lastRunAt: string | null;
}

/** The `{ [stepId]: counts | { error } }` projection the route returns. */
export type LedgerStepReport = Record<string, Record<string, number> | { error: string }>;

/** The heartbeat step: due every tick, does nothing but succeed. It exists so the
 *  pipe (guard → plan → run → record → health) is PROVEN in production from the
 *  first deploy, before any business step registers: a `ledgers` row appearing in
 *  `cron_runs` every half hour, and `/api/health` never listing `ledgers` as
 *  stale, is the end-to-end evidence the schedule actually fires. */
export const heartbeatStep: LedgerStep = {
  id: "heartbeat",
  due: () => true,
  run: async () => ({ ok: true, counts: { beats: 1 } }),
};

/** Every registered step, in run order. Later WPs append here — that is the whole
 *  registration ceremony; no route, schedule or guard changes. */
export const LEDGER_STEPS: readonly LedgerStep[] = [heartbeatStep, webhookRetryStep];

/** Which steps are due right now. Pure: same inputs → same list, so a step's
 *  cadence is testable without a clock.
 *
 *  A `due()` that THROWS is treated as not-due rather than being allowed to abort
 *  the tick — the planner runs before any try/catch the executor provides, so a
 *  buggy predicate would otherwise take every sibling step down with it. The step
 *  simply does not run this tick; the next one re-asks. */
export function planLedgerSteps(
  steps: readonly LedgerStep[],
  now: Date,
  lastRuns: Record<string, string | null>
): LedgerStep[] {
  return steps.filter((s) => {
    try {
      return s.due(now, lastRuns[s.id] ?? null);
    } catch {
      return false; // a broken predicate skips its own step, never the run
    }
  });
}

/** Run each due step in sequence, isolated. A throw, a rejection, or a returned
 *  `{ ok: false }` all become one row; the loop always visits every step. Steps
 *  run SERIALLY on purpose: they share the same serverless invocation's CPU and
 *  the same stores, and a ledger drain is I/O-bound bookkeeping, not a fan-out. */
export async function runLedgerSteps(
  steps: readonly LedgerStep[],
  ctx: { now: Date; startedAt: Date }
): Promise<LedgerStepRow[]> {
  const rows: LedgerStepRow[] = [];
  for (const step of steps) {
    const lastRunAt = ctx.now.toISOString(); // it ran this tick, ok or not
    try {
      const result = await step.run(ctx);
      rows.push({
        step: step.id,
        ok: result.ok,
        counts: result.counts ?? {},
        ...(result.error ? { error: result.error } : {}),
        lastRunAt,
      });
    } catch (err) {
      rows.push({
        step: step.id,
        ok: false,
        counts: {},
        error: err instanceof Error ? err.message : String(err),
        lastRunAt,
      });
    }
  }
  return rows;
}

/** Fold this tick's rows plus the steps that were NOT due into the single
 *  `CronRunOutcome` the recorder persists, and the `{ steps }` projection the
 *  route returns.
 *
 *  `counts` carries the headline tallies (`steps`/`ran`/`failed`/`skipped`) plus
 *  every ran step's own counts namespaced `"<id>.<key>"`, so two steps may both
 *  report `failed` without colliding. `results` holds one {@link LedgerStepRow}
 *  per REGISTERED step — including the not-due ones, whose previous `lastRunAt`
 *  is carried forward so the due-gate survives across ticks. */
export function aggregateLedgerRun(
  registered: readonly LedgerStep[],
  rows: LedgerStepRow[],
  lastRuns: Record<string, string | null>
): { ok: boolean; counts: Record<string, number>; results: LedgerStepRow[]; errors: LedgerStepRow[]; steps: LedgerStepReport } {
  const ran = new Map(rows.map((r) => [r.step, r]));
  const results: LedgerStepRow[] = registered.map(
    (s) =>
      ran.get(s.id) ?? {
        step: s.id,
        ok: true,
        skipped: true,
        counts: {},
        lastRunAt: lastRuns[s.id] ?? null,
      }
  );
  // A row for a step that is no longer registered (mid-deploy, or a step removed
  // between ticks) is still reported rather than dropped on the floor.
  for (const r of rows) if (!registered.some((s) => s.id === r.step)) results.push(r);

  const counts: Record<string, number> = {
    steps: registered.length,
    ran: rows.length,
    failed: rows.filter((r) => !r.ok).length,
    skipped: results.filter((r) => r.skipped).length,
  };
  for (const r of rows) for (const [k, v] of Object.entries(r.counts)) counts[`${r.step}.${k}`] = v;

  const steps: LedgerStepReport = {};
  for (const r of rows) steps[r.step] = r.ok ? r.counts : { error: r.error ?? "failed" };

  return { ok: rows.every((r) => r.ok), counts, results, errors: rows.filter((r) => !r.ok), steps };
}

/** Read each step's durable `lastRunAt` back out of the cron run records — the
 *  newest `ledgers` record wins (records are the bounded, retention-capped trace
 *  the store already keeps, so this needs no table of its own). A step with no
 *  row, an unrecognisable row, or no record at all reads as null → `due()` sees
 *  "never ran", which is the safe default for a first deploy and after retention
 *  ages the history out. */
export function lastRunsFromRecords(
  records: readonly CronRunRecord[],
  cron: string = LEDGERS_CRON
): Record<string, string | null> {
  let newest: CronRunRecord | undefined;
  for (const r of records) {
    if (r.cron !== cron) continue;
    if (!newest || r.finishedAt > newest.finishedAt) newest = r;
  }
  const out: Record<string, string | null> = {};
  for (const row of newest?.results ?? []) {
    if (!row || typeof row !== "object") continue;
    const { step, lastRunAt } = row as { step?: unknown; lastRunAt?: unknown };
    if (typeof step !== "string" || !step) continue;
    out[step] = typeof lastRunAt === "string" ? lastRunAt : null;
  }
  return out;
}
