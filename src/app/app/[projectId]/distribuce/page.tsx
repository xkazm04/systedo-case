/** Distribuce — one article → channel variants + attribution. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DistributionModule from "@/components/app/modules/DistributionModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { attributionForProject, SAMPLE_SOURCE } from "@/lib/distribution/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "distribuce");
  return (
    <ModulePage moduleKey="distribuce">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <DistributionModule source={SAMPLE_SOURCE} attribution={attributionForProject(project)} />
    </ModulePage>
  );
}
