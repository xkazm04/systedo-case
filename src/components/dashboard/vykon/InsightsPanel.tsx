"use client";

import { Bulb, TrendDown, TrendUp } from "@/components/icons";
import { weekWord } from "./plural";
import { weekdayName } from "@/components/dashboard/vykon/plural";
import {
  compareInsightRank,
  metricShort,
  METRICS,
  type ChannelRow,
  type Coverage,
  type FunnelAttribution,
  type Significance,
  type Trend,
  type WeekdayProfilePoint,
} from "@/lib/metrics";
import type { MetricKey } from "@/lib/types";
import type { Formatters, SupportedLocale } from "@/lib/format";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TFn } from "@/lib/i18n/interpolate";

const T = {
  cs: {
    insights: "Co stojí za pozornost",
    insightRevenueUp: "Obrat vzrostl o {delta} oproti předchozímu období.",
    insightRevenueDown: "Obrat klesl o {delta} oproti předchozímu období.",
    insightPnoBelow: "Celkové PNO {pno} je pod cílem {goal}.",
    insightPnoAbove: "Celkové PNO {pno} je nad cílem {goal}.",
    insightBestRoas: "Nejefektivnější kanál je {channel} s ROAS {roas}.",
    insightWorstPno: "{channel} má nejvyšší PNO {pno} — prostor pro optimalizaci nabídek.",
    insightTrendDown: "{metric} — pokles {weeks} v řadě ({pct} kumulativně).",
    insightTrendUp: "{metric} — růst {weeks} v řadě ({pct} kumulativně).",
    insightWeekday:
      "Nejsilnější den je {best} ({bestPct} nad průměrem), nejslabší {worst} ({worstPct} pod).",
    insightFunnel: "Změnu obratu táhne hlavně {driver} ({share} vlivu).",
    insightMixUp: "Podíl kanálu {channel} vzrostl o {pp} p.b. za období.",
    insightMixDown: "Podíl kanálu {channel} klesl o {pp} p.b. za období.",
    funnelTraffic: "návštěvnost",
    funnelConversion: "konverzní poměr",
    funnelAov: "průměrná objednávka",
    coverageDegraded:
      "Kratší historie dat — anomálie a trendy jsou méně citlivé, slabší signály nemusí být zachyceny.",
    coverageInsufficient:
      "Zatím příliš málo dat pro spolehlivou detekci anomálií a trendů.",
  },
  en: {
    insights: "Worth noting",
    insightRevenueUp: "Revenue grew by {delta} vs the previous period.",
    insightRevenueDown: "Revenue fell by {delta} vs the previous period.",
    insightPnoBelow: "Overall PNO {pno} is below target {goal}.",
    insightPnoAbove: "Overall PNO {pno} is above target {goal}.",
    insightBestRoas: "Most efficient channel is {channel} with ROAS {roas}.",
    insightWorstPno: "{channel} has the highest PNO {pno} — room to optimise bids.",
    insightTrendDown: "{metric} — declining {weeks} in a row ({pct} cumulative).",
    insightTrendUp: "{metric} — rising {weeks} in a row ({pct} cumulative).",
    insightWeekday:
      "{best} is the strongest day ({bestPct} above average), {worst} the weakest ({worstPct} below).",
    insightFunnel: "The revenue move is driven mainly by {driver} ({share} of the effect).",
    insightMixUp: "{channel}'s share rose by {pp} pp over the period.",
    insightMixDown: "{channel}'s share fell by {pp} pp over the period.",
    funnelTraffic: "traffic",
    funnelConversion: "conversion rate",
    funnelAov: "average order value",
    coverageDegraded:
      "Short data history — anomaly and trend detection is less sensitive; weaker signals may be missed.",
    coverageInsufficient:
      "Too little data yet for reliable anomaly and trend detection.",
  },
} as const;

interface Insight {
  text: React.ReactNode;
  tone: "good" | "warn" | "info";
  /** the engine's confidence in the underlying metric's move — drives ordering */
  significance: Significance;
  /** |relative change| (or gap-to-goal) for tie-breaking within a confidence tier */
  magnitude: number;
}

