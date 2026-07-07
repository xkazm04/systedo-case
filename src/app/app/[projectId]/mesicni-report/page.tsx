/** Měsíční report / Monthly report — a client-ready performance recap. KPI tiles
 *  are grounded in buildSnapshot() (the same illustrative dataset the AI reads);
 *  the narrative reuses the existing `analysis` operation. Account-level module,
 *  available for every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MonthlyReport from "@/components/app/modules/MonthlyReport";
import { buildSnapshot } from "@/lib/snapshot";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import type { ReportSnap } from "@/lib/report/compute";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "mesicni-report");

  const snaps = {} as Record<AnalysisPeriod, ReportSnap>;
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p);
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
