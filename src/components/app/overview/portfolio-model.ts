/** The Overview's cross-project portfolio VIEW-MODEL, extracted from
 *  ProjectOverview so the computation has one owner and the public /dashboard's
 *  fully deterministic demo portfolio can be computed ONCE instead of on every
 *  request.
 *
 *  Two seams, both keyed strictly off `isDemoProjectId` (the one demo-ness seam —
 *  never a parallel prefix test):
 *   1. STORE SHORT-CIRCUIT — a demo fixture id is never persisted (persist-guard),
 *      so `resolveRecommendationInputs` (src/lib/insights/resolve.ts, the ONE
 *      resolver both Overview surfaces share) answers it with the pure demo builders,
 *      skipping the round-trips; the resolver path proves the equivalence in
 *      test-unit/demo-portfolio-model.test.mjs. The resolvers and builders are
 *      re-exported below so that suite keeps importing them from here.
 *   2. MEMO — when EVERY project in the list is a demo fixture, the finished model
 *      is memoized at module level per (locale, id-list). The fixtures carry fixed
 *      timestamps (DEMO_TS; nothing reads Date.now on this path) and every input is
 *      seeded-deterministic, so the model can never go stale. Cache-Components
 *      compatible: no dynamic APIs, no force-dynamic. A list containing ANY real
 *      tenant id never touches the memo and always re-resolves its stores.
 *
 *  Server-only (the tenant path reads stores). */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";
import { isDemoProjectId } from "@/lib/projects/demo";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { bucketize, totalsOf } from "@/lib/metrics";
import { recommendationsFor } from "@/lib/insights/aggregate";
import { resolveRecommendationInputs } from "@/lib/insights/resolve";
import { byImpact, type Recommendation } from "@/lib/insights/types";
import { recordAdviceSighting } from "@/lib/advice/record";
import type { CompareRow } from "./compare";

/** A recommendation tagged with the project it belongs to (for the combined feed). */
export type PortfolioRec = Recommendation & {
  projectId: string;
  projectName: string;
  projectAccent: string;
};

export interface PortfolioModel {
  rows: CompareRow[];
  /** cross-project recs, re-keyed per project and ranked by impact */
  combined: PortfolioRec[];
}

export {
  demoChannelRecsInput,
  demoLocalRecsInput,
  demoSeoQueries,
  resolveChannelRecsInput,
  resolveLocalRecsInput,
  resolveSeoQueries,
} from "@/lib/insights/resolve";

/* ----------------------------------------------------------------- model */

async function buildPortfolioModel(
  projects: Project[],
  locale: SupportedLocale,
  uid: string | null
): Promise<PortfolioModel> {
  const perProject = await Promise.all(
    projects.map(async (p) => {
      const demo = isDemoProjectId(p.id);
      // A demo id resolves purely inside the resolver (zero store calls).
      const inputs = await resolveRecommendationInputs(p, { uid });
      const synced = inputs.metricsLive;
      const data = getProjectDataset(p);
      const row: CompareRow = {
        id: p.id,
        name: p.name,
        type: p.type,
        accentColor: p.accentColor,
        domain: p.domain,
        live: synced,
        totals: totalsOf(data.daily.slice(-30)),
        revenueSpark: bucketize(data.daily.slice(-365), "month").map((b) => b.revenue),
      };
      const collected = recommendationsFor(p, locale, inputs);
      // WP W3-A: the SAME render hook the single-project overview fires, so a
      // portfolio operator who never opens an individual project still accumulates a
      // ledger. Fire-and-forget and demo-skipped inside `recordAdviceSighting`, so the
      // all-demo memo path below stays I/O-free. `demo` is checked here too, to keep
      // even the function call off that path.
      if (!demo) void recordAdviceSighting(p.id, collected);
      // Re-keyed per project (rec ids aren't project-scoped) and tagged for the feed.
      // NOTE the split of duties: `id` stays the React key and is project-scoped here;
      // `subjectKey` is the LEDGER's identity and is deliberately NOT re-keyed — it is
      // already unique within a project, and the ledger is a per-project blob, so
      // prefixing it would only make the same signal look like two subjects.
      const recs: PortfolioRec[] = collected.map(
        (r) => ({
          ...r,
          id: `${p.id}:${r.id}`,
          projectId: p.id,
          projectName: p.name,
          projectAccent: p.accentColor,
        })
      );
      return { row, recs };
    })
  );
  return {
    rows: perProject.map((x) => x.row),
    // Stable sort over the project-ordered flatMap — identical ranking to sorting
    // the per-project lists after concatenation (what ProjectOverview always did).
    combined: perProject.flatMap((x) => x.recs).sort(byImpact),
  };
}

/** Module-level memo for the all-demo portfolio (see the header). Keyed by locale +
 *  the exact id list; holds the promise so concurrent first requests share one
 *  computation. A rejected promise is evicted (defensive — the demo path is pure). */
const demoModelMemo = new Map<string, Promise<PortfolioModel>>();

/** The portfolio view-model for a workspace. Demo-fixture-only lists are computed
 *  once per (locale, id-list) and memoized; anything involving a real tenant id is
 *  computed fresh on every request, stores and all. `uid` is the viewer, for the
 *  per-user seams (review triage, publishing calendar); the memo path never reads it. */
export function getPortfolioModel(
  projects: Project[],
  locale: SupportedLocale,
  uid: string | null = null
): Promise<PortfolioModel> {
  const allDemo = projects.length > 0 && projects.every((p) => isDemoProjectId(p.id));
  if (!allDemo) return buildPortfolioModel(projects, locale, uid);
  const key = `${locale}|${projects.map((p) => p.id).join(",")}`;
  let hit = demoModelMemo.get(key);
  if (!hit) {
    hit = buildPortfolioModel(projects, locale, null);
    hit.catch(() => demoModelMemo.delete(key));
    demoModelMemo.set(key, hit);
  }
  return hit;
}
