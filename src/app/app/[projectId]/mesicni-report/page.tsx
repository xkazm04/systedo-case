/** Měsíční report / Monthly report — a client-ready performance recap. KPI tiles
 *  are grounded on THIS project's dataset (getProjectDataset), the same data the
 *  `monthly-recap` narrative reads. Account-level module, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MonthlyReport from "@/components/app/modules/MonthlyReport";
import { buildSnapshot } from "@/lib/snapshot";
import { cpa, rel } from "@/lib/metrics";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import { reportTilesForType, livePaidTilesForType, type ReportSnap, type ReportTileSpec } from "@/lib/report/compute";
import { getCostModel } from "@/lib/cost-model/store";
import { periodProfit, PERIOD_MONTHS } from "@/lib/cost-model/compute";
import { getCompetitors } from "@/lib/competitors/store";
import { listAnnotations } from "@/lib/annotations/store";
import { cohortsForProject } from "@/lib/ltv/sample";
import { ltvSummary } from "@/lib/ltv/compute";
import { loadProductsFor } from "@/lib/catalog/load";
import { stockRows, monthlySeasonality } from "@/lib/inventory/compute";
import type { ReportBeyondData } from "@/components/app/modules/ReportBeyond";

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
  // Direction 2: the project's "what happened here" annotations — rendered as chart
  // markers on the report and (in-window) fed to the recap grounding. The chart marker
  // window is the report's own data span.
  const annotations = await listAnnotations(project.id);
  const dataStart = dataset.daily[0]?.date;
  const dataEnd = dataset.daily.at(-1)?.date;

  // D1: compose the customer-economics (LTV) + stock/seasonality spines into the
  // e-shop report, so Robert's weekly job (marketing + LTV + stock) lives in one place.
  let beyond: ReportBeyondData | null = null;
  if (project.type === "eshop") {
    const ltv = ltvSummary(cohortsForProject(project));
    const lastDate = dataset.daily.at(-1)?.date;
    const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
    const products = await loadProductsFor(project, now);
    const stock = stockRows(products, now);
    const atRiskCount = stock.filter((s) => s.status === "pause" || s.status === "low").length;
    const season = monthlySeasonality(dataset.daily);
    const seasonNow = season[now.getUTCMonth()];
    beyond = {
      ltvCac: ltv.avgLtvCac,
      payback: ltv.avgPayback,
      paidCac: ltv.paidCac,
      atRiskCount,
      seasonIndex: seasonNow?.index ?? 1,
      seasonLabel: seasonNow?.label ?? "",
    };
  }

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
  // Direction 1: on the LIVE path only, surface CTR/CPC for the traffic-led report
  // types — the sync now carries impressions+clicks, so click efficiency is real.
  // The sample spine has no paid-traffic pair, so these stay off the illustrative
  // report (they'd read 0). Appended last, after the cost-model relabel.
  if (resolved.live) tiles = [...tiles, ...livePaidTilesForType(project.type)];

  const snaps = {} as Record<AnalysisPeriod, ReportSnap>;
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p, "previous", dataset);
    const c = s.current;
    // Prior-period totals: read the comparison window directly (snap.previous)
    // rather than reconstructing them by inverting the deltas — the inversion
    // silently returns the CURRENT value when a baseline is zero (1 + 0), faking
    // a "no change". Cost-per-conversion (CPA) and its delta come from the shared
    // ratio/delta spine so they can't drift from the rest of the engine.
    const prev = s.previous;
    const cpaValue = cpa(c.cost, c.conversions);
    const prevCost = prev.cost;
    const prevConv = prev.conversions;
    const prevCpa = cpa(prevCost, prevConv);
    const cpaDelta = rel(cpaValue, prevCpa);

    // Profit line: with a cost model → true net profit after COGS + overhead and a
    // margin-aware POAS; without → pre-COGS contribution (revenue − ad cost).
    let profit: number;
    let poas: number;
    let profitMargin: number | undefined;
    let profitDelta = s.delta.profit;
    if (costModel) {
      const months = PERIOD_MONTHS[p];
      const pp = periodProfit(
        { revenue: c.revenue, adCost: c.cost, conversions: c.conversions, months },
        costModel
      );
      profit = pp.netProfit;
      poas = pp.poas;
      profitMargin = pp.profitMargin;
      // The change badge must describe NET profit, not the pre-COGS contribution
      // delta (s.delta.profit). Once fixed overhead shrinks the denominator, a +8%
      // contribution swing can be +35% on net profit — pairing the net koruna figure
      // with the contribution % is a wrong, client-facing number. Recompute the prior
      // period's net profit from its prior-window totals (snap.previous) and take
      // the real delta.
      const prevRevenue = prev.revenue;
      const prevNet = periodProfit(
        { revenue: prevRevenue, adCost: prevCost, conversions: prevConv, months },
        costModel
      ).netProfit;
      profitDelta = prevNet !== 0 ? (pp.netProfit - prevNet) / Math.abs(prevNet) : 0;
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
        cpa: cpaValue,
        convRate: c.cr,
        profit,
        poas,
        // Live CTR/CPC — derived by totalsOf from the daily impressions/clicks the
        // Ads sync now carries (0 on the sample spine, but only rendered when live).
        ctr: c.ctr,
        cpc: c.cpc,
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
        accentColor={project.accentColor}
        projectId={project.id}
        live={resolved.live}
        syncedAt={resolved.syncedAt}
        stale={resolved.stale}
        customerId={resolved.customerId}
        showCostModel={project.type === "eshop"}
        costModel={costModel ? { grossMarginPct: costModel.grossMarginPct, monthlyOverhead: costModel.monthlyOverhead, perOrderCost: costModel.perOrderCost } : null}
        competitors={competitorSet?.competitors ?? []}
        annotations={annotations}
        dataStart={dataStart}
        dataEnd={dataEnd}
        beyond={beyond}
      />
    </ModulePage>
  );
}
