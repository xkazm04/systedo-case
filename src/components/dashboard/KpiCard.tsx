import Sparkline from "@/components/charts/Sparkline";
import DeltaBadge from "@/components/dashboard/DeltaBadge";
import type { MetricMeta } from "@/lib/metrics";

/** One headline metric: current value, change vs the comparison window, a trend
 *  sparkline, and an optional contextual footnote (e.g. PNO vs. goal). */
export default function KpiCard({
  meta,
  value,
  delta,
  spark,
  footnote,
  emphasised = false,
}: {
  meta: MetricMeta;
  value: number;
  delta: number;
  spark: number[];
  footnote?: React.ReactNode;
  emphasised?: boolean;
}) {
  return (
    <div
      className={`card flex flex-col p-5 ${
        emphasised ? "ring-1 ring-brand-200" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted" title={meta.description}>
          {meta.label}
        </p>
        <DeltaBadge delta={delta} goodDirection={meta.goodDirection} size="xs" />
      </div>

      <p className="tnum mt-3 text-[1.7rem] font-semibold leading-none tracking-tight text-navy-800">
        {meta.format(value)}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-h-[18px] text-xs text-muted">{footnote}</div>
        <Sparkline
          values={spark}
          width={104}
          height={34}
          stroke={emphasised ? "var(--color-brand-600)" : "var(--color-navy-300)"}
          fill={emphasised ? "var(--color-brand-100)" : "var(--color-navy-50)"}
        />
      </div>
    </div>
  );
}
