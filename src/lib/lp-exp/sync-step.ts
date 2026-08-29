/** W3-B — the `lp-sync` ledger step: fold every hosted experiment's arm counters back
 *  into the experiment itself, then age the counters out. Registered in
 *  src/lib/cron/ledgers.ts — that one line in LEDGER_STEPS is the whole registration
 *  ceremony (no new route, no new `vercel.json` entry, no new guard; see WP F4).
 *
 *  This is the step that makes the whole work package mean something. Until it runs,
 *  a hosted page is counting views and conversions into a table nothing reads;
 *  afterwards `evaluate()`, the module's verdicts and the pattern miner are all
 *  running on REAL traffic instead of hand-typed numbers.
 *
 *  Due EVERY tick, and it needs no sent-guard claim because the work is IDEMPOTENT by
 *  construction: each arm's `visitors`/`signups` are OVERWRITTEN with the totals from
 *  the counter table, so running it twice in a row produces a byte-identical blob
 *  (the second pass finds nothing changed and does not even write). The prune is
 *  idempotent for the same reason — the second pass finds nothing older than the cut.
 *
 *  WHY IT RECOMPUTES RATHER THAN ACCUMULATES — the `rollup-step.ts:12-17` rationale,
 *  and it matters more here. An accumulated total could only ever go UP: a retention
 *  prune, a corrected double-count, a deleted arm would all leave the number claiming
 *  traffic that is no longer evidenced by anything. And these numbers are not
 *  decorative — a significant winner is mined as an account-proven creative pattern
 *  and enters live tenants' AI prompts (`patterns/extract.ts`). A number that can only
 *  grow would eventually declare a winner that the data never supported.
 *
 *  WHAT IT WILL NOT TOUCH. Hand-typed arms (no `armId`) and non-hosted experiments are
 *  left exactly as the operator entered them — see `syncArmCounts`. The operator's own
 *  numbers are not ours to rewrite, and an experiment whose page was unpublished keeps
 *  the last numbers it synced rather than decaying to zero.
 *
 *  Bounded per tick ({@link LP_SYNC_PROJECT_SCAN}) so one tenant cannot consume the
 *  whole invocation — the shared 300 s budget belongs to every step. Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import { foldArmTotals, lpRetentionCutoff } from "./counts";
import { listLpCountDays, listLpCountProjects, pruneLpCounts } from "./counts-store";
import { applyArmCounts, listExperiments } from "./store";

/** Projects visited in one tick. The work list comes from the COUNTER table, so this
 *  is "projects with hosted traffic", not "projects" — a tenant with no hosted page
 *  costs nothing at all. */
export const LP_SYNC_PROJECT_SCAN = 200;

/** The step id — also the `ledger-lp-sync` sent-guard kind prefix, the run record's
 *  key, and the namespace its counts are reported under. */
export const LP_SYNC_STEP_ID = "lp-sync";

export const lpSyncStep: LedgerStep = {
  id: LP_SYNC_STEP_ID,
  // Every tick. The counters move continuously, and the fold is cheap when they
  // haven't (an unchanged project writes nothing).
  due: () => true,
  run: (ctx) => runLpSync(ctx.now),
};

/** One tick's work. Never throws — the ledger runner isolates a throw anyway, but a
 *  step that reports `{ ok: false, error }` gives the run record something readable
 *  instead of a stack-trace message. */
export async function runLpSync(now: Date): Promise<LedgerStepResult> {
  const counts = { projects: 0, experiments: 0, views: 0, conversions: 0, pruned: 0, failed: 0 };

  let projectIds: string[];
  try {
    projectIds = await listLpCountProjects(LP_SYNC_PROJECT_SCAN);
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }

  // The window the totals are computed over is EXACTLY the window retention keeps, so
  // the number the module shows is always backed by rows that still exist.
  const since = lpRetentionCutoff(now);

  for (const projectId of projectIds) {
    try {
      const hosted = (await listExperiments(projectId)).filter((e) => e.hosted);
      if (hosted.length === 0) continue;
      counts.projects++;
      for (const exp of hosted) {
        const rows = await listLpCountDays(exp.id, since);
        const totals = foldArmTotals(rows);
        for (const t of totals.values()) {
          counts.views += t.views;
          counts.conversions += t.conversions;
        }
        await applyArmCounts(projectId, exp.id, totals);
        counts.experiments++;
      }
    } catch (err) {
      // One tenant's unreadable counters must not cost every other tenant its sync —
      // the failure is counted and the loop moves on.
      counts.failed++;
      console.error(`[lp-exp] lp-sync failed for ${projectId}:`, err);
    }
  }

  // Retention LAST: a prune that ran BEFORE the fold would silently narrow the very
  // window the fold just read, and every hosted arm would drop a day of traffic on
  // every tick.
  try {
    counts.pruned = await pruneLpCounts(since);
  } catch (err) {
    console.error("[lp-exp] lp-sync prune failed:", err);
  }

  return { ok: counts.failed === 0, counts };
}
