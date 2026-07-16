/** Výkon — the performance dashboard, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "vykon");
  // Direction 2 — one profit truth: Výkon resolves the SAME live-over-sample dataset
  // /zisk and the monthly report use (resolveReportDataset), so a live-synced tenant
  // reads its real KPIs here instead of a hard-pinned sample spine that contradicted
  // its sibling modules. Unsynced tenants get the identical illustrative sample
  // (getProjectDataset underneath) and keep the honesty banner. The banner follows
  // this one resolution (`sample={!resolved.live}`), exactly like /zisk.
  const resolved = await resolveReportDataset(project);
  return (
    <ModulePage moduleKey="vykon" sample={!resolved.live}>
      <DashboardClient data={resolved.data} reportHref={`/app/${projectId}/report`} />
    </ModulePage>
  );
}
