/** Project overview (home of /app/[projectId]). */
import { requireProjectModule } from "@/lib/projects/guard";
import ProjectOverview from "@/components/app/ProjectOverview";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { collectRecommendations } from "@/lib/insights/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "");
  return (
    <ProjectOverview
      project={project}
      data={getProjectDataset(project)}
      recommendations={collectRecommendations(project)}
    />
  );
}
