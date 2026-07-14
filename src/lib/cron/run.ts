/** The one failure-tolerant recording helper the crons call. Recording a run must
 *  NEVER break the cron it observes, so the store write is wrapped in try/catch
 *  and a failure is logged, not thrown. Server-only (via the store). */
import { saveCronRun } from "./runs-store";
import { buildCronRunRecord, type CronRunOutcome } from "./run-record";

/** Record one cron invocation ({cron, started/finished, ok, counts, truncated
 *  results/errors}). Call once, just before the cron returns, with `startedAt`
 *  captured at the top of the handler. A storage error is swallowed (logged) so
 *  the cron's own response is unaffected. */
export async function recordCronRun(
  cron: string,
  startedAt: Date,
  outcome: CronRunOutcome
): Promise<void> {
  try {
    await saveCronRun(buildCronRunRecord(cron, startedAt, new Date(), outcome));
  } catch (err) {
    console.error(`[cron] failed to record run for ${cron}:`, err);
  }
}
