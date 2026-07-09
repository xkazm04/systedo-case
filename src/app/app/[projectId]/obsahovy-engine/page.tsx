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
  const project = await requireProjectModule(projectId, "obsahovy-engine");
  // Honest "živá data" signal resolved server-side (synced rows, not just linked).
  const live = await hasSyncedMetrics(project.id);
  return (
    <ModulePage moduleKey="obsahovy-engine">
      <ContentEngine clusters={clustersForProject(project)} decay={SAMPLE_DECAY} live={live} />
    </ModulePage>
  );
}
