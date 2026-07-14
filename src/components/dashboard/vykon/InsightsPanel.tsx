"use client";

import { Bulb, ChevronRight, TrendDown, TrendUp } from "@/components/icons";
import {
  type ChannelRow,
  type Coverage,
  type FunnelAttribution,
  type PeriodBaseline,
  type Significance,
  type Trend,
  type WeekdayProfilePoint,
} from "@/lib/metrics";
import type { MetricKey } from "@/lib/types";
import type { Formatters, SupportedLocale } from "@/lib/format";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TFn } from "@/lib/i18n/interpolate";
import {
  buildInsightLines,
  funnelDriverLabel,
  INSIGHT_T,
  type InsightTKey,
} from "./insight-lines";

const T = INSIGHT_T;

/** The three funnel drivers, in the order the disclosure lists them. */
const FUNNEL_DRIVERS: FunnelAttribution["dominant"][] = ["traffic", "conversion", "aov"];

/** The expandable per-driver breakdown of a revenue move: the one-line summary as
 *  the disclosure trigger, and — when opened — traffic / conversion rate / AOV each
 *  with its relative change and signed share of the move, plus the shares' total
 *  (they sum to exactly 100 % by construction — see funnel.ts). Keyboard-accessible
 *  via the native <details>/<summary>. */
function FunnelDisclosure({
  summary,
  funnel,
  fmt,
  t,
}: {
  summary: React.ReactNode;
  funnel: FunnelAttribution;
  fmt: Formatters;
  t: TFn<InsightTKey>;
}) {
  const sharesTotal = FUNNEL_DRIVERS.reduce((s, k) => s + funnel.drivers[k].share, 0);
  const cols = "grid grid-cols-[1fr_auto_auto] items-center gap-x-3";
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-start gap-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          width={14}
          height={14}
          className="mt-0.5 shrink-0 text-navy-400 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span>{summary}</span>
      </summary>
      <div className="mt-2 border-l-2 border-navy-50 pl-3">
        <div className={`${cols} text-[11px] uppercase tracking-wide text-muted`}>
          <span />
          <span className="w-14 text-right">{t("funnelChangeCol")}</span>
          <span className="w-12 text-right">{t("funnelShareCol")}</span>
        </div>
        {FUNNEL_DRIVERS.map((k) => (
          <div key={k} className={`${cols} py-0.5 text-[13px]`}>
            <span className="text-navy-700">{funnelDriverLabel(k, t)}</span>
            <span className="tnum w-14 text-right text-navy-700">
              {fmt.fmtSignedPct(funnel.drivers[k].change)}
            </span>
            <span className="tnum w-12 text-right font-medium text-navy-800">
              {fmt.fmtSignedPct(funnel.drivers[k].share, 0)}
            </span>
          </div>
        ))}
        <div className={`${cols} mt-1 border-t border-navy-50 pt-1 text-[13px]`}>
          <span className="text-muted">{t("funnelSharesTotal")}</span>
          <span />
          <span className="tnum w-12 text-right font-semibold text-navy-800">
            {fmt.fmtPct(sharesTotal, 0)}
          </span>
        </div>
      </div>
    </details>
  );
}

/** Adapt the shared, server-usable insight lines (selection + wording now live in
 *  ./insight-lines, reused by the weekly-digest brief) to the panel's render model:
 *  each `line` becomes the display text and — when the line carries a navigation
 *  action — the button's aria-label. Rendering a raw string is DOM-identical to the
 *  former `<>{line}</>`, so the panel stays byte-for-byte unchanged; the top-4 cap
 *  that used to live in the builder is applied here (the digest slices its own 3). */
