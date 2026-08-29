/** The `go-rollup` ledger step: fold every project's `/go` click counters into its
 *  per-channel outcomes, then age the counters out. Registered in
 *  src/lib/cron/ledgers.ts — that one line in LEDGER_STEPS is the whole registration
 *  ceremony (no new route, no new `vercel.json` entry, no new guard; see WP F4).
 *
 *  Due EVERY tick, and it needs no sent-guard claim because the work is IDEMPOTENT
 *  by construction: the rollup is a pure function of the counters, written with a
 *  compare-and-swap, so running it twice in a row produces the same blob. The prune
 *  is idempotent for the same reason — the second pass finds nothing left older than
 *  the cutoff.
 *
 *  WHY IT RECOMPUTES RATHER THAN ACCUMULATES. A rolling 7-day/30-day number cannot
 *  be incremented: yesterday's clicks leave the window without anything happening,
 *  so an accumulated total would only ever drift upward and would silently keep
 *  claiming a channel is measured long after it went quiet. Recomputing from the
 *  retained counters is cheap (the links are capped per project) and is the only
 *  version of this number that can go DOWN, which is what makes it honest.
 *
 *  Bounded per tick ({@link ROLLUP_LINK_SCAN}) so one tenant cannot consume the whole
 *  invocation — the shared 300 s budget belongs to every step. Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import {
  CLICK_WINDOW_30,
  retentionCutoff,
  rollupChannelOutcomes,
  windowStart,
  type GoLink,
} from "./outcomes";
import { listAllGoLinks, listGoClickDays, pruneGoClicks } from "./outcomes-store";
import { saveOrganicOutcomes } from "./outcomes-state";

/** Links read across all tenants in one tick. GO_LINK_CAP is 200 per project, so
 *  this is ~10 fully-saturated projects' worth per tick at a half-hourly cadence. */
export const ROLLUP_LINK_SCAN = 2000;

/** The step id — also the `ledger-go-rollup` sent-guard kind prefix, the run
 *  record's key, and the namespace its counts are reported under. */
export const GO_ROLLUP_STEP_ID = "go-rollup";

export const goRollupStep: LedgerStep = {
  id: GO_ROLLUP_STEP_ID,
  // Every tick. The numbers are a rolling window, so "due" is really "the window
  // has moved" — which it has, on every tick, by definition.
  due: () => true,
  run: (ctx) => runGoRollup(ctx.now),
};

/** Group a flat link page by its owning (userId, projectId). */
function byProject(links: readonly GoLink[]): Map<string, GoLink[]> {
  const out = new Map<string, GoLink[]>();
  for (const link of links) {
    if (!link.projectId || !link.userId) continue;
    const key = `${link.userId} ${link.projectId}`;
    const bucket = out.get(key);
    if (bucket) bucket.push(link);
    else out.set(key, [link]);
  }
  return out;
}

/** One tick's work. Never throws — the ledger runner isolates a throw anyway, but a
 *  step that reports `{ ok: false, error }` gives the run record something readable
 *  instead of a stack-trace message. */
export async function runGoRollup(now: Date): Promise<LedgerStepResult> {
  const counts = { projects: 0, links: 0, clicks30d: 0, pruned: 0, failed: 0 };
  let links;
  try {
    links = await listAllGoLinks(ROLLUP_LINK_SCAN);
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }
  counts.links = links.length;

  const since = windowStart(now, CLICK_WINDOW_30);
  for (const [key, projectLinks] of byProject(links)) {
    const [userId, projectId] = key.split(" ") as [string, string];
    try {
      const rows = await listGoClickDays(
        projectLinks.map((l) => l.id),
        since
      );
      const outcomes = rollupChannelOutcomes(projectLinks, rows, now);
      await saveOrganicOutcomes(userId, projectId, outcomes, now);
      counts.projects++;
      for (const o of outcomes) counts.clicks30d += o.clicks30d;
    } catch (err) {
      // One tenant's unreadable counters must not cost every other tenant its
      // rollup — the failure is counted and the loop moves on.
      counts.failed++;
      console.error(`[organic-channels] go-rollup failed for ${projectId}:`, err);
    }
  }

  // Retention last: a prune that ran BEFORE the rollup would silently narrow the
  // very window the rollup just read.
  try {
    counts.pruned = await pruneGoClicks(retentionCutoff(now));
  } catch (err) {
    console.error("[organic-channels] go-rollup prune failed:", err);
  }

  return { ok: counts.failed === 0, counts };
}
