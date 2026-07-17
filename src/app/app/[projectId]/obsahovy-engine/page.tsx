/** Obsahový engine — the unified content module (Tvorba): topic clusters +
 *  decaying content as view-first tables, with the AI brief → article-draft
 *  workspace and cross-module hand-offs opened in modals. */
import { requireProjectModule } from "@/lib/projects/guard";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import ModulePage from "@/components/app/ModulePage";
import ContentEngine from "@/components/app/modules/ContentEngine";
import { clustersForProject, SAMPLE_DECAY } from "@/lib/content-engine/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "obsahovy-engine");
  // Honest "živá data" signal resolved server-side (synced rows, not just linked).
  const live = await hasSyncedMetrics(project.id);
  return (
    // Page-level honesty signal via the shared ModulePage `sample` slot, matching every
    // sibling module (distribuce, obsah-plan, experimenty-lp, …). The in-module
    // Živá/Ukázková pill stays for per-widget granularity; this is the single page marker.
    <ModulePage moduleKey="obsahovy-engine" sample={!live}>
      <ContentEngine clusters={clustersForProject(project)} decay={SAMPLE_DECAY} live={live} />
    </ModulePage>
  );
}
