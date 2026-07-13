"use client";

import { Bulb, TrendDown, TrendUp } from "@/components/icons";
import { weekWord } from "./plural";
import { weekdayName } from "@/components/dashboard/vykon/plural";
import {
  metricShort,
  METRICS,
  type ChannelRow,
  type Trend,
  type WeekdayProfilePoint,
} from "@/lib/metrics";
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
  },
} as const;

interface Insight {
  text: React.ReactNode;
  tone: "good" | "warn" | "info";
}

/** Below ±0.5 % a revenue move is noise, not a story worth surfacing. */
const MIN_REVENUE_DELTA_TO_REPORT = 0.005;
/** Flag "room to optimise bids" only when the worst channel's PNO is ≥30 % over goal. */
const WORST_PNO_FLAG_MULTIPLE = 1.3;
/** Report the day-of-week shape only at a ≥15 pp strongest-vs-weakest spread. */
const WEEKDAY_SPREAD_TO_REPORT = 0.15;

function buildInsights(
  channels: ChannelRow[],
  revenueDelta: number,
  pno: number,
  goalPno: number,
  trends: Trend[],
  profile: WeekdayProfilePoint[],
  fmt: Formatters,
  t: TFn<keyof typeof T.cs>,
  locale: SupportedLocale
): Insight[] {
  const out: Insight[] = [];
  const paid = channels.filter((ch) => ch.cost > 0);

  // Sustained multi-week drifts first — agencies get fired over unnoticed slow
  // bleeds, not single flagged days, so a trend outranks every other line.
  for (const tr of trends) {
    const favourable = (tr.direction === "up") === (METRICS[tr.metric].goodDirection === "up");
    out.push({
      tone: favourable ? "good" : "warn",
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

  if (Number.isFinite(revenueDelta) && Math.abs(revenueDelta) > MIN_REVENUE_DELTA_TO_REPORT) {
    out.push({
      tone: revenueDelta > 0 ? "good" : "warn",
      text: (
        <>
          {revenueDelta > 0
            ? t("insightRevenueUp", { delta: fmt.fmtSignedPct(revenueDelta).replace("+", "") })
            : t("insightRevenueDown", { delta: fmt.fmtSignedPct(revenueDelta).replace("-", "") })}
        </>
      ),
    });
  }

  out.push({
    tone: pno <= goalPno ? "good" : "warn",
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
    out.push({
      tone: "good",
      text: (
        <>{t("insightBestRoas", { channel: bestRoas.channel, roas: fmt.fmtMultiple(bestRoas.roas) })}</>
      ),
    });
  }

  const worstPno = [...paid].sort((a, b) => b.pno - a.pno)[0];
  if (worstPno && worstPno.pno > goalPno * WORST_PNO_FLAG_MULTIPLE) {
    out.push({
      tone: "warn",
      text: <>{t("insightWorstPno", { channel: worstPno.channel, pno: fmt.fmtPct(worstPno.pno) })}</>,
    });
  }

  const bestDay = profile.find((p) => p.best);
  const worstDay = profile.find((p) => p.worst);
  if (bestDay && worstDay && bestDay.index - worstDay.index >= WEEKDAY_SPREAD_TO_REPORT) {
    out.push({
      tone: "info",
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

  return out.slice(0, 4);
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
}: {
  channels: ChannelRow[];
  revenueDelta: number;
  pno: number;
  goalPno: number;
  trends: Trend[];
  profile: WeekdayProfilePoint[];
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  const insights = buildInsights(channels, revenueDelta, pno, goalPno, trends, profile, fmt, t, locale);

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
    </div>
  );
}
