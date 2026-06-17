/** Distribuce — one article → channel variants + attribution. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DistributionModule from "@/components/app/modules/DistributionModule";
import { SAMPLE_ATTRIBUTION, SAMPLE_SOURCE } from "@/lib/distribution/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "distribuce");
  return (
    <ModulePage moduleKey="distribuce">
      <DistributionModule source={SAMPLE_SOURCE} attribution={SAMPLE_ATTRIBUTION} />
    </ModulePage>
  );
}
