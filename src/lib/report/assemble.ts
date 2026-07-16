/** The ONE place the Monthly Report's tile model is assembled from a resolved
 *  dataset. Extracted from the in-app report page (mesicni-report/page.tsx) so the
 *  page AND the client-facing shared report derive their tiles + per-period snaps +
 *  goal-attainment track record from a single function — the shared link can never
 *  drift from the in-app numbers again (Direction 1).
 *
 *  Pure & framework-free (numbers in → numbers out): the callers resolve the dataset
 *  (live vs sample), the cost model and the real goal history at the edge and hand
 *  them here. Unit-tested against fixture datasets so the assembly stays pinned.
 *  Server-safe but with no I/O of its own. */
import type { PerformanceData } from "@/lib/types";
import type { ProjectType } from "@/lib/projects/types";
import type { CostModel } from "@/lib/cost-model/types";
import type { GoalChange } from "@/lib/metrics/goal-history";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import { buildSnapshot } from "@/lib/snapshot";
import { cpa, rel, monthlyAttainmentHistory, type MonthAttainment } from "@/lib/metrics";
import { periodProfit, PERIOD_MONTHS } from "@/lib/cost-model/compute";
import {
  reportTilesForType,
  livePaidTilesForType,
  type ReportSnap,
  type ReportTileSpec,
} from "./compute";

export interface AssembleParams {
  /** the resolved dataset the report runs on (live synced series, or the sample spine) */
  dataset: PerformanceData;
  /** the project type — drives the tile preset (leads/CPL vs e-shop Obrat/ROAS) */
  type: ProjectType;
  /** true when the dataset is the client's own synced Ads data (appends CTR/CPC) */
  live: boolean;
  /** a saved cost model turns pre-COGS contribution into TRUE net profit + a margin tile */
  costModel: CostModel | null;
  /** Direction 2: the project's real per-project goal timeline. `[]` reproduces the
   *  pre-memory behaviour (one goal applied to every month), so a caller with no
   *  recorded history is byte-identical to before. */
  goalHistory?: GoalChange[];
  /** Direction 2: the monthly revenue goal in force NOW — the real per-project goal
   *  when set, else the dataset's (sample) goal. Defaults to the dataset goal so a
   *  caller that doesn't resolve a real goal is byte-identical to before. */
  monthlyRevenueGoal?: number;
}

export interface AssembledReport {
  /** the tile specs (cost-model relabel + live paid pair already applied) */
  tiles: ReportTileSpec[];
  /** per-period figures + deltas grounding each tile */
  snaps: Record<AnalysisPeriod, ReportSnap>;
  /** monthly goal-attainment track record (e-shop only; [] otherwise) */
  attainment: MonthAttainment[];
  /** the 12-month reference totals for the overhead-loaded break-even (null if absent) */
  ref12: { adCost: number; conversions: number } | null;
}

/** Assemble the Monthly Report tile model — the exact tiles + snaps + attainment the
 *  in-app report renders, from the same inputs. See the per-line rationale carried
 *  over from the page. */
export function assembleReport({
  dataset,
  type,
  live,
  costModel,
  goalHistory = [],
  monthlyRevenueGoal,
}: AssembleParams): AssembledReport {
  // Tiles follow the project TYPE (leads/CPL for leadgen & local, not e-shop
  // Obrat/ROAS) — same framing as the overview KPIs, so the two surfaces agree.
  let tiles = reportTilesForType(type);
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
  // On the LIVE path only, surface CTR/CPC for the traffic-led report types — the
  // sync now carries impressions+clicks, so click efficiency is real. The sample
  // spine has no paid-traffic pair, so these stay off the illustrative report.
  if (live) tiles = [...tiles, ...livePaidTilesForType(type)];

  const snaps = {} as Record<AnalysisPeriod, ReportSnap>;
  // Reference totals for the overhead-loaded break-even (the 12-month window).
  let ref12: { adCost: number; conversions: number } | null = null;
  for (const p of ANALYSIS_PERIODS) {
    const s = buildSnapshot(p, "previous", dataset);
    const c = s.current;
    if (p === "12m") ref12 = { adCost: c.cost, conversions: c.conversions };
    // Prior-period totals: read the comparison window directly (snap.previous)
    // rather than reconstructing them by inverting the deltas.
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
      // delta. Recompute the prior period's net profit and take the real delta.
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

  // Goal-attainment track record — did we hit the monthly revenue goal in the last
  // complete months? Revenue-goal based, so e-shop reports only. Scored against the
  // goal IN FORCE each month (goalHistory), falling back to the resolved goal.
  const goal = monthlyRevenueGoal ?? dataset.goals.monthlyRevenue;
  const attainment =
    type === "eshop" ? monthlyAttainmentHistory(dataset.daily, goal, 6, goalHistory) : [];

  return { tiles, snaps, attainment, ref12 };
}
