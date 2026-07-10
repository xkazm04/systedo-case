/** Výkon — the performance dashboard, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getProjectDataset } from "@/lib/project-data/dataset";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "vykon");
  return (
    <ModulePage moduleKey="vykon" sample>
      {/* Výkon renders the seeded sample spine (getProjectDataset), never live Ads
          data — so it carries the same honesty banner as every other numeric module.
          Its absence here was the most-fabricated, least-labeled surface (BM-L2-REC-02).
          The banner itself renders from ModulePage's `sample` gutter. */}
      <DashboardClient data={getProjectDataset(project)} reportHref={`/app/${projectId}/report`} />
    </ModulePage>
  );
}
