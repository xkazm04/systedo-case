/** WP W3-A — the RENDER HOOK. Best-effort, fire-and-forget: after the Overview has
 *  computed a project's recommendations it tells the ledger what it is about to show.
 *
 *  WHY ON RENDER AND NOT IN A CRON. An outcome only means something relative to the
 *  moment the operator could SEE the advice — a ledger of advice nobody was shown
 *  would be a log of the engine talking to itself. `collectRecommendations` already
 *  runs here with all of its resolved inputs (local signals, SEO slate, channel plan,
 *  metrics liveness); re-assembling those server-side on a schedule would be a second,
 *  divergent copy of the same computation for no gain. LEDGER_STEPS is untouched.
 *
 *  It must never fail or slow a page. Every path is caught, demo projects are skipped
 *  at the seam, and the caller does not await. Server-only. */
import "server-only";
import { isDemoProjectId } from "@/lib/projects/demo";
import type { Recommendation } from "@/lib/insights/types";
import { updateAdviceLedger, type AdviceSighting } from "./ledger";
import { mutateAdviceLedger } from "./store";

/** Narrow a rendered `Recommendation` to the ledger's input. Only the fields the
 *  ledger persists cross the boundary — the localized detail/metric strings stay in
 *  the render, so the blob never becomes a copy of the UI. */
export function sightingOf(rec: Recommendation): AdviceSighting {
  return {
    subjectKey: rec.subjectKey,
    module: rec.module,
    severity: rec.severity,
    title: rec.title,
    ...(rec.impactCzk !== undefined ? { impactCzk: rec.impactCzk } : {}),
    ...(rec.sample ? { sample: true } : {}),
    ...(rec.snapshot ? { snapshot: rec.snapshot } : {}),
  };
}

/** Record that these recommendations were shown for this project. Resolves silently
 *  (returns false) for a demo fixture id, an anonymous viewer, an empty list, or any
 *  store failure — the ledger is an observation of the product, never a dependency
 *  of it.
 *
 *  DEMO IS SKIPPED AT THE SEAM (`isDemoProjectId`, the one demo-ness test), for the
 *  same reason sample advice is never scored: a demo fixture's numbers are the same
 *  fiction on every render, so a ledger of them would accumulate outcomes about
 *  nothing. It also keeps the public /dashboard's memoized, I/O-free path I/O-free. */
export async function recordAdviceSighting(
  projectId: string,
  recs: readonly Recommendation[],
  now: Date = new Date()
): Promise<boolean> {
  try {
    if (!projectId || isDemoProjectId(projectId) || recs.length === 0) return false;
    // LAZY on purpose (the `catalog/load` precedent in portfolio-model.ts): `@/lib/session`
    // pulls the whole Auth.js chain, and this module is imported by the portfolio
    // view-model — whose demo path must stay resolvable without it. The call is
    // request-memoized by React's cache(), so this costs nothing at runtime.
    const { currentUserId } = await import("@/lib/session");
    const userId = await currentUserId();
    if (!userId) return false;
    await mutateAdviceLedger(userId, projectId, (current) =>
      updateAdviceLedger(current, recs.map(sightingOf), now)
    );
    return true;
  } catch (err) {
    console.error(`[advice] sighting not recorded for ${projectId}:`, err);
    return false;
  }
}
