/** Zisk (POAS) — margin-aware profit view over the channel mix. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import ProfitModule from "@/components/app/modules/ProfitModule";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { channelRows, totalsOf } from "@/lib/metrics";
import { defaultMargins, SAMPLE_PRODUCTS } from "@/lib/profit/sample";
import { categoryMixFromCatalog } from "@/lib/profit/products";
import { loadProductsFor } from "@/lib/catalog/load";
import { profitTrend } from "@/lib/profit/trend";
import type { ProfitTrendPoint, TrendGranularity } from "@/lib/profit/types";
import { getCostModel } from "@/lib/cost-model/store";


const PERIOD_DAYS: Record<string, number> = { "30": 30, "90": 90, "365": 365 };
/** Trend granularity per period: short windows read better weekly, the year monthly. */
const TREND_GRANULARITY: Record<string, TrendGranularity> = {
  "30": "week",
  "90": "week",
  "365": "month",
};

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "zisk");
  const data = getProjectDataset(project);
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

  // Precompute the channel mix per period on the server; the client only re-applies
  // the (live-editable) margin model on top — no recompute of the underlying mix.
  const rowsByPeriod = Object.fromEntries(
    Object.entries(PERIOD_DAYS).map(([key, days]) => [
      key,
      channelRows(data.channels, totalsOf(data.daily.slice(-days))),
    ])
  );

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
    <ModulePage moduleKey="zisk" sample>
      <ProfitModule
        projectId={projectId}
        rowsByPeriod={rowsByPeriod}
        trendByPeriod={trendByPeriod}
        channels={data.channels}
        products={products}
        defaults={margins}
        costModel={
          costModel
            ? { grossMarginPct: costModel.grossMarginPct, monthlyOverhead: costModel.monthlyOverhead, perOrderCost: costModel.perOrderCost }
            : null
        }
      />
    </ModulePage>
  );
}
