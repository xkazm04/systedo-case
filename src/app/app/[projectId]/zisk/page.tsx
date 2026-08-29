/** Zisk (POAS) — margin-aware profit view over the channel mix. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ProfitModule from "@/components/app/modules/ProfitModule";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { channelCurves, channelRows, scaleCurve, totalsOf } from "@/lib/metrics";
import type { ResponseCurve } from "@/lib/metrics/response-curve";
import { defaultMargins, SAMPLE_PRODUCTS } from "@/lib/profit/sample";
import { categoryMixFromCatalog } from "@/lib/profit/products";
import { loadProductsFor } from "@/lib/catalog/load";
import { profitTrend } from "@/lib/profit/trend";
import type { ProfitTrendPoint, TrendGranularity } from "@/lib/profit/types";
import { getCostModel } from "@/lib/cost-model/store";
import { getFinanceInputs } from "@/lib/profit/finance-inputs/store";


const PERIOD_DAYS: Record<string, number> = { "30": 30, "90": 90, "365": 365 };
/** Trend granularity per period: short windows read better weekly, the year monthly. */
const TREND_GRANULARITY: Record<string, TrendGranularity> = {
  "30": "week",
  "90": "week",
  "365": "month",
};

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "zisk");
  // Direction 2 — one profit truth: /zisk resolves the SAME live-over-sample dataset
  // the monthly report uses (resolveReportDataset), so a live-synced tenant reads its
  // real channel mix here instead of the sample spine while the report shows live
  // numbers. Unsynced → the identical sample dataset (getProjectDataset underneath),
  // so those tenants are byte-identical to before. `sample` and the provenance label
  // both follow this one resolution.
  const resolved = await resolveReportDataset(project);
  const data = resolved.data;
  const margins = defaultMargins(data.channels);
  // Category mix derived from the real product catalog (retiring the generic mock);
  // falls back to the sample mix for an empty catalog.
  const catalogMix = categoryMixFromCatalog(await loadProductsFor(project));
  const products = catalogMix.length > 0 ? catalogMix : SAMPLE_PRODUCTS;
  // Anchor "now" to the latest day in the series — derived server-side so the
  // client never reaches for Date.now() during render (react-compiler safe).
  const anchorIso = data.daily.length > 0 ? data.daily[data.daily.length - 1]!.date : undefined;

  // Shared cost model (A3): seeds the overhead panel and receives this module's
  // blended margin + overhead via "apply to report" — one profit source of truth.
  const costModel = await getCostModel(project.id);

  // Direction 1: the owner's persisted finance inputs (margin scenarios, per-period
  // real-numbers override, last-edited per-channel margins) — server-resolved so the
  // module opens on the owner's own numbers on any device, not browser-local state.
  // null → never entered (the module opens on defaults + runs the one-time
  // localStorage migration client-side). Passing the prop (even null) also signals
  // the module to persist; the demo path omits it and stays ephemeral.
  const financeInputs = await getFinanceInputs(project.id);

  // Precompute the channel mix per period on the server; the client only re-applies
  // the (live-editable) margin model on top — no recompute of the underlying mix.
  const rowsByPeriod = Object.fromEntries(
    Object.entries(PERIOD_DAYS).map(([key, days]) => [
      key,
      channelRows(data.channels, totalsOf(data.daily.slice(-days))),
    ])
  );

  // WP W1-F — response curves: fit each channel's diminishing-returns curve
  // (revenue = a · spend^b) once per period on the SERVER, so the "what if"
  // reallocation allocates by MARGINAL profit instead of assuming a constant ROAS.
  // Fitted here rather than in the client hook because the fit needs the whole daily
  // series and the per-day channel mix, neither of which should cross into the bundle.
  // The rows above are PERIOD totals while the fit is per-DAY: D identical days of
  // spend s produce D · a · s^b, i.e. the same shape with a · D^(1−b) — which is
  // exactly scaleCurve(c, D, D). Without that rescale the curve would be read at a
  // 90-day budget on per-day parameters. A dataset with too few/too flat days simply
  // yields unfitted curves and the reallocation keeps its previous behaviour.
  const curvesByPeriod = Object.fromEntries(
    Object.entries(PERIOD_DAYS).map(([key, days]) => {
      const window = data.daily.slice(-days);
      const perDay = channelCurves(window, data.channels, data.channelDaily);
      const d = Math.max(1, window.length);
      return [
        key,
        Object.fromEntries(Object.entries(perDay).map(([ch, c]) => [ch, scaleCurve(c, d, d)])),
      ];
    })
  ) as Record<string, Record<string, ResponseCurve>>;

  // Server-bucket the daily series into a profit/POAS trend per period, applying
  // the default margin model. The client re-drives it when margins are edited.
  const trendByPeriod = Object.fromEntries(
    Object.entries(PERIOD_DAYS).map(([key, days]) => [
      key,
      profitTrend(
        data.daily.slice(-days),
        data.channels,
        margins,
        TREND_GRANULARITY[key] ?? "week",
        anchorIso
      ),
    ])
  ) as Record<string, ProfitTrendPoint[]>;

  return (
    <ModulePage moduleKey="zisk" sample={!resolved.live}>
      <ProfitModule
        projectId={projectId}
        rowsByPeriod={rowsByPeriod}
        trendByPeriod={trendByPeriod}
        channels={data.channels}
        curvesByPeriod={curvesByPeriod}
        products={products}
        defaults={margins}
        live={resolved.live}
        syncedAt={resolved.syncedAt}
        financeInputs={financeInputs}
        costModel={
          costModel
            ? { grossMarginPct: costModel.grossMarginPct, monthlyOverhead: costModel.monthlyOverhead, perOrderCost: costModel.perOrderCost }
            : null
        }
      />
    </ModulePage>
  );
}
