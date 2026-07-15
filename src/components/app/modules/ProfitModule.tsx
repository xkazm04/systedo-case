"use client";

import NextSteps from "@/components/app/NextSteps";
import ProfitScenariosPanel from "@/components/app/modules/ProfitScenariosPanel";
import ProfitReallocationPanel from "@/components/app/modules/ProfitReallocationPanel";
import ProfitProductsPanel from "@/components/app/modules/ProfitProductsPanel";
import type { ChannelRow } from "@/lib/metrics";
import type { ChannelShare } from "@/lib/types";
import type { ChannelMargin, ProductCategory, ProfitTrendPoint } from "@/lib/profit/types";
import type { FinanceInputs } from "@/lib/profit/finance-inputs/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./profit/strings";
import { useProfitState } from "./profit/useProfitState";
import ProvenanceBar from "./profit/ProvenanceBar";
import ProfitControls from "./profit/ProfitControls";
import ReportSyncBand from "./profit/ReportSyncBand";
import ReconcileNote from "./profit/ReconcileNote";
import RealNumbersPanel from "./profit/RealNumbersPanel";
import SummaryBand from "./profit/SummaryBand";
import TrendPanel from "./profit/TrendPanel";
import ChannelsTable from "./profit/ChannelsTable";
import OverheadPanel from "./profit/OverheadPanel";

export default function ProfitModule({
  projectId,
  rowsByPeriod,
  trendByPeriod,
  channels,
  products,
  defaults,
  live = false,
  syncedAt,
  financeInputs,
  costModel = null,
}: {
  projectId: string;
  rowsByPeriod: Record<string, ChannelRow[]>;
  trendByPeriod: Record<string, ProfitTrendPoint[]>;
  channels: ChannelShare[];
  products: ProductCategory[];
  defaults: ChannelMargin[];
  /** Direction 2: true when the resolved dataset is the tenant's own synced Ads data
   *  (same resolution as the report), false on the illustrative sample. Drives the
   *  provenance label, consistent with the report's wording. */
  live?: boolean;
  /** ISO timestamp of the last live sync (live only). */
  syncedAt?: string;
  /** Direction 1: the owner's server-persisted finance inputs (margin scenarios,
   *  per-period real-numbers override, last-edited per-channel margins). `null` = wired
   *  but never entered (opens on defaults + runs the one-time localStorage migration);
   *  `undefined` = not wired (the demo path) → the module stays ephemeral, no persist. */
  financeInputs?: FinanceInputs | null;
  /** the shared server cost model (A3) — seeds overhead here and receives this
   *  module's blended margin + overhead via "apply to report". null = none saved. */
  costModel?: { grossMarginPct: number; monthlyOverhead: number; perOrderCost: number } | null;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  // All state, derived metrics and the persistence lifecycle (one-time localStorage
  // migration, ready gate, 700ms debounced POST, wired/demo distinction) live in the hook.
  const s = useProfitState({
    projectId,
    rowsByPeriod,
    trendByPeriod,
    channels,
    products,
    defaults,
    live,
    financeInputs,
    costModel,
  });

  return (
    <div className="stagger space-y-6">
      <ProvenanceBar live={live} syncedAt={syncedAt} />

      <ProfitControls
        periods={s.periods}
        period={s.period}
        setPeriod={s.setPeriod}
        view={s.view}
        setView={s.setView}
        dirty={s.dirty}
        onResetMargins={s.resetMargins}
      />

      <ReportSyncBand costModel={costModel} applyState={s.applyState} onApply={s.applyToReport} />

      {costModel && s.reconcile.diverged && <ReconcileNote reconcile={s.reconcile} />}

      <RealNumbersPanel
        period={s.period}
        real={s.real}
        baseTotals={s.baseTotals}
        overridden={s.overridden}
        setReal={s.setReal}
        clearReal={s.clearReal}
      />

      <SummaryBand summary={s.summary} netDelta={s.netDelta} poasDelta={s.poasDelta} />

      {s.trend.length >= 2 && (
        <TrendPanel trend={s.trend} netDelta={s.netDelta} poasDelta={s.poasDelta} period={s.period} />
      )}

      {s.view === "channels" && (
        <>
          <ChannelsTable summary={s.summary} rows={s.rows} setMargin={s.setMargin} />

          <OverheadPanel
            overhead={s.overhead}
            setOverhead={s.setOverhead}
            overheadResult={s.overheadResult}
            months={s.months}
            summary={s.summary}
          />

          {/* #4 margin scenarios — save / load / compare */}
          <ProfitScenariosPanel
            scenarioName={s.scenarioName}
            setScenarioName={s.setScenarioName}
            saveScenario={s.saveScenario}
            scenarios={s.scenarios}
            loadScenario={s.loadScenario}
            compareId={s.compareId}
            setCompareId={s.setCompareId}
            deleteScenario={s.deleteScenario}
            compareScenario={s.compareScenario}
            compareSummary={s.compareSummary}
            summary={s.summary}
          />

          {/* "What if" — budget-reallocation simulator */}
          <ProfitReallocationPanel
            plan={s.plan}
            strategy={s.strategy}
            setStrategy={s.setStrategy}
            budget={s.budget}
            budgetOverride={s.budgetOverride}
            setBudgetOverride={s.setBudgetOverride}
            summaryCost={s.summary.cost}
          />
        </>
      )}

      {/* #2 product / category view */}
      {s.view === "products" && (
        <ProfitProductsPanel productResult={s.productResult} worstCategory={s.worstCategory} />
      )}

      <NextSteps
        steps={[
          {
            to: "kampane",
            label: t("nextStepLabel"),
            hint: s.planHelps
              ? t("nextStepHintHelps", { profit: fmt.fmtCZK(s.plan.profitDelta) })
              : t("nextStepHintOther"),
          },
        ]}
      />
    </div>
  );
}
