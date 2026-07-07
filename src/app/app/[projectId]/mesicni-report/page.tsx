/** Měsíční report / Monthly report — a client-ready performance recap. KPI tiles
 *  are grounded on THIS project's dataset (getProjectDataset), the same data the
 *  `monthly-recap` narrative reads. Account-level module, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MonthlyReport from "@/components/app/modules/MonthlyReport";
import { buildSnapshot } from "@/lib/snapshot";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import { reportTilesForType, type ReportSnap } from "@/lib/report/compute";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "mesicni-report");
  const dataset = getProjectDataset(project);

  // Tiles follow the project TYPE (leads/CPL for leadgen & local, not e-shop
  // Obrat/ROAS) — same framing as the overview KPIs, so the two surfaces agree.
  const tiles = reportTilesForType(project.type);

  const snaps = {} as Record<AnalysisPeriod, ReportSnap>;
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p, "previous", dataset);
    const c = s.current;
    // Derived, type-relevant metrics not carried directly on Totals.
    const cpa = c.conversions > 0 ? c.cost / c.conversions : 0;
    const prevConv = c.conversions / (1 + (s.delta.conversions ?? 0));
    const prevCost = c.cost / (1 + (s.delta.cost ?? 0));
    const prevCpa = prevConv > 0 ? prevCost / prevConv : 0;
    const cpaDelta = prevCpa > 0 ? cpa / prevCpa - 1 : 0;
    // Contribution (revenue − ad cost) + profit-on-ad-spend. NOT after-COGS —
    // true net profit needs per-SKU margin (a separate seam).
    const poas = c.cost > 0 ? c.profit / c.cost : 0;
    snaps[p] = {
      label: s.periodLabel,
      current: {
        revenue: c.revenue,
        roas: c.roas,
        pno: c.pno,
        conversions: c.conversions,
        cost: c.cost,
        visits: c.visits,
        cpa,
        convRate: c.cr,
        profit: c.profit,
        poas,
      },
      delta: {
        revenue: s.delta.revenue,
        pno: s.delta.pno,
        conversions: s.delta.conversions,
        cost: s.delta.cost,
        visits: s.delta.visits,
        convRate: s.delta.cr,
        cpa: cpaDelta,
        profit: s.delta.profit,
      },
    };
  }

  return (
    <ModulePage moduleKey="mesicni-report">
      <MonthlyReport tiles={tiles} snaps={snaps} projectName={project.name} logoUrl={project.logoUrl} />
    </ModulePage>
  );
}
