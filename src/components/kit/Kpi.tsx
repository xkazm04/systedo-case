/** KPI cell and strip (ADR-0014). The value sits in mono figures, the change is
 *  ALWAYS a glyph + a sign + a colour (never colour alone), and a small trend
 *  can ride on the right. The glyph shows DIRECTION (read from the delta's
 *  sign); the colour shows whether that is good, which is the caller's call:
 *  cost going up is bad, PNO going down is good. Server component. */
import type { ReactNode } from "react";

export type KpiTone = "good" | "bad" | "flat";

const TONE_CLASS: Record<KpiTone, string> = {
  good: "text-positive",
  bad: "text-negative",
  flat: "text-muted",
};

/** Direction from the pre-formatted delta: a leading minus (ASCII or U+2212)
 *  points down, a zero or a missing sign is flat. */
function glyphFor(delta: string): string {
  const d = delta.trim();
  if (/^[-−]/.test(d)) return "▼";
  if (/^\+?0+([.,]0+)?\s*%?$/.test(d)) return "■";
  return "▲";
}

export interface KpiProps {
  label: string;
  value: string;
  /** Unit shown before the value in small mono caps, e.g. "CZK". */
  unit?: string;
  /** Pre-formatted change, e.g. "+10.0 %". */
  delta?: string;
  tone?: KpiTone;
  /** Screen-reader sentence for the change, e.g. "up 10 % on the previous period, worse". */
  deltaLabel?: string;
  /** Secondary line under the value. */
  foot?: ReactNode;
  /** A small trend (e.g. a Sparkline) on the right. */
  spark?: ReactNode;
}

export function Kpi({ label, value, unit, delta, tone = "flat", deltaLabel, foot, spark }: KpiProps) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-muted">{label}</span>
        {delta ? (
          <span className={`inline-flex items-center gap-1 font-mono text-xs ${TONE_CLASS[tone]}`}>
            <span aria-hidden>{glyphFor(delta)}</span>
            <span aria-hidden>{delta}</span>
            <span className="sr-only">{deltaLabel ?? delta}</span>
          </span>
        ) : null}
      </div>
      <p className="whitespace-nowrap font-mono text-2xl font-medium tabular-nums text-ink sm:text-3xl">
        {unit ? <span className="mr-1.5 align-[0.15em] text-xs tracking-[0.06em] text-muted">{unit}</span> : null}
        {value}
      </p>
      {spark ? (
        <div aria-hidden className="row-span-2 h-9 w-24 justify-self-end">
          {spark}
        </div>
      ) : null}
      {foot ? <div className="text-sm text-muted">{foot}</div> : null}
    </div>
  );
}

/** A row of KPIs inside one instrument panel, divided by hairlines. Stacks on
 *  phones, flows into as many columns as fit from tablet up. */
export function KpiStrip({ items, label }: { items: KpiProps[]; label: string }) {
  return (
    <section
      aria-label={label}
      className="optic-panel grid divide-y divide-hair sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] [&>*]:border-hair sm:[&>*]:border-l sm:[&>*:first-child]:border-l-0"
    >
      {items.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </section>
  );
}
