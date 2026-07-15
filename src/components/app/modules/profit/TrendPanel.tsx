"use client";

/** Profit & POAS trend sparklines (#3). Rendered only when the parent has a series of
 *  ≥ 2 points. Presentational child of ProfitModule; the series is re-driven with the
 *  live margin model in the state hook. */

import DeltaBadge from "@/components/dashboard/DeltaBadge";
import Sparkline from "@/components/charts/Sparkline";
import type { ProfitTrendPoint } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./strings";

// --- trend sparkline (#3) ---------------------------------------------------

/** Full-width trend sparkline over the shared chart primitive (`responsive`
 *  viewBox sizing, soft area fill, last-point dot). Only the empty-state dash
 *  for sub-2-point series stays local — the shared component renders those as
 *  an empty decorative svg. */
function TrendSpark({
  values,
  color,
  ariaLabel,
}: {
  values: number[];
  color: string;
  ariaLabel: string;
}) {
  const w = 120;
  const h = 34;
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label={ariaLabel}>
        <line x1={3} y1={h / 2} x2={w - 3} y2={h / 2} stroke={color} strokeOpacity={0.3} strokeDasharray="2 3" />
      </svg>
    );
  }
  return (
    <Sparkline
      values={values}
      width={w}
      height={h}
      responsive
      className="h-9 w-full"
      stroke={color}
      fill={color}
      areaOpacity={0.1}
      strokeWidth={1.5}
      dot
      label={ariaLabel}
    />
  );
}

export default function TrendPanel({
  trend,
  netDelta,
  poasDelta,
  period,
}: {
  trend: ProfitTrendPoint[];
  netDelta: number;
  poasDelta: number;
  period: string;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  const granularityLabel = period === "365" ? t("byMonths") : t("byWeeks");
  const granularityUnit = period === "365" ? t("month") : t("week");

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-800">{t("trendTitle")}</p>
        <p className="text-xs text-muted">{granularityLabel} · {trend.length}</p>
      </div>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("netProfit")}</span>
            <DeltaBadge delta={netDelta} goodDirection="up" size="xs" />
          </div>
          <div className="mt-1.5">
            <TrendSpark
              values={trend.map((t) => t.netProfit)}
              color="var(--color-brand-accent)"
              ariaLabel={t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtCZK(trend[trend.length - 1]!.netProfit) })}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtCZKCompact(trend[trend.length - 1]!.netProfit) })}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("poas")}</span>
            <DeltaBadge delta={poasDelta} goodDirection="up" size="xs" />
          </div>
          <div className="mt-1.5">
            <TrendSpark
              values={trend.map((t) => t.poas)}
              color="var(--color-navy-500)"
              ariaLabel={t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtMultiple(trend[trend.length - 1]!.poas) })}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtMultiple(trend[trend.length - 1]!.poas) })}
          </p>
        </div>
      </div>
    </div>
  );
}
