/** Obsahový engine — topic clusters + content-decay refresh. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ContentEngineModule from "@/components/app/modules/ContentEngineModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { clustersForProject, SAMPLE_DECAY } from "@/lib/content-engine/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "obsahovy-engine");
  return (
    <ModulePage moduleKey="obsahovy-engine">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <ContentEngineModule clusters={clustersForProject(project)} decay={SAMPLE_DECAY} />
    </ModulePage>
  );
}
