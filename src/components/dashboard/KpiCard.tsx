import Sparkline from "@/components/charts/Sparkline";
import DeltaBadge from "@/components/dashboard/DeltaBadge";
import { metricDescription, metricLabel, type MetricMeta, type Significance } from "@/lib/metrics";
import { createFormatters, type SupportedLocale } from "@/lib/format";

/** One headline metric: current value, change vs the comparison window, a trend
 *  sparkline, and an optional contextual footnote (e.g. PNO vs. goal). */
export default function KpiCard({
  meta,
  locale,
  value,
  delta,
  significance,
  spark,
  footnote,
  emphasised = false,
  delayMs = 0,
}: {
  meta: MetricMeta;
  locale?: SupportedLocale;
  value: number;
  delta: number;
  significance?: Significance;
  spark: number[];
  footnote?: React.ReactNode;
  emphasised?: boolean;
  delayMs?: number;
}) {
  // Locale-bound formatters, so the headline value and the sparkline endpoints
  // follow the active locale instead of the metric registry's Czech default.
  const f = createFormatters(locale);
  return (
    <div
      className={`card flex animate-fade-up flex-col p-4 sm:p-5 ${
        emphasised ? "ring-1 ring-brand-200" : ""
      }`}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted" title={metricDescription(meta, locale)}>
          {metricLabel(meta, locale)}
        </p>
        <DeltaBadge
          delta={delta}
          goodDirection={meta.goodDirection}
          size="xs"
          significance={significance}
        />
      </div>

      <p className="tnum mt-3 text-2xl font-semibold leading-none tracking-tight text-navy-800">
        {meta.format(value, f)}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-h-[18px] text-xs text-muted">{footnote}</div>
        <Sparkline
          values={spark}
          width={104}
          height={34}
          autoColor
          goodDirection={meta.goodDirection}
          dot
          baseline
          describe
          formatValue={(n) => meta.formatCompact(n, f)}
          stroke={emphasised ? "var(--color-brand-600)" : "var(--color-navy-300)"}
          fill={emphasised ? "var(--color-brand-100)" : "var(--color-navy-50)"}
        />
      </div>
    </div>
  );
}
