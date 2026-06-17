"use client";

import { useState } from "react";
import Sparkline from "@/components/charts/Sparkline";
import { TrendUp } from "@/components/icons";
import type { DailyPoint } from "@/lib/campaigns/types";
import { fmtCZKCompact, fmtDate, fmtMultiple } from "@/lib/format";

type MetricKey = "conversionValue" | "cost" | "roas";

const METRICS: {
  key: MetricKey;
  label: string;
  good: "up" | "down";
  fmt: (n: number) => string;
}[] = [
  { key: "conversionValue", label: "Hodnota konverzí", good: "up", fmt: fmtCZKCompact },
  { key: "cost", label: "Náklady", good: "down", fmt: fmtCZKCompact },
  { key: "roas", label: "ROAS", good: "up", fmt: fmtMultiple },
];

function valueOf(p: DailyPoint, key: MetricKey): number {
  if (key === "roas") return p.cost > 0 ? p.conversionValue / p.cost : 0;
  return p[key];
}

/** Daily portfolio trend — the live counterpart to the per-campaign table, fed by
 *  the date-segmented series. Switchable metric, dependency-free SVG sparkline.
 *  Renders nothing until at least two days exist. */
export default function PortfolioTrend({ series }: { series: DailyPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("conversionValue");
  if (series.length < 2) return null;

  const m = METRICS.find((x) => x.key === metric)!;
  const values = series.map((p) => valueOf(p, metric));
  const last = values[values.length - 1];

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <TrendUp width={18} height={18} className="text-brand-600" />
            Vývoj výkonu v čase
          </h2>
          <p className="mt-1 text-sm text-muted">
            Denní průběh portfolia za zvolené období · poslední den{" "}
            <span className="tnum font-medium text-navy-700">{m.fmt(last)}</span>
          </p>
        </div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-pill border border-line bg-surface p-1">
          {METRICS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMetric(opt.key)}
              aria-pressed={metric === opt.key}
              className={`shrink-0 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors ${
                metric === opt.key ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Sparkline
        key={metric}
        values={values}
        width={900}
        height={140}
        strokeWidth={2.5}
        className="mt-5 h-36 w-full"
        area
        dot
        baseline
        autoColor
        goodDirection={m.good}
        describe
        formatValue={m.fmt}
      />

      <p className="mt-2 flex items-center justify-between text-[13px] text-muted">
        <span>{fmtDate(series[0]!.date)}</span>
        <span>{fmtDate(series[series.length - 1]!.date)}</span>
      </p>
    </section>
  );
}
