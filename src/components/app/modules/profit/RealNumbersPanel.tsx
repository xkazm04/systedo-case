"use client";

/** Real-numbers override (#ROB-02): enter your actual revenue + ad spend so the whole
 *  view reflects YOUR books, not just the margin lens. Presentational child of
 *  ProfitModule — the scaling + persistence live in the state hook. */

import type { RealOverride } from "@/lib/profit/finance-inputs/types";
import { useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function RealNumbersPanel({
  period,
  real,
  baseTotals,
  overridden,
  setReal,
  clearReal,
}: {
  period: string;
  real: RealOverride | undefined;
  baseTotals: { revenue: number; cost: number };
  overridden: boolean;
  setReal: (field: "revenue" | "spend", value: number) => void;
  clearReal: () => void;
}) {
  const t = useT(T);

  const PERIOD_LABELS: Record<string, string> = {
    "30": t("days30"),
    "90": t("days90"),
    "365": t("months12"),
  };

  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-navy-800">{t("realNumbersTitle")}</p>
      <p className="mt-1 text-xs text-muted">
        {t("realNumbersDesc", { period: PERIOD_LABELS[period] ?? period })}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-navy-700">{t("revenue")}</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={real?.revenue ? Math.round(real.revenue) : ""}
            onChange={(e) => setReal("revenue", Number(e.target.value))}
            placeholder={String(Math.round(baseTotals.revenue))}
            className="w-44 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-navy-700">{t("adSpend")}</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={real?.spend ? Math.round(real.spend) : ""}
            onChange={(e) => setReal("spend", Number(e.target.value))}
            placeholder={String(Math.round(baseTotals.cost))}
            className="w-44 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
          />
        </label>
        {overridden && (
          <button
            type="button"
            onClick={clearReal}
            className="rounded-pill border border-line px-3 py-2 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50"
          >
            {t("backToDemo")}
          </button>
        )}
      </div>
      {overridden && (
        <p className="mt-2 text-xs text-positive">
          {t("recalculated")}
        </p>
      )}
    </div>
  );
}
