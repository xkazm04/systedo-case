/** The `conversion-rollup` ledger step: recompute every project's conversion summary
 *  from its ledger rows, then age the old rows out. Registered in
 *  src/lib/cron/ledgers.ts — that one line in LEDGER_STEPS is the whole registration
 *  ceremony (no new route, no new `vercel.json` entry, no new guard; see WP F4).
 *
 *  Due EVERY tick, and it needs no sent-guard claim because the work is IDEMPOTENT
 *  by construction: the summary is a pure function of the retained rows written with
 *  a compare-and-swap, so running it twice produces the same blob, and the prune's
 *  second pass finds nothing left older than the cutoff.
 *
 *  WHY IT RECOMPUTES RATHER THAN ACCUMULATES. A rolling 30-day count cannot be
 *  incremented: yesterday's conversions leave the window without anything happening,
 *  so an accumulated total would only ever drift upward and would keep claiming a
 *  source is converting long after it went quiet. Recomputing from the retained rows
 *  is cheap (they are capped per project) and is the only version of this number
 *  that can go DOWN — which is what makes it honest.
 *
 *  PRUNE LAST. A prune that ran BEFORE the rollup would silently narrow the very
 *  window the rollup just read (the go-rollup precedent).
 *
 *  Bounded per tick ({@link ROLLUP_TENANT_SCAN} / {@link ROLLUP_ROW_SCAN}) so one
 *  tenant cannot consume the whole invocation — the shared 300 s budget belongs to
 *  every step. Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import {
  CONVERSION_EVENT_CAP,
  retentionCutoffDay,
  summarizeConversions,
} from "./conversion-events";
import {
  listConversionEvents,
  listConversionTenants,
  pruneConversionEvents,
} from "./conversion-store";
import { saveConversionSummary } from "./conversion-state";

/** Tenants rolled up in one tick. */
export const ROLLUP_TENANT_SCAN = 500;
/** Rows read per tenant — the per-project cap, so the summary always sees them all. */
export const ROLLUP_ROW_SCAN = CONVERSION_EVENT_CAP;

/** The step id — also the `ledger-conversion-rollup` sent-guard kind prefix, the run
 *  record's key, and the namespace its counts are reported under. */
export const CONVERSION_ROLLUP_STEP_ID = "conversion-rollup";

export const conversionRollupStep: LedgerStep = {
  id: CONVERSION_ROLLUP_STEP_ID,
  // Every tick. The numbers are a rolling window, so "due" is really "the window has
  // moved" — which it has, on every tick, by definition.
  due: () => true,
  run: (ctx) => runConversionRollup(ctx.now),
};

/** One tick's work. Never throws — the ledger runner isolates a throw anyway, but a
 *  step that reports `{ ok: false, error }` gives the run record something readable
 *  instead of a stack-trace message. */
export async function runConversionRollup(now: Date): Promise<LedgerStepResult> {
  const counts = { projects: 0, events30d: 0, pruned: 0, failed: 0 };
  let tenants;
  try {
    tenants = await listConversionTenants(ROLLUP_TENANT_SCAN);
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }

  for (const { userId, projectId } of tenants) {
    try {
      const events = await listConversionEvents(projectId, { limit: ROLLUP_ROW_SCAN });
      const summary = summarizeConversions(events, now);
      await saveConversionSummary(userId, projectId, summary);
      counts.projects++;
      counts.events30d += summary.qualified30d + summary.won30d;
    } catch (err) {
      // One tenant's unreadable ledger must not cost every other tenant its rollup —
      // the failure is counted and the loop moves on.
      counts.failed++;
      console.error(`[leads] conversion-rollup failed for ${projectId}:`, err);
    }
  }

  // Retention last (see the header).
  const cutoff = retentionCutoffDay(now);
  for (const { projectId } of tenants) {
    try {
      counts.pruned += await pruneConversionEvents(projectId, cutoff);
    } catch (err) {
      console.error(`[leads] conversion-rollup prune failed for ${projectId}:`, err);
    }
  }

  return { ok: counts.failed === 0, counts };
}