function buildInsights(
  channels: ChannelRow[],
  revenueDelta: number,
  pno: number,
  goalPno: number,
  trends: Trend[],
  profile: WeekdayProfilePoint[],
  funnel: FunnelAttribution | null,
  significance: Record<MetricKey, Significance>,
  baseline: PeriodBaseline,
  windowEndDate: string,
  fmt: Formatters,
  t: TFn<InsightTKey>,
  locale: SupportedLocale
) {
  return buildInsightLines(
    { channels, revenueDelta, pno, goalPno, trends, profile, funnel, significance, baseline, windowEndDate },
    fmt,
    t,
    locale
  ).slice(0, 4);
}

/** The auto-generated "Co stojí za pozornost" list — sustained trends first,
 *  then the revenue move, PNO-vs-goal, channel efficiency and day-of-week shape. */
export default function InsightsPanel({
  channels,
  revenueDelta,
  pno,
  goalPno,
  trends,
  profile,
  significance,
  coverage = "full",
  funnel = null,
  baseline = "previous",
  windowEndDate = "",
  onFocusMetric,
  onMixShift,
}: {
  channels: ChannelRow[];
  revenueDelta: number;
  pno: number;
  goalPno: number;
  trends: Trend[];
  profile: WeekdayProfilePoint[];
  /** per-metric period-over-period significance — orders the insight list so the
   *  moves the engine is most confident are real lead (strong > weak > noise) */
  significance: Record<MetricKey, Significance>;
  /** how much history the detectors had — drives an honest note when short */
  coverage?: Coverage;
  /** funnel attribution of the revenue move (traffic vs CR vs AOV), when strong */
  funnel?: FunnelAttribution | null;
  /** comparison baseline in effect — keeps the revenue insight's wording honest
   *  ("vs the previous period" vs "vs the same period last year") */
  baseline?: PeriodBaseline;
  /** last date of the current window — where a whole-window insight pins the chart */
  windowEndDate?: string;
  /** pin the trend chart on a metric + date (Direction 3 navigation) */
  onFocusMetric?: (metric: MetricKey, date: string) => void;
  /** scroll to the channel table and flash a channel's row (Direction 3) */
  onMixShift?: (channel: string) => void;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  const insights = buildInsights(channels, revenueDelta, pno, goalPno, trends, profile, funnel, significance, baseline, windowEndDate, fmt, t, locale);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
        <Bulb width={17} height={17} className="text-brand-600" />
        {t("insights")}
      </div>
      <ul className="mt-3 space-y-3">
        {insights.map((ins, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                ins.tone === "good"
                  ? "bg-positive-soft text-positive"
                  : ins.tone === "warn"
                    ? "bg-coral-soft text-coral-600"
                    : "bg-navy-50 text-navy-500"
              }`}
            >
              {ins.tone === "warn" ? <TrendDown width={12} height={12} /> : <TrendUp width={12} height={12} />}
            </span>
            <div className="min-w-0 flex-1 leading-snug text-navy-700">
              {ins.funnel ? (
                <FunnelDisclosure summary={ins.line} funnel={ins.funnel} fmt={fmt} t={t} />
              ) : ins.action && (ins.action.kind === "focus" ? onFocusMetric : onMixShift) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (ins.action?.kind === "focus") onFocusMetric?.(ins.action.metric, ins.action.date);
                    else if (ins.action?.kind === "mix") onMixShift?.(ins.action.channel);
                  }}
                  aria-label={t(ins.action.kind === "focus" ? "navFocusAria" : "navMixAria", {
                    label: ins.line,
                  })}
                  title={t(ins.action.kind === "focus" ? "navFocusHint" : "navMixHint")}
                  className="-mx-1.5 -my-0.5 block w-[calc(100%+0.75rem)] rounded-lg px-1.5 py-0.5 text-left transition-colors hover:bg-canvas/70 hover:text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                >
                  {ins.line}
                </button>
              ) : (
                ins.line
              )}
            </div>
          </li>
        ))}
      </ul>
      {coverage !== "full" && (
        <p className="mt-3 border-t border-navy-50 pt-3 text-xs text-muted">
          {t(coverage === "insufficient" ? "coverageInsufficient" : "coverageDegraded")}
        </p>
      )}
    </div>
  );
}
