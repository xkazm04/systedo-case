"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anomaly, Bucket } from "@/lib/metrics";
import { metricLabel, metricShort, METRICS, RATIO_METRICS } from "@/lib/metrics";
import type { MetricKey } from "@/lib/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    ariaWithCompare: "Vývoj metriky {label} v čase se srovnáním s předchozím obdobím",
    ariaNoCompare: "Vývoj metriky {label} v čase",
    anomalySpike: "Prudký nárůst {pct} nad očekávání",
    anomalyDrop: "Propad {pct} pod očekávání",
    anomalyOutage: "Výpadek — hodnota u nuly oproti očekávání",
    anomalyGoalBreach: "Překročení cílového PNO ({pno})",
    legendCurrent: "Aktuální období",
    legendPrevious: "Předchozí období",
    tooltipPrevious: "Předchozí",
    noChange: "beze změny",
    empty: "Pro zvolené období nejsou data.",
  },
  en: {
    ariaWithCompare: "Trend of metric {label} over time compared with the previous period",
    ariaNoCompare: "Trend of metric {label} over time",
    anomalySpike: "Sharp spike {pct} above expected",
    anomalyDrop: "Drop {pct} below expected",
    anomalyOutage: "Outage — value near zero vs expected",
    anomalyGoalBreach: "PNO target breached ({pno})",
    legendCurrent: "Current period",
    legendPrevious: "Previous period",
    tooltipPrevious: "Previous",
    noChange: "no change",
    empty: "No data for the selected period.",
  },
} as const;

const COLORS: Record<MetricKey, string> = {
  revenue: "var(--color-brand-500)",
  cost: "var(--color-coral-500)",
  visits: "var(--color-navy-400)",
  conversions: "var(--color-brand-700)",
  pno: "var(--color-navy-600)",
  aov: "var(--color-brand-500)",
  cr: "var(--color-brand-500)",
  roas: "var(--color-brand-500)",
};

const H = 300;
const PAD = { t: 18, r: 14, b: 30, l: 14 };
const READOUT: MetricKey[] = ["revenue", "cost", "conversions", "visits", "pno"];