/** Below ±0.5 % a revenue move is noise, not a story worth surfacing. */
const MIN_REVENUE_DELTA_TO_REPORT = 0.005;
/** Report a channel mix shift only at a ≥3-percentage-point move in revenue share
 *  (current vs previous equal-length window). Below this the composition change is
 *  within ordinary week-to-week wobble and not worth a headline. Only ever non-zero
 *  on the time-resolved path (a dataset with a per-day channel mix). */
const MIX_SHIFT_TO_REPORT = 0.03;
/** Flag "room to optimise bids" only when the worst channel's PNO is ≥30 % over goal. */
const WORST_PNO_FLAG_MULTIPLE = 1.3;
/** Report the day-of-week shape only at a ≥15 pp strongest-vs-weakest spread. */
const WEEKDAY_SPREAD_TO_REPORT = 0.15;

/** Localised label for a funnel driver. */
function funnelDriverLabel(
  driver: FunnelAttribution["dominant"],
  t: TFn<keyof typeof T.cs>
): string {
  return driver === "traffic"
    ? t("funnelTraffic")
    : driver === "conversion"
      ? t("funnelConversion")
      : t("funnelAov");
}

function buildInsights(
  channels: ChannelRow[],
  revenueDelta: number,
  pno: number,
  goalPno: number,
  trends: Trend[],
  profile: WeekdayProfilePoint[],
  funnel: FunnelAttribution | null,
  significance: Record<MetricKey, Significance>,
  fmt: Formatters,
  t: TFn<keyof typeof T.cs>,
  locale: SupportedLocale
): Insight[] {
  const out: Insight[] = [];
  const paid = channels.filter((ch) => ch.cost > 0);
  // Relative gap to the PNO goal — the tie-break magnitude for the PNO-level lines.
  const pnoGap = goalPno > 0 ? Math.abs(pno - goalPno) / goalPno : 0;

  // Each insight carries the engine's confidence in its underlying metric plus a
  // magnitude, so the list can be ordered by "how sure are we this is real?"
  // (strong > weak > noise, ties by magnitude) instead of authoring order. The
  // authoring order below is still the final, stable tiebreak — keeping a revenue
  // move and its funnel explanation adjacent.
  for (const tr of trends) {
    const favourable = (tr.direction === "up") === (METRICS[tr.metric].goodDirection === "up");
    out.push({
      tone: favourable ? "good" : "warn",
      significance: significance[tr.metric],
      magnitude: Math.abs(tr.cumulativeChange),
      text: (
        <>
          {t(tr.direction === "down" ? "insightTrendDown" : "insightTrendUp", {
            metric: metricShort(METRICS[tr.metric], locale),
            weeks: `${tr.weeks} ${weekWord(tr.weeks, locale)}`,
            pct: fmt.fmtSignedPct(tr.cumulativeChange),
          })}
        </>
      ),
    });
  }

  // Mix shift: the biggest move in any channel's REVENUE SHARE over the period —
  // only ever present on the time-resolved path, where each channel is summed from
  // its own daily mix (the static projection holds every share constant, so
  // revenueShareDelta is undefined there). Ranked "strong": a move past the
  // threshold is a real composition change, not aggregate noise redistributed.
  const mixShift = channels
    .filter((ch) => ch.revenueShareDelta !== undefined)
    .reduce<ChannelRow | null>(
      (top, ch) =>
        Math.abs(ch.revenueShareDelta ?? 0) > Math.abs(top?.revenueShareDelta ?? 0) ? ch : top,
      null
    );
  if (mixShift && Math.abs(mixShift.revenueShareDelta ?? 0) >= MIX_SHIFT_TO_REPORT) {
    const d = mixShift.revenueShareDelta ?? 0;
    out.push({
      tone: "info",
      significance: "strong",
      magnitude: Math.abs(d),
      text: (
        <>
          {t(d > 0 ? "insightMixUp" : "insightMixDown", {
            channel: mixShift.channel,
            pp: fmt.fmtInt(Math.abs(d) * 100),
          })}
        </>
      ),
    });
  }

  if (Number.isFinite(revenueDelta) && Math.abs(revenueDelta) > MIN_REVENUE_DELTA_TO_REPORT) {
    out.push({
      tone: revenueDelta > 0 ? "good" : "warn",
      significance: significance.revenue,
      magnitude: Math.abs(revenueDelta),
      text: (
        <>
          {revenueDelta > 0
            ? t("insightRevenueUp", { delta: fmt.fmtSignedPct(revenueDelta).replace("+", "") })
            : t("insightRevenueDown", { delta: fmt.fmtSignedPct(revenueDelta).replace("-", "") })}
        </>
      ),
    });
  }

  // Explain the revenue move the line above just reported: which funnel stage
  // (traffic / conversion rate / AOV) drove most of it. Shares the revenue move's
  // confidence + magnitude so it stays adjacent to the line it explains.
  if (funnel) {
    out.push({
      tone: "info",
      significance: significance.revenue,
      magnitude: Math.abs(revenueDelta),
      text: (
        <>
          {t("insightFunnel", {
            driver: funnelDriverLabel(funnel.dominant, t),
            share: fmt.fmtPct(Math.abs(funnel.drivers[funnel.dominant].share), 0),
          })}
        </>
      ),
    });
  }

  out.push({
    tone: pno <= goalPno ? "good" : "warn",
    significance: significance.pno,
    magnitude: pnoGap,
    text: (
      <>
        {pno <= goalPno
          ? t("insightPnoBelow", { pno: fmt.fmtPct(pno), goal: fmt.fmtPct(goalPno, 0) })
          : t("insightPnoAbove", { pno: fmt.fmtPct(pno), goal: fmt.fmtPct(goalPno, 0) })}
      </>
    ),
  });

  const bestRoas = [...paid].sort((a, b) => b.roas - a.roas)[0];
  if (bestRoas) {
    // Magnitude = the best channel's lead over the paid-field average ROAS.
    const avgRoas = paid.reduce((s, ch) => s + ch.roas, 0) / paid.length;
    out.push({
      tone: "good",
      significance: significance.roas,
      magnitude: avgRoas > 0 ? Math.abs(bestRoas.roas - avgRoas) / avgRoas : 0,
      text: (
        <>{t("insightBestRoas", { channel: bestRoas.channel, roas: fmt.fmtMultiple(bestRoas.roas) })}</>
      ),
    });
  }

  const worstPno = [...paid].sort((a, b) => b.pno - a.pno)[0];
  if (worstPno && worstPno.pno > goalPno * WORST_PNO_FLAG_MULTIPLE) {
    out.push({
      tone: "warn",
      significance: significance.pno,
      magnitude: goalPno > 0 ? worstPno.pno / goalPno - 1 : 0,
      text: <>{t("insightWorstPno", { channel: worstPno.channel, pno: fmt.fmtPct(worstPno.pno) })}</>,
    });
  }

  const bestDay = profile.find((p) => p.best);
  const worstDay = profile.find((p) => p.worst);
  if (bestDay && worstDay && bestDay.index - worstDay.index >= WEEKDAY_SPREAD_TO_REPORT) {
    // The weekday shape is a visits distribution — rank it by visits confidence,
    // with the strongest-vs-weakest spread as its magnitude.
    out.push({
      tone: "info",
      significance: significance.visits,
      magnitude: bestDay.index - worstDay.index,
      text: (
        <>
          {t("insightWeekday", {
            best: weekdayName(bestDay.day, locale),
            bestPct: fmt.fmtPct(bestDay.index - 1, 0).replace("-", ""),
            worst: weekdayName(worstDay.day, locale),
            worstPct: fmt.fmtPct(1 - worstDay.index, 0).replace("-", ""),
          })}
        </>
      ),
    });
  }

  // Order by the engine's confidence (strong > weak > noise, ties by magnitude);
  // Array.sort is stable, so the authoring order above breaks exact ties. Then cap.
  return [...out].sort(compareInsightRank).slice(0, 4);
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
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  const insights = buildInsights(channels, revenueDelta, pno, goalPno, trends, profile, funnel, significance, fmt, t, locale);

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
            <span className="leading-snug text-navy-700">{ins.text}</span>
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
