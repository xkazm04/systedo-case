/** Měsíční report / Monthly report — a client-ready performance recap. KPI tiles
 *  are grounded on THIS project's dataset (getProjectDataset), the same data the
 *  `monthly-recap` narrative reads. Account-level module, every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import MonthlyReport, { type RecapHistoryItem } from "@/components/app/modules/MonthlyReport";
import { getServerLocale } from "@/lib/i18n/locale";
import { getRecaps, historyForPeriod, recapCurrentHashes, isRecapStale } from "@/lib/recaps";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { ANALYSIS_PERIODS, type AnalysisPeriod } from "@/lib/ai-types";
import { assembleReport } from "@/lib/report/assemble";
import { getProjectGoal } from "@/lib/goals/store";
import { getCostModel } from "@/lib/cost-model/store";
import { PERIOD_MONTHS, deriveBreakEven } from "@/lib/cost-model/compute";
import { getCompetitors } from "@/lib/competitors/store";
import { listAnnotations } from "@/lib/annotations/store";
import { resolveCohorts } from "@/lib/ltv/resolve";
import { ltvSummary } from "@/lib/ltv/compute";
import { loadProjectCatalog } from "@/lib/catalog/load";
import { isProduct, toProduct } from "@/lib/catalog/offering";
import { catalogBlendedMargin } from "@/lib/catalog/blended-margin";
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
  // Direction 2: the project's REAL monthly revenue goal (over the illustrative
  // sample goal). Revenue-based → e-shop only. Absent → the sample goal, and the
  // pacing/attainment surfaces carry an honest "ukázkový cíl" label.
  const projectGoal = project.type === "eshop" ? await getProjectGoal(project.id) : null;
  const goalHistory = projectGoal?.history ?? [];
  const monthlyRevenueGoal = projectGoal?.goal ?? dataset.goals.monthlyRevenue;
  const sampleGoal = project.type === "eshop" && !projectGoal;
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
  // Direction 2: the catalog's revenue-weighted blended margin — a one-click default
  // for the cost-model editor. Only e-shop projects carry a stock/margin catalog.
  let catalogMarginPct: number | null = null;
  if (project.type === "eshop") {
    const ltv = ltvSummary(resolveCohorts(project));
    const lastDate = dataset.daily.at(-1)?.date;
    const now = lastDate ? new Date(`${lastDate}T00:00:00Z`) : new Date();
    const catalog = await loadProjectCatalog(project, now);
    catalogMarginPct = catalogBlendedMargin(catalog);
    const products = catalog.filter(isProduct).map(toProduct);
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

  // Direction 1: the tile model — tiles + per-period snaps + goal-attainment track
  // record — is assembled by the ONE shared helper the client-facing shared report
  // (createSharedReport) also uses, so the emailed link can never drift from these
  // in-app numbers. The page keeps its e-shop extras (break-even, LTV/stock) below.
  const { tiles, snaps, attainment, ref12 } = assembleReport({
    dataset,
    type: project.type,
    live: resolved.live,
    costModel,
    goalHistory,
    monthlyRevenueGoal,
  });

  // Direction 2: the tenant's margin-derived break-even, surfaced on the report's
  // cost-model strip as the target the profit line is judged against. Gross (1/margin)
  // always; overhead-loaded when the model carries overhead/fulfilment. Null → the
  // strip renders exactly as before (byte-identical for tenants without a model).
  const breakEven =
    costModel && ref12
      ? deriveBreakEven(costModel, { adCost: ref12.adCost, conversions: ref12.conversions, months: PERIOD_MONTHS["12m"] })
      : null;

  // Direction 1: the project's persisted recaps per period, resolved server-side so
  // the narrative renders a stored recap on load instead of regenerating every visit.
  // Each stored recap's staleness is decided here — its stored input hash vs the
  // CURRENT inputs (the same period + locale + project type + dataset the route
  // hashes at generation) — so a recap computed before a data change is honestly
  // flagged. Read once; the pure helpers bucket + cap per period.
  const locale = await getServerLocale();
  const recapState = await getRecaps(project.id).catch(() => null);
  const recaps = {} as Record<AnalysisPeriod, RecapHistoryItem[]>;
  for (const p of ANALYSIS_PERIODS) {
    // Dual-acceptance: a stored recap matching EITHER the new series-digest hash or the
    // deprecated whole-dataset hash reads fresh, so recaps written before the digest
    // optimization don't flip stale on deploy — only a real data change does.
    const currentHashes = recapCurrentHashes(locale, p, project.type, dataset);
    recaps[p] = historyForPeriod(recapState, p).map((it) => ({
      id: it.id,
      createdAt: it.createdAt,
      stale: isRecapStale(it, currentHashes),
      result: it.result,
    }));
  }

  return (
    <ModulePage moduleKey="mesicni-report">
      <MonthlyReport
        tiles={tiles}
        snaps={snaps}
        attainment={attainment}
        projectName={project.name}
        logoUrl={project.logoUrl}
        accentColor={project.accentColor}
        projectId={project.id}
        live={resolved.live}
        syncedAt={resolved.syncedAt}
        stale={resolved.stale}
        customerId={resolved.customerId}
        showGoal={project.type === "eshop"}
        goal={monthlyRevenueGoal}
        goalHistory={goalHistory}
        sampleGoal={sampleGoal}
        showCostModel={project.type === "eshop"}
        costModel={costModel ? { grossMarginPct: costModel.grossMarginPct, monthlyOverhead: costModel.monthlyOverhead, perOrderCost: costModel.perOrderCost } : null}
        breakEven={breakEven}
        catalogMarginPct={catalogMarginPct}
        competitors={competitorSet?.competitors ?? []}
        annotations={annotations}
        dataStart={dataStart}
        dataEnd={dataEnd}
        beyond={beyond}
        currencyCode={resolved.currencyCode}
        recaps={recaps}
      />
    </ModulePage>
  );
}
