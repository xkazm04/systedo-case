/** Shared, server-usable selection + wording for the "Co stojí za pozornost"
 *  insights. Extracted VERBATIM from InsightsPanel (its former private
 *  `buildInsights`, thresholds and the `T` table) so the dashboard panel and the
 *  weekly-digest brief (Direction 2) rank + phrase insights through ONE builder
 *  instead of forking. Pure: no React, no hooks — the panel maps each line to JSX
 *  (byte-identical to before), the digest renders the plain `line` into its email
 *  and inbox section. */
import {
  compareInsightRank,
  metricShort,
  METRICS,
  type ChannelRow,
  type FunnelAttribution,
  type PeriodBaseline,
  type Significance,
  type Trend,
  type WeekdayProfilePoint,
} from "@/lib/metrics";
import type { MetricKey } from "@/lib/types";
import type { Formatters, SupportedLocale } from "@/lib/format";
import { interpolate, type TFn } from "@/lib/i18n/interpolate";
import { weekWord, weekdayName } from "./plural";

/** The insight strings (moved here from InsightsPanel unchanged), so the panel's
 *  `useT` and the digest's server translator read one source of truth. */
export const INSIGHT_T = {
  cs: {
    insights: "Co stojí za pozornost",
    insightRevenueUp: "Obrat vzrostl o {delta} oproti předchozímu období.",
    insightRevenueDown: "Obrat klesl o {delta} oproti předchozímu období.",
    insightRevenueUpYoy: "Obrat vzrostl o {delta} oproti stejnému období loni.",
    insightRevenueDownYoy: "Obrat klesl o {delta} oproti stejnému období loni.",
    insightPnoBelow: "Celkové PNO {pno} je pod cílem {goal}.",
    insightPnoAbove: "Celkové PNO {pno} je nad cílem {goal}.",
    insightBestRoas: "Nejefektivnější kanál je {channel} s ROAS {roas}.",
    insightWorstPno: "{channel} má nejvyšší PNO {pno}: prostor pro optimalizaci nabídek.",
    insightTrendDown: "{metric}: pokles {weeks} v řadě ({pct} kumulativně).",
    insightTrendUp: "{metric}: růst {weeks} v řadě ({pct} kumulativně).",
    insightWeekday:
      "Nejsilnější den je {best} ({bestPct} nad průměrem), nejslabší {worst} ({worstPct} pod průměrem).",
    insightFunnel: "Změnu obratu táhne hlavně {driver} ({share} vlivu).",
    insightMixUp: "Podíl kanálu {channel} vzrostl o {pp} p.b. za období.",
    insightMixDown: "Podíl kanálu {channel} klesl o {pp} p.b. za období.",
    funnelTraffic: "návštěvnost",
    funnelConversion: "konverzní poměr",
    funnelAov: "průměrná objednávka",
    funnelChangeCol: "změna",
    funnelShareCol: "vliv",
    funnelSharesTotal: "Součet vlivů",
    navFocusAria: "Zobrazit v grafu: {label}",
    navFocusHint: "Zobrazit tuto metriku v grafu",
    navMixAria: "Přejít na kanál v tabulce: {label}",
    navMixHint: "Přejít na tento kanál v tabulce kanálů",
    coverageDegraded:
      "Kratší historie dat: detekce anomálií a trendů je méně citlivá, slabší signály nemusí být zachyceny.",
    coverageInsufficient:
      "Zatím příliš málo dat pro spolehlivou detekci anomálií a trendů.",
  },
  en: {
    insights: "Worth noting",
    insightRevenueUp: "Revenue grew by {delta} vs the previous period.",
    insightRevenueDown: "Revenue fell by {delta} vs the previous period.",
    insightRevenueUpYoy: "Revenue grew by {delta} vs the same period last year.",
    insightRevenueDownYoy: "Revenue fell by {delta} vs the same period last year.",
    insightPnoBelow: "Overall PNO {pno} is below target {goal}.",
    insightPnoAbove: "Overall PNO {pno} is above target {goal}.",
    insightBestRoas: "The most efficient channel is {channel} with ROAS {roas}.",
    insightWorstPno: "{channel} has the highest PNO {pno}: room to optimize bids.",
    insightTrendDown: "{metric}: declining {weeks} in a row ({pct} cumulative).",
    insightTrendUp: "{metric}: rising {weeks} in a row ({pct} cumulative).",
    insightWeekday:
      "{best} is the strongest day ({bestPct} above average), {worst} the weakest ({worstPct} below).",
    insightFunnel: "The revenue move is driven mainly by {driver} ({share} of the effect).",
    insightMixUp: "{channel}'s share rose by {pp} pp over the period.",
    insightMixDown: "{channel}'s share fell by {pp} pp over the period.",
    funnelTraffic: "traffic",
    funnelConversion: "conversion rate",
    funnelAov: "average order value",
    funnelChangeCol: "change",
    funnelShareCol: "share",
    funnelSharesTotal: "Sum of shares",
    navFocusAria: "Show on the chart: {label}",
    navFocusHint: "Show this metric on the chart",
    navMixAria: "Go to the channel in the table: {label}",
    navMixHint: "Go to this channel in the channel table",
    coverageDegraded:
      "Short data history: anomaly and trend detection is less sensitive; weaker signals may be missed.",
    coverageInsufficient:
      "Too little data yet for reliable anomaly and trend detection.",
  },
} as const;

