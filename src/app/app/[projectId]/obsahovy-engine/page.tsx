/** Obsahový engine — the unified content module (Tvorba): topic clusters +
 *  decaying content as view-first tables, with the AI brief → article-draft
 *  workspace and cross-module hand-offs opened in modals. */
import { requireProjectModule } from "@/lib/projects/guard";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import ModulePage from "@/components/app/ModulePage";
import ContentEngine from "@/components/app/modules/ContentEngine";
import { resolveContentDataset } from "@/lib/content-engine/resolve";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "obsahovy-engine");
  // The Ads sync signal is read honestly — but it is NOT the label. The resolver
  // decides what the module renders and therefore what it may claim: clusters and
  // decay are fixture-derived today, so a synced project is still labelled sample
  // (and told why, via the caveat chip). See lib/content-engine/resolve.ts.
  const data = resolveContentDataset(project, { adsSynced: await hasSyncedMetrics(project.id) });
  return (
    // Page-level honesty signal via the shared ModulePage `sample` slot, matching every
    // sibling module (distribuce, obsah-plan, experimenty-lp, …). The in-module
    // Živá/Ukázková pill stays for per-widget granularity; this is the single page marker.
    <ModulePage moduleKey="obsahovy-engine" sample={!data.live}>
      <ContentEngine
        clusters={data.clusters}
        decay={data.decay}
        derivedFrom={data.derivedFrom}
        adsSynced={data.adsSynced}
      />
    </ModulePage>
  );
}
