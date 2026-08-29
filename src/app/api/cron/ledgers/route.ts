/** Scheduled ledgers tick: ONE guarded route that runs every registered step
 *  whose `due()` says so. The five older crons each own a `vercel.json` entry;
 *  every future ledger-shaped job (conversion drain, webhook retry, go-link
 *  rollup, social read-back) instead registers itself in
 *  `src/lib/cron/ledgers.ts` — this route needs no change, and neither does the
 *  schedule.
 *
 *  One `cron_runs` row per invocation carries the per-step counts AND each step's
 *  `lastRunAt` (in the results payload — see the registry module note), which is
 *  what the next tick reads back to answer `due()`. A step that throws is
 *  recorded and skipped over; it can never stop a sibling.
 *
 *  Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer token; the guard
 *  fails CLOSED when the env var is unset). Schedule lives in vercel.json. */
import { cronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron/run";
import { listRecentCronRuns } from "@/lib/cron/runs-store";
import {
  LEDGERS_CRON,
  LEDGER_STEPS,
  aggregateLedgerRun,
  lastRunsFromRecords,
  planLedgerSteps,
  runLedgerSteps,
} from "@/lib/cron/ledgers";

// steps run serially and may fan out over tenants
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const now = startedAt;

  // Per-step `lastRunAt` from the newest `ledgers` record. Best-effort: a store
  // hiccup degrades to "nothing ever ran", which makes every step due — a step
  // that re-runs early is the recoverable outcome; a read error that skips the
  // whole tick silently is not.
  let lastRuns: Record<string, string | null> = {};
  try {
    lastRuns = lastRunsFromRecords(await listRecentCronRuns(), LEDGERS_CRON);
  } catch (err) {
    console.error("[cron] ledgers: failed to read last-run marks:", err);
  }

  const dueSteps = planLedgerSteps(LEDGER_STEPS, now, lastRuns);
  const rows = await runLedgerSteps(dueSteps, { now, startedAt });
  const { ok, counts, results, errors, steps } = aggregateLedgerRun(LEDGER_STEPS, rows, lastRuns);

  // Durable run record: the per-step counts for the operator, and the per-step
  // lastRunAt this route reads back on the next tick. recordCronRun swallows its
  // own storage errors, so bookkeeping can never fail the cron.
  await recordCronRun(LEDGERS_CRON, startedAt, { ok, counts, results, errors });

  return Response.json({ ok, steps });
}