export type InsightTKey = keyof typeof INSIGHT_T.cs;

/** Server-side translator over INSIGHT_T for non-React callers (the digest),
 *  mirroring what `useT(INSIGHT_T)` gives the panel. */
export function makeInsightT(locale: SupportedLocale): TFn<InsightTKey> {
  const table = INSIGHT_T[locale] ?? INSIGHT_T.cs;
  return (key, vars) => interpolate(table[key] ?? INSIGHT_T.cs[key] ?? key, vars);
}

/** Where an insight navigates when clicked (panel only — the digest ignores it).
 *  `focus` pins the chart on a metric + a date; `mix` scrolls to the channel table. */
export type InsightAction =
  | { kind: "focus"; metric: MetricKey; date: string }
  | { kind: "mix"; channel: string };

/** One selected, phrased insight: the ranking metadata plus the final localized
 *  `line` string. The panel wraps `line` in JSX; the digest prints it directly. */
export interface InsightLine {
  /** stable identifier for the source rule (e.g. "trend:revenue", "pno") */
  id: string;
  /** the final, interpolated one-line text */
  line: string;
  tone: "good" | "warn" | "info";
  /** the engine's confidence in the underlying metric's move — drives ordering */
  significance: Significance;
  /** |relative change| (or gap-to-goal) for tie-breaking within a confidence tier */
  magnitude: number;
  /** when set, this is the funnel line: `line` is the summary and the panel renders
   *  the attribution as an expandable per-driver breakdown */
  funnel?: FunnelAttribution;
  /** when set, the panel renders the line as a button that navigates */
  action?: InsightAction;
}

/** Below ±0.5 % a revenue move is noise, not a story worth surfacing. */
export const MIN_REVENUE_DELTA_TO_REPORT = 0.005;
/** Report a channel mix shift only at a ≥3-percentage-point move in revenue share
 *  (current vs previous equal-length window). Below this the composition change is
 *  within ordinary week-to-week wobble and not worth a headline. Only ever non-zero
 *  on the time-resolved path (a dataset with a per-day channel mix). */
export const MIX_SHIFT_TO_REPORT = 0.03;
/** Flag "room to optimise bids" only when the worst channel's PNO is ≥30 % over goal. */
export const WORST_PNO_FLAG_MULTIPLE = 1.3;
/** Report the day-of-week shape only at a ≥15 pp strongest-vs-weakest spread. */
export const WEEKDAY_SPREAD_TO_REPORT = 0.15;

/** Localised label for a funnel driver. Shared by the builder and the panel's
 *  FunnelDisclosure so the two never disagree. */
