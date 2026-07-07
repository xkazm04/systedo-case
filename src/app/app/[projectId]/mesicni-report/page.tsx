/** Měsíční report / Monthly report — a client-ready performance recap. KPI tiles
 *  are grounded on THIS project's dataset (getProjectDataset), the same data the
 *  `monthly-recap` narrative reads. Account-level module, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MonthlyReport from "@/components/app/modules/MonthlyReport";
import { buildSnapshot } from "@/lib/snapshot";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import type { ReportSnap } from "@/lib/report/compute";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "mesicni-report");
  const dataset = getProjectDataset(project);

  const snaps = {} as Record<AnalysisPeriod, ReportSnap>;
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p, "previous", dataset);
    snaps[p] = {
      label: s.periodLabel,
      current: {
        revenue: s.current.revenue,
        roas: s.current.roas,
        pno: s.current.pno,
        conversions: s.current.conversions,
        cost: s.current.cost,
        visits: s.current.visits,
      },
      delta: {
        revenue: s.delta.revenue,
        pno: s.delta.pno,
        conversions: s.delta.conversions,
        cost: s.delta.cost,
        visits: s.delta.visits,
      },
    };
  }

  return (
    <ModulePage moduleKey="mesicni-report">
      <MonthlyReport snaps={snaps} projectName={project.name} />
    </ModulePage>
  );
}
