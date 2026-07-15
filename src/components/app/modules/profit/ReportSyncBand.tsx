"use client";

/** "Unify with the monthly report" band: publishes this module's blended margin +
 *  overhead to the shared server cost model so the report's Zisk agrees. Presentational
 *  child of ProfitModule — the POST lives in the state hook (applyToReport). */

import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function ReportSyncBand({
  costModel,
  applyState,
  onApply,
}: {
  costModel: { grossMarginPct: number; monthlyOverhead: number; perOrderCost: number } | null;
  applyState: "idle" | "busy" | "done" | "error";
  onApply: () => void;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-xs leading-relaxed ${
        costModel ? "bg-positive-soft text-positive" : "bg-canvas text-muted"
      }`}
    >
      <span className="font-medium">
        {costModel
          ? t("reportSyncActive", {
              m: fmt.fmtPct(costModel.grossMarginPct, 0),
              o: fmt.fmtCZK(costModel.monthlyOverhead),
              f: fmt.fmtCZK(costModel.perOrderCost),
            })
          : t("reportSyncInactive")}
      </span>
      <div className="flex items-center gap-2">
        {applyState === "done" && <span className="font-medium text-positive">{t("applied")}</span>}
        {applyState === "error" && <span className="font-medium text-negative">{t("applyFailed")}</span>}
        <button
          type="button"
          onClick={onApply}
          disabled={applyState === "busy"}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
        >
          {applyState === "busy" ? t("applying") : costModel ? t("applyUpdate") : t("applyToReport")}
        </button>
      </div>
    </div>
  );
}
