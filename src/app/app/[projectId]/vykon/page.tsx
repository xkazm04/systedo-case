/** Výkon — the performance dashboard, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { performance } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "vykon");
  return (
    <ModulePage moduleKey="vykon">
      <DashboardClient data={performance} />
    </ModulePage>
  );
}