export function funnelDriverLabel(
  driver: FunnelAttribution["dominant"],
  t: TFn<InsightTKey>
): string {
  return driver === "traffic"
    ? t("funnelTraffic")
    : driver === "conversion"
      ? t("funnelConversion")
      : t("funnelAov");
}

/** Everything the insight selection reads — the engine outputs the dashboard
 *  already derives (and the digest derives from the metrics snapshot). */
export interface InsightLineInput {
  channels: ChannelRow[];
  revenueDelta: number;
  pno: number;
  goalPno: number;
  trends: Trend[];
  profile: WeekdayProfilePoint[];
  funnel: FunnelAttribution | null;
  significance: Record<MetricKey, Significance>;
  baseline: PeriodBaseline;
  /** last date of the current window — where a whole-window insight pins the chart
   *  (panel only; pass "" from callers that never navigate, e.g. the digest) */
  windowEndDate: string;
}

/**
 * Build the ranked "Co stojí za pozornost" insight lines: sustained trends, the
 * mix shift, the revenue move (+ its funnel explanation), PNO-vs-goal, channel
 * efficiency and the day-of-week shape — ordered by the engine's confidence
 * (strong > weak > noise, ties by magnitude). Returns the FULL sorted list; the
 * caller slices (panel → 4, digest → 3). Pure and total.
 */
