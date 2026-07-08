/** Měsíční report / Monthly report — a client-ready performance recap. KPI tiles
 *  are grounded on THIS project's dataset (getProjectDataset), the same data the
 *  `monthly-recap` narrative reads. Account-level module, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MonthlyReport from "@/components/app/modules/MonthlyReport";
import { buildSnapshot } from "@/lib/snapshot";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import { reportTilesForType, type ReportSnap, type ReportTileSpec } from "@/lib/report/compute";
import { getCostModel } from "@/lib/cost-model/store";
import { periodProfit, PERIOD_MONTHS } from "@/lib/cost-model/compute";
import { getCompetitors } from "@/lib/competitors/store";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "mesicni-report");
  // A1 seam: live Ads data when the project has synced it, else the scaled sample.
  const resolved = await resolveReportDataset(project);
  const dataset = resolved.data;

  // A3: a saved cost model turns the pre-COGS contribution into TRUE net profit
  // after margin + overhead. Only e-shop reports carry a profit line.
  const costModel = project.type === "eshop" ? await getCostModel(project.id) : null;
  // C3: the project's competitor set grounds the AI narrative "vs. the market".
  const competitorSet = await getCompetitors(project.id);

  // Tiles follow the project TYPE (leads/CPL for leadgen & local, not e-shop
  // Obrat/ROAS) — same framing as the overview KPIs, so the two surfaces agree.
  let tiles = reportTilesForType(project.type);
  if (costModel) {
    // Relabel the contribution tile to "Zisk" (net after COGS) and add a margin tile.
    tiles = tiles.flatMap((t): ReportTileSpec[] =>
      t.metric === "profit"
        ? [
            { ...t, label: "Zisk", labelEn: "Net profit" },
            { metric: "profitMargin", label: "Zisková marže", labelEn: "Net margin", format: "pct", goodWhenDown: false, hasDelta: false },
          ]
        : [t]
    );
  }

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

    // Profit line: with a cost model → true net profit after COGS + overhead and a
    // margin-aware POAS; without → pre-COGS contribution (revenue − ad cost).
    let profit: number;
    let poas: number;
    let profitMargin: number | undefined;
    let profitDelta = s.delta.profit;
    if (costModel) {
      const pp = periodProfit(
        { revenue: c.revenue, adCost: c.cost, conversions: c.conversions, months: PERIOD_MONTHS[p] },
        costModel
      );
      profit = pp.netProfit;
      poas = pp.poas;
      profitMargin = pp.profitMargin;
      // Delta of net profit ≈ delta of gross contribution (fixed margin), a good proxy.
      profitDelta = s.delta.profit;
    } else {
      profit = c.profit;
      poas = c.cost > 0 ? c.profit / c.cost : 0;
    }

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
        profit,
        poas,
        ...(profitMargin !== undefined ? { profitMargin } : {}),
      },
      delta: {
        revenue: s.delta.revenue,
        pno: s.delta.pno,
        conversions: s.delta.conversions,
        cost: s.delta.cost,
        visits: s.delta.visits,
        convRate: s.delta.cr,
        cpa: cpaDelta,
        profit: profitDelta,
      },
    };
  }

  return (
    <ModulePage moduleKey="mesicni-report">
      <MonthlyReport
        tiles={tiles}
        snaps={snaps}
        projectName={project.name}
        logoUrl={project.logoUrl}
        projectId={project.id}
        live={resolved.live}
        syncedAt={resolved.syncedAt}
        customerId={resolved.customerId}
        showCostModel={project.type === "eshop"}
        costModel={costModel ? { grossMarginPct: costModel.grossMarginPct, monthlyOverhead: costModel.monthlyOverhead, perOrderCost: costModel.perOrderCost } : null}
        competitors={competitorSet?.competitors ?? []}
      />
    </ModulePage>
  );
}
