/** Výkon — the performance dashboard, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getProjectDataset } from "@/lib/project-data/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "vykon");
  return (
    <ModulePage moduleKey="vykon">
      <DashboardClient data={getProjectDataset(project)} />
    </ModulePage>
  );
}