export function buildInsightLines(
  input: InsightLineInput,
  fmt: Formatters,
  t: TFn<InsightTKey>,
  locale: SupportedLocale
): InsightLine[] {
  const {
    channels,
    revenueDelta,
    pno,
    goalPno,
    trends,
    profile,
    funnel,
    significance,
    baseline,
    windowEndDate,
  } = input;
  const out: InsightLine[] = [];
  // A metric-backed insight that spans the whole window pins the chart on the
  // window's last point. Guarded so a dataless window never emits a dead button.
  const focusAt = (metric: MetricKey): InsightAction | undefined =>
    windowEndDate ? { kind: "focus", metric, date: windowEndDate } : undefined;
  const paid = channels.filter((ch) => ch.cost > 0);
  // Relative gap to the PNO goal — the tie-break magnitude for the PNO-level lines.
  const pnoGap = goalPno > 0 ? Math.abs(pno - goalPno) / goalPno : 0;

  for (const tr of trends) {
    const favourable = (tr.direction === "up") === (METRICS[tr.metric].goodDirection === "up");
    const line = t(tr.direction === "down" ? "insightTrendDown" : "insightTrendUp", {
      metric: metricShort(METRICS[tr.metric], locale),
      weeks: `${tr.weeks} ${weekWord(tr.weeks, locale)}`,
      pct: fmt.fmtSignedPct(tr.cumulativeChange),
    });
    out.push({
      id: `trend:${tr.metric}`,
      tone: favourable ? "good" : "warn",
      significance: significance[tr.metric],
      magnitude: Math.abs(tr.cumulativeChange),
      action: focusAt(tr.metric),
      line,
    });
  }

  // Mix shift: the biggest move in any channel's REVENUE SHARE over the period.
  const mixShift = channels
    .filter((ch) => ch.revenueShareDelta !== undefined)
    .reduce<ChannelRow | null>(
      (top, ch) =>
        Math.abs(ch.revenueShareDelta ?? 0) > Math.abs(top?.revenueShareDelta ?? 0) ? ch : top,
      null
    );
  if (mixShift && Math.abs(mixShift.revenueShareDelta ?? 0) >= MIX_SHIFT_TO_REPORT) {
    const d = mixShift.revenueShareDelta ?? 0;
    const line = t(d > 0 ? "insightMixUp" : "insightMixDown", {
      channel: mixShift.channel,
      pp: fmt.fmtInt(Math.abs(d) * 100),
    });
    out.push({
      id: "mix",
      tone: "info",
      significance: "strong",
      magnitude: Math.abs(d),
      action: { kind: "mix", channel: mixShift.channel },
      line,
    });
  }

  if (Number.isFinite(revenueDelta) && Math.abs(revenueDelta) > MIN_REVENUE_DELTA_TO_REPORT) {
    const line =
      revenueDelta > 0
        ? t(baseline === "yoy" ? "insightRevenueUpYoy" : "insightRevenueUp", {
            delta: fmt.fmtSignedPct(revenueDelta).replace("+", ""),
          })
        : t(baseline === "yoy" ? "insightRevenueDownYoy" : "insightRevenueDown", {
            delta: fmt.fmtSignedPct(revenueDelta).replace("-", ""),
          });
    out.push({
      id: "revenue",
      tone: revenueDelta > 0 ? "good" : "warn",
      significance: significance.revenue,
      magnitude: Math.abs(revenueDelta),
      action: focusAt("revenue"),
      line,
    });
  }

  // Explain the revenue move above: which funnel stage drove most of it. Shares the
  // revenue move's confidence + magnitude so it stays adjacent to the line it explains.
  if (funnel) {
    out.push({
      id: "funnel",
      tone: "info",
      significance: significance.revenue,
      magnitude: Math.abs(revenueDelta),
      funnel,
      line: t("insightFunnel", {
        driver: funnelDriverLabel(funnel.dominant, t),
        share: fmt.fmtPct(Math.abs(funnel.drivers[funnel.dominant].share), 0),
      }),
    });
  }

  const pnoLine =
    pno <= goalPno
      ? t("insightPnoBelow", { pno: fmt.fmtPct(pno), goal: fmt.fmtPct(goalPno, 0) })
      : t("insightPnoAbove", { pno: fmt.fmtPct(pno), goal: fmt.fmtPct(goalPno, 0) });
  out.push({
    id: "pno",
    tone: pno <= goalPno ? "good" : "warn",
    significance: significance.pno,
    magnitude: pnoGap,
    action: focusAt("pno"),
    line: pnoLine,
  });

  const bestRoas = [...paid].sort((a, b) => b.roas - a.roas)[0];
  if (bestRoas) {
    // Magnitude = the best channel's lead over the paid-field average ROAS.
    const avgRoas = paid.reduce((s, ch) => s + ch.roas, 0) / paid.length;
    out.push({
      id: "bestRoas",
      tone: "good",
      significance: significance.roas,
      magnitude: avgRoas > 0 ? Math.abs(bestRoas.roas - avgRoas) / avgRoas : 0,
      line: t("insightBestRoas", { channel: bestRoas.channel, roas: fmt.fmtMultiple(bestRoas.roas) }),
    });
  }

  const worstPno = [...paid].sort((a, b) => b.pno - a.pno)[0];
  if (worstPno && worstPno.pno > goalPno * WORST_PNO_FLAG_MULTIPLE) {
    out.push({
      id: "worstPno",
      tone: "warn",
      significance: significance.pno,
      magnitude: goalPno > 0 ? worstPno.pno / goalPno - 1 : 0,
      line: t("insightWorstPno", { channel: worstPno.channel, pno: fmt.fmtPct(worstPno.pno) }),
    });
  }

  const bestDay = profile.find((p) => p.best);
  const worstDay = profile.find((p) => p.worst);
  if (bestDay && worstDay && bestDay.index - worstDay.index >= WEEKDAY_SPREAD_TO_REPORT) {
    // The weekday shape is a visits distribution — rank it by visits confidence,
    // with the strongest-vs-weakest spread as its magnitude.
    out.push({
      id: "weekday",
      tone: "info",
      significance: significance.visits,
      magnitude: bestDay.index - worstDay.index,
      line: t("insightWeekday", {
        best: weekdayName(bestDay.day, locale),
        bestPct: fmt.fmtPct(bestDay.index - 1, 0).replace("-", ""),
        worst: weekdayName(worstDay.day, locale),
        worstPct: fmt.fmtPct(1 - worstDay.index, 0).replace("-", ""),
      }),
    });
  }

  // Order by the engine's confidence (strong > weak > noise, ties by magnitude);
  // Array.sort is stable, so the authoring order above breaks exact ties.
  return [...out].sort(compareInsightRank);
}
