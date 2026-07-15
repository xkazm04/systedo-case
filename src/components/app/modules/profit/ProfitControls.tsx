"use client";

/** Period selector + channels/products view toggle + reset-margins button.
 *  Presentational child of ProfitModule. */

import type { Dispatch, SetStateAction } from "react";
import { useT } from "@/lib/i18n/client";
import { T } from "./strings";
import type { ViewMode } from "./useProfitState";

export default function ProfitControls({
  periods,
  period,
  setPeriod,
  view,
  setView,
  dirty,
  onResetMargins,
}: {
  periods: string[];
  period: string;
  setPeriod: Dispatch<SetStateAction<string>>;
  view: ViewMode;
  setView: Dispatch<SetStateAction<ViewMode>>;
  dirty: boolean;
  onResetMargins: () => void;
}) {
  const t = useT(T);

  const PERIOD_LABELS: Record<string, string> = {
    "30": t("days30"),
    "90": t("days90"),
    "365": t("months12"),
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
        {periods.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
              period === p ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
            }`}
          >
            {PERIOD_LABELS[p] ?? p}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
          {(
            [
              ["channels", t("byChannels")],
              ["products", t("byProducts")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                view === value ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {dirty && (
          <button
            type="button"
            onClick={onResetMargins}
            className="text-sm font-medium text-muted transition-colors hover:text-navy-700"
          >
            {t("resetMargins")}
          </button>
        )}
      </div>
    </div>
  );
}
