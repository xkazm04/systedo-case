/** Distribuce — one article → channel variants + attribution. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DistributionModule from "@/components/app/modules/DistributionModule";
import { attributionForProject, SAMPLE_SOURCE } from "@/lib/distribution/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "distribuce");
  return (
    <ModulePage moduleKey="distribuce" sample>
      <DistributionModule source={SAMPLE_SOURCE} attribution={attributionForProject(project)} />
    </ModulePage>
  );
}