export default function TrendChart({
  data,
  compare,
  metric,
  granularity,
  anomalies,
}: {
  data: Bucket[];
  /** equal-length previous window, overlaid index-aligned as a faint dotted line */
  compare?: Bucket[];
  metric: MetricKey;
  granularity: "day" | "month";
  /** flagged days for the whole series; only those matching the current metric
   *  and a visible bucket are drawn as markers */
  anomalies?: Anomaly[];
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = data.length;
  const values = data.map((d) => d[metric]);
  const color = COLORS[metric];
  const meta = METRICS[metric];

  // Anomalies for the current metric, mapped to the visible bucket index (exact
  // date for daily granularity, same YYYY-MM for monthly). Keep the most extreme
  // when several map to one bucket.
  const anomalyByIndex = new Map<number, Anomaly>();
  if (anomalies) {
    for (const a of anomalies) {
      if (a.metric !== metric) continue;
      const idx =
        granularity === "month"
          ? data.findIndex((d) => d.date.slice(0, 7) === a.date.slice(0, 7))
          : data.findIndex((d) => d.date === a.date);
      if (idx < 0) continue;
      const prev = anomalyByIndex.get(idx);
      if (!prev || Math.abs(a.z) > Math.abs(prev.z)) anomalyByIndex.set(idx, a);
    }
  }

  // Comparison window, aligned to the current series by index (point i of the
  // prior window sits under point i of the current one). Clipped to the current
  // length so a one-bucket month-boundary difference never overruns the axis.
  const cmpN = compare ? Math.min(n, compare.length) : 0;
  const cmpValues = compare ? compare.slice(0, cmpN).map((d) => d[metric]) : [];
  const hasCompare = cmpN > 1;

  const plotW = Math.max(1, w - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;

  // Scale the y-axis to both series so the dotted overlay never clips off-chart.
  const domainValues = hasCompare ? values.concat(cmpValues) : values;
  const dataMax = Math.max(...domainValues, 0);
  const dataMin = Math.min(...domainValues);
  // Ratio/efficiency metrics (PNO, ROAS, AOV, CR) don't naturally start at zero,
  // so zoom the axis to the data range — otherwise a 3.8×→4.2× ROAS move reads flat.
  const isRatio = RATIO_METRICS.has(metric);
  const yMin = isRatio ? Math.max(0, dataMin * 0.85) : 0;
  const yMax = (isRatio ? dataMax * 1.1 : dataMax * 1.08) || 1;

  const x = useCallback(
    (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    [n, plotW]
  );
  const y = useCallback(
    (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * plotH,
    [yMin, yMax, plotH]
  );

  // Guard the (currently dormant) empty-series case: every render access below
  // assumes ≥1 bucket — e.g. the tooltip reads data[active] where active = n-1, so
  // data[-1] would throw. A short period config or a future data source could yield
  // no buckets; render a muted placeholder instead. Placed after all hooks so the
  // rules-of-hooks order is preserved.
  if (n === 0) {
    return (
      <div
        ref={wrapRef}
        className="flex h-[300px] items-center justify-center rounded-card border border-line bg-canvas/40 text-sm text-muted"
      >
        {t("empty")}
      </div>
    );
  }

  const linePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)} ${(H - PAD.b).toFixed(1)} L${x(0).toFixed(
    1
  )} ${(H - PAD.b).toFixed(1)} Z`;

  const comparePath = hasCompare
    ? cmpValues
        .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
        .join(" ")
    : "";

  // gridlines
  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);

  // x labels — about 6 evenly spaced
  const labelStep = Math.max(1, Math.ceil(n / 6));
  const xLabels = data
    .map((d, i) => ({ i, d }))
    .filter(({ i }) => i % labelStep === 0 || i === n - 1);

  const fmtX = (iso: string) =>
    granularity === "month" ? fmt.fmtMonth(iso) : fmt.fmtDateShort(iso);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    // the overlay rect's own left edge already sits at x = PAD.l, so px is
    // measured from the plot origin — no extra PAD.l offset needed.
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.round((px / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  };

  const active = hover ?? n - 1;
  const activeAnomaly = anomalyByIndex.get(active);
  const tipBucket = data[active];
  const tipX = x(active);
  // keep the tooltip inside the chart bounds
  const tipLeft = Math.min(Math.max(tipX, 90), w - 90);

  // prior value + period-over-period delta at the hovered point, for the tooltip
  const cmpVal = active < cmpN ? cmpValues[active] : undefined;
  const curVal = tipBucket[metric];
  const cmpDelta =
    cmpVal !== undefined && cmpVal > 0 ? (curVal - cmpVal) / cmpVal : undefined;
  const cmpImproving =
    cmpDelta === undefined ? false : meta.goodDirection === "up" ? cmpDelta > 0 : cmpDelta < 0;

  const gradId = `grad-${metric}`;

  /** Locale-bound reason string for an anomaly marker's tooltip. */
  function anomalyReason(a: Anomaly): string {
    const devPct = a.expected > 0 ? (a.observed - a.expected) / a.expected : 0;
    switch (a.kind) {
      case "spike":
        return t("anomalySpike", { pct: fmt.fmtSignedPct(devPct) });
      case "drop":
        return t("anomalyDrop", { pct: fmt.fmtSignedPct(devPct) });
      case "outage":
        return t("anomalyOutage");
      case "goal-breach":
        return t("anomalyGoalBreach", { pno: fmt.fmtPct(a.observed) });
    }
  }

  /** A favourable anomaly = movement in the metric's good direction. */
  function anomalyFavourable(a: Anomaly, good: "up" | "down"): boolean {
    if (a.kind === "outage" || a.kind === "goal-breach") return false;
    return a.kind === "spike" ? good === "up" : good === "down";
  }

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        role="img"
        aria-label={
          hasCompare
            ? t("ariaWithCompare", { label: metricLabel(meta, locale) })
            : t("ariaNoCompare", { label: metricLabel(meta, locale) })
        }
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* gridlines + y labels */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              x2={w - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-line)"
              strokeWidth={1}
              strokeDasharray={i === 0 ? "0" : "3 4"}
            />
            <text
              x={PAD.l}
              y={y(v) - 4}
              className="tnum fill-muted text-[12px]"
              style={{ fontSize: 10 }}
            >
              {meta.formatCompact(v)}
            </text>
          </g>
        ))}

        {/* previous-period overlay — faint dotted line, drawn under the current
            series so the live line always stays on top */}
        {hasCompare && (
          <path
            key={`cmp-${metric}-${cmpN}`}
            className="animate-fade-in"
            d={comparePath}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            strokeDasharray="1 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.5}
          />
        )}

        {/* area + line — keyed so it re-fades when the series or metric changes */}
        <g key={`${metric}-${n}`} className="animate-fade-in">
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* anomaly markers — diamonds tinted by whether the move is favourable */}
        {[...anomalyByIndex.entries()].map(([i, a]) => {
          const tone = anomalyFavourable(a, meta.goodDirection)
            ? "var(--color-brand-600)"
            : "var(--color-coral-500)";
          const cx = x(i);
          const cy = y(values[i]);
          return (
            <rect
              key={`anom-${metric}-${i}`}
              className="animate-fade-in"
              x={cx - 4}
              y={cy - 4}
              width={8}
              height={8}
              fill="var(--color-surface)"
              stroke={tone}
              strokeWidth={2}
              transform={`rotate(45 ${cx.toFixed(1)} ${cy.toFixed(1)})`}
            >
              <title>{`${fmtX(data[i].date)}: ${anomalyReason(a)}`}</title>
            </rect>
          );
        })}

        {/* x labels */}
        {xLabels.map(({ i, d }) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            className="fill-muted text-[12px]"
            style={{ fontSize: 10 }}
          >
            {fmtX(d.date)}
          </text>
        ))}

        {/* hover crosshair + marker */}
        {hover !== null && (
          <g>
            <line
              x1={tipX}
              x2={tipX}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            {cmpVal !== undefined && (
              <circle
                cx={tipX}
                cy={y(cmpVal)}
                r={3.5}
                fill="var(--color-surface)"
                stroke={color}
                strokeWidth={1.5}
                opacity={0.6}
              />
            )}
            <circle cx={tipX} cy={y(tipBucket[metric])} r={5} fill="white" stroke={color} strokeWidth={2.5} />
          </g>
        )}

        {/* pointer capture overlay */}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: "none" }}
        />
      </svg>

      {/* legend — only when the comparison overlay is present */}
      {hasCompare && (
        <div className="mt-2 flex items-center justify-center gap-4 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: color }} />
            {t("legendCurrent")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 border-t-2 border-dotted"
              style={{ borderColor: color, opacity: 0.55 }}
            />
            {t("legendPrevious")}
          </span>
        </div>
      )}

      {/* tooltip */}
      {hover !== null && (
        <div
          data-testid="trend-tooltip"
          className="pointer-events-none absolute top-1.5 z-10 w-44 -translate-x-1/2 rounded-xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur"
          style={{ left: tipLeft }}
        >
          <p className="text-xs font-semibold text-navy-700">
            {granularity === "month" ? fmt.fmtMonth(tipBucket.date) : fmt.fmtDateShort(tipBucket.date)}
          </p>
          <p className="tnum mt-1 text-lg font-semibold" style={{ color }}>
            {meta.format(tipBucket[metric])}
          </p>
          {activeAnomaly && (
            <p
              className={`mt-1 text-[13px] font-medium ${
                anomalyFavourable(activeAnomaly, meta.goodDirection)
                  ? "text-positive"
                  : "text-coral-600"
              }`}
            >
              {anomalyReason(activeAnomaly)}
            </p>
          )}
          {cmpVal !== undefined && (
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-line pt-1.5 text-[13px]">
              <span className="text-muted">
                {t("tooltipPrevious")}{" "}
                <span className="tnum font-medium text-navy-700">{meta.formatCompact(cmpVal)}</span>
              </span>
              {cmpDelta !== undefined && Math.abs(cmpDelta) >= 0.0005 ? (
                <span
                  className={`tnum font-semibold ${cmpImproving ? "text-positive" : "text-negative"}`}
                >
                  {fmt.fmtSignedPct(cmpDelta)}
                </span>
              ) : (
                <span className="text-muted">{t("noChange")}</span>
              )}
            </div>
          )}
          <dl className="mt-2 space-y-1 border-t border-line pt-2">
            {READOUT.filter((m) => m !== metric).map((m) => (
              <div key={m} className="flex items-center justify-between gap-2 text-[13px]">
                <dt className="text-muted">{metricShort(METRICS[m], locale)}</dt>
                <dd className="tnum font-medium text-navy-700">
                  {METRICS[m].formatCompact(tipBucket[m])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
