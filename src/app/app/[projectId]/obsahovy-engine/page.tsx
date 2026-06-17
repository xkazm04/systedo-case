/** Obsahový engine — topic clusters + content-decay refresh. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ContentEngineModule from "@/components/app/modules/ContentEngineModule";
import { SAMPLE_CLUSTERS, SAMPLE_DECAY } from "@/lib/content-engine/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "obsahovy-engine");
  return (
    <ModulePage moduleKey="obsahovy-engine">
      <ContentEngineModule clusters={SAMPLE_CLUSTERS} decay={SAMPLE_DECAY} />
    </ModulePage>
  );
}
