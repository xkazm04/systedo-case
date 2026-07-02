"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import KpiCard from "@/components/dashboard/KpiCard";
import GoalPacing from "@/components/dashboard/GoalPacing";
import TrendChart from "@/components/dashboard/TrendChart";
import ChannelTable from "@/components/dashboard/ChannelTable";
import { Bolt, Bulb, Download, Target, TrendDown, TrendUp } from "@/components/icons";
import { downloadText, toCsv } from "@/lib/export";
import {
  anomalyImpact,
  bucketize,
  channelRowsCompared,
  detectAnomalies,
  detectTrends,
  evaluatePeriod,
  HEADLINE_METRICS,
  metricDescription,
  metricShort,
  METRICS,
  monthlyAttainmentHistory,
  monthlyPacing,
  PERIODS,
  TREND_METRICS,
  type Anomaly,
  type ChannelRow,
  type PeriodBaseline,
  type Trend,
} from "@/lib/metrics";
import type { PerformanceData, MetricKey } from "@/lib/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Formatters, SupportedLocale } from "@/lib/format";

const T = {
  cs: {
    periodLabel: "Období:",
    periodLast: "posledních {n}",
    periodCompare: "· srovnání s předchozím stejně dlouhým obdobím",
    periodCompareYoy: "· srovnání se stejným obdobím loni",
    baselineSelector: "Základna srovnání",
    baselinePrevious: "Předchozí období",
    baselineYoy: "Loni",
    periodTruncated: "zkráceno na {days}",
    truncatedTitle:
      "Datová řada je kratší než zvolené období — okno i srovnávací období se zkrátily na stejně dlouhý dostupný úsek.",
    dataReport: "Datový report",
    trendHeading: "Vývoj v čase",
    channelsHeading: "Výkon podle kanálů",
    downloadTitle: "Stáhnout rozpad podle kanálů jako CSV",
    periodSelector: "Výběr období",
    chartMetricSelector: "Metrika grafu",
    pnoVsGoal: "PNO vs. cíl",
    goalLabel: "Cíl {pct} (celý web)",
    overGoal: "o {delta} nad cílem",
    onGoal: "v cíli",
    goalMarker: "Cíl {pct}",
    goalMarkerNote: "Svislá značka = cílová hodnota PNO.",
    alerts: "Upozornění",
    alertsImpact: "Odhadovaný dopad těchto událostí:",
    alertsImpactTitle:
      "Součet odchylek od očekávání u obratu a nákladů ve dnech s upozorněním ve zvoleném období",
    alertsGained: "pozitivní odchylky",
    alertsGainedTitle:
      "Součet příznivých odchylek ve dnech s upozorněním — neočekávaný obrat navíc a ušetřené náklady. Vykazuje se zvlášť, aby nesnižoval hlavní číslo škody.",
    insights: "Co stojí za pozornost",
    csvChannel: "Kanál",
    csvCost: "Náklady (Kč)",
    csvConversions: "Konverze",
    csvRevenue: "Obrat (Kč)",
    csvPno: "PNO",
    csvRoas: "ROAS",
    csvRevenueDelta: "Změna obratu",
    csvTotal: "Celkem",
    footnoteConvRate: "Konv. poměr {pct}",
    footnoteAov: "AOV {val}",
    footnoteRoas: "ROAS {val}",
    pnoGoalMet: "splněn",
    pnoGoalExceeded: "překročen",
    pnoGoalFmt: "Cíl {pct} {status}",
    insightRevenueUp: "Obrat vzrostl o {delta} oproti předchozímu období.",
    insightRevenueDown: "Obrat klesl o {delta} oproti předchozímu období.",
    insightPnoBelow: "Celkové PNO {pno} je pod cílem {goal}.",
    insightPnoAbove: "Celkové PNO {pno} je nad cílem {goal}.",
    insightBestRoas: "Nejefektivnější kanál je {channel} s ROAS {roas}.",
    insightWorstPno: "{channel} má nejvyšší PNO {pno} — prostor pro optimalizaci nabídek.",
    insightTrendDown: "{metric} — pokles {weeks} v řadě ({pct} kumulativně).",
    insightTrendUp: "{metric} — růst {weeks} v řadě ({pct} kumulativně).",
    anomalySpike: "{metric} — nárůst {pct} nad očekávání",
    anomalyDrop: "{metric} — propad {pct} pod očekávání",
    anomalyOutage: "{metric} — výpadek (hodnota u nuly)",
    anomalyGoalBreach: "Překročení cílového PNO ({pno})",
  },
  en: {
    periodLabel: "Period:",
    periodLast: "last {n}",
    periodCompare: "· compared with the previous period of equal length",
    periodCompareYoy: "· compared with the same period last year",
    baselineSelector: "Comparison baseline",
    baselinePrevious: "Previous period",
    baselineYoy: "Last year",
    periodTruncated: "shortened to {days}",
    truncatedTitle:
      "The data series is shorter than the selected period — the window and its comparison were capped to the equal-length span available.",
    dataReport: "Data report",
    trendHeading: "Trend over time",
    channelsHeading: "Performance by channel",
    downloadTitle: "Download channel breakdown as CSV",
    periodSelector: "Period selector",
    chartMetricSelector: "Chart metric",
    pnoVsGoal: "Cost ratio vs. goal",
    goalLabel: "Target {pct} (entire site)",
    overGoal: "{delta} above target",
    onGoal: "on target",
    goalMarker: "Target {pct}",
    goalMarkerNote: "Vertical marker = PNO target.",
    alerts: "Alerts",
    alertsImpact: "Estimated impact of these events:",
    alertsImpactTitle:
      "Sum of revenue and cost deviations from expected on flagged days in the selected period",
    alertsGained: "positive deviations",
    alertsGainedTitle:
      "Sum of favourable deviations on flagged days — unexpected extra revenue and cost savings. Reported separately so it does not dilute the damage figure.",
    insights: "Worth noting",
    csvChannel: "Channel",
    csvCost: "Cost (CZK)",
    csvConversions: "Conversions",
    csvRevenue: "Revenue (CZK)",
    csvPno: "PNO",
    csvRoas: "ROAS",
    csvRevenueDelta: "Revenue change",
    csvTotal: "Total",
    footnoteConvRate: "Conv. rate {pct}",
    footnoteAov: "AOV {val}",
    footnoteRoas: "ROAS {val}",
    pnoGoalMet: "met",
    pnoGoalExceeded: "exceeded",
    pnoGoalFmt: "Target {pct} {status}",
    insightRevenueUp: "Revenue grew by {delta} vs the previous period.",
    insightRevenueDown: "Revenue fell by {delta} vs the previous period.",
    insightPnoBelow: "Overall PNO {pno} is below target {goal}.",
    insightPnoAbove: "Overall PNO {pno} is above target {goal}.",
    insightBestRoas: "Most efficient channel is {channel} with ROAS {roas}.",
    insightWorstPno: "{channel} has the highest PNO {pno} — room to optimise bids.",
    insightTrendDown: "{metric} — declining {weeks} in a row ({pct} cumulative).",
    insightTrendUp: "{metric} — rising {weeks} in a row ({pct} cumulative).",
    anomalySpike: "{metric} — spike {pct} above expected",
    anomalyDrop: "{metric} — drop {pct} below expected",
    anomalyOutage: "{metric} — outage (value near zero)",
    anomalyGoalBreach: "PNO target breached ({pno})",
  },
} as const;

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // Slide a single background pill to the active tab instead of snapping the
  // background between buttons. Re-measure on value change and on resize.
  useEffect(() => {
    const el = refs.current[value];
    if (!el) return;
    const measure = () => setPill({ left: el.offsetLeft, width: el.offsetWidth });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options]);

  return (
    // scrollable on narrow screens so the control never pushes the page wider
    <div className="max-w-full overflow-x-auto no-scrollbar">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="relative inline-flex w-max rounded-pill bg-navy-50 p-1"
      >
        {pill && (
          <span
            aria-hidden
            className="absolute bottom-1 top-1 rounded-pill bg-surface shadow-card transition-all duration-300 ease-out"
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[o.value] = el;
              }}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={`relative z-10 shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "text-navy-800" : "text-muted hover:text-navy-700"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardClient({ data }: { data: PerformanceData }) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  const [periodKey, setPeriodKey] = useState("90d");
  const [trendMetric, setTrendMetric] = useState<MetricKey>("revenue");
  const [baselineChoice, setBaselineChoice] = useState<PeriodBaseline>("previous");

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];
  // YoY is hidden for the 12-month view: its adjacent comparison window already
  // IS the whole previous year, so the two baselines would be identical.
  const yoyAvailable = period.key !== "12m";
  const baseline: PeriodBaseline = yoyAvailable ? baselineChoice : "previous";
  const goalPno = data.goals.pno;

  // Current-month goal pacing + forecast (independent of the period selector).
  const pacing = monthlyPacing(data.daily, data.goals.monthlyRevenue);

  // Flagged days across the whole series (the chart maps these to its visible
  // buckets itself; detection keeps the full history because its trailing
  // 28-day baseline needs it).
  const anomalies = detectAnomalies(data.daily, data.goals);

  // Sustained multi-week drifts ending "now" — the slow bleed the per-day
  // anomaly thresholds can't see. Full-series like the anomalies (its trailing
  // weekly buckets and noise floor need the history, not the selected window).
  const trends = detectTrends(data.daily);

  // The analytics helpers are pure and React Compiler (Next 16) memoizes the
  // component automatically, so we compute the derived views directly.
  const result = evaluatePeriod(data.daily, period.days, baseline);

  // Scope the alerts feed + its Kč impact to the selected window, so the card
  // answers about the same period as the KPI cards, chart and channel table —
  // not an all-time headline (a year-old spike on the 7d view) with no cue.
  const windowDates = new Set(result.points.map((p) => p.date));
  const periodAnomalies = anomalies.filter((a) => windowDates.has(a.date));
  const topAnomalies = [...periodAnomalies]
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 6);
  // Money effect of the flagged days, so "3 alerts" reads as "≈ −85 tis. Kč".
  const impact = anomalyImpact(periodAnomalies);
  const buckets = bucketize(result.points, period.granularity);
  // Bucketize the comparison window too so the chart can overlay it (index-aligned).
  const compareBuckets = bucketize(result.comparePoints, period.granularity);
  const c = result.current;
  const channels = channelRowsCompared(data.channels, result.current, result.previous);

  // contextual secondary stat under each KPI
  const footnotes: Record<MetricKey, React.ReactNode> = {
    visits: <>{t("footnoteConvRate", { pct: fmt.fmtPct(c.cr, 2) })}</>,
    cost: <>{t("footnoteRoas", { val: fmt.fmtMultiple(c.roas) })}</>,
    conversions: <>{t("footnoteAov", { val: fmt.fmtCZK(c.aov) })}</>,
    revenue: <>{t("footnoteAov", { val: fmt.fmtCZK(c.aov) })}</>,
    pno: (
      <span className={c.pno <= goalPno ? "text-positive" : "text-coral-600"}>
        {t("pnoGoalFmt", {
          pct: fmt.fmtPct(goalPno, 0),
          status: c.pno <= goalPno ? t("pnoGoalMet") : t("pnoGoalExceeded"),
        })}
      </span>
    ),
    aov: null,
    cr: null,
    roas: null,
  };

  // auto-generated insights (sustained trends first — highest-signal finding)
  const insights = buildInsights(channels, result.delta.revenue, c.pno, goalPno, trends, fmt, t, locale);

  const pnoOverGoal = c.pno > goalPno;
  // PNO gauge axis headroom — 60 % above the larger of actual/goal so the bar and
  // markers never sit at the very edge (matches the channel table's PNO alert band).
  const PNO_GAUGE_HEADROOM = 1.6;
  const gaugeMax = Math.max(c.pno, goalPno) * PNO_GAUGE_HEADROOM;

  // Export the channel breakdown for the selected period as a CSV deliverable —
  // money/counts as raw integers, ratios as decimals, the PoP move formatted.
  const exportChannelsCsv = () => {
    const headers = [
      t("csvChannel"),
      t("csvCost"),
      t("csvConversions"),
      t("csvRevenue"),
      t("csvPno"),
      t("csvRoas"),
      t("csvRevenueDelta"),
    ];
    const rows: (string | number)[][] = channels.map((r) => [
      r.channel,
      Math.round(r.cost),
      Math.round(r.conversions),
      Math.round(r.revenue),
      r.pno > 0 ? r.pno.toFixed(4) : "",
      r.roas > 0 ? r.roas.toFixed(2) : "",
      r.delta ? fmt.fmtSignedPct(r.delta.revenue) : "",
    ]);
    rows.push([
      t("csvTotal"),
      Math.round(c.cost),
      Math.round(c.conversions),
      Math.round(c.revenue),
      c.pno.toFixed(4),
      c.roas.toFixed(2),
      fmt.fmtSignedPct(result.delta.revenue),
    ]);
    downloadText(`systedo-kanaly-${period.key}.csv`, toCsv(headers, rows));
  };

  return (
    <div className="space-y-6">
      {/* period selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-muted">
            {t("periodLabel")}{" "}
            <span className="font-medium text-navy-700">{t("periodLast", { n: period.label })}</span>
            {/* name the baseline actually used — a YoY request the series can't
                satisfy falls back to previous-period, and the text follows */}
            <span className="text-muted">
              {" "}
              {result.baseline === "yoy" ? t("periodCompareYoy") : t("periodCompare")}
            </span>
            {/* the series was too short for the requested window — say so instead
                of letting „12 měsíců" silently mean a shorter span */}
            {result.truncated && (
              <span className="text-coral-600" title={t("truncatedTitle")}>
                {" "}
                ·{" "}
                {t("periodTruncated", {
                  days: `${fmt.fmtInt(result.actualDays)} ${dayWord(result.actualDays, locale)}`,
                })}
              </span>
            )}
          </p>
          <Link
            href="/clanek/vykon"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
          >
            {t("dataReport")} <ArrowRight width={14} height={14} />
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel={t("periodSelector")}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            value={periodKey}
            onChange={setPeriodKey}
          />
          {/* comparison-baseline toggle — hidden on 12m, where the adjacent
              window already equals the whole previous year */}
          {yoyAvailable && (
            <Segmented
              ariaLabel={t("baselineSelector")}
              options={[
                { value: "previous" as PeriodBaseline, label: t("baselinePrevious") },
                { value: "yoy" as PeriodBaseline, label: t("baselineYoy") },
              ]}
              value={baselineChoice}
              onChange={setBaselineChoice}
            />
          )}
        </div>
      </div>

      {/* KPI cards — 1 col on small phones, 2 on larger phones, 5 on desktop.
          Keyed by period so the values ease in (staggered) on each switch. */}
      <div
        key={`kpi-${periodKey}-${result.baseline}`}
        className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-5"
      >
        {HEADLINE_METRICS.map((m, i) => (
          <KpiCard
            key={m}
            meta={METRICS[m]}
            locale={locale}
            value={c[m]}
            delta={result.delta[m]}
            significance={result.significance[m]}
            spark={buckets.map((b) => b[m])}
            footnote={footnotes[m]}
            emphasised={m === "pno"}
            delayMs={i * 55}
          />
        ))}
      </div>

      {/* monthly revenue goal pacing + month-end forecast + attainment history */}
      {pacing && (
        <GoalPacing
          pacing={pacing}
          history={monthlyAttainmentHistory(data.daily, data.goals.monthlyRevenue)}
        />
      )}

      {/* trend chart */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-navy-800">{t("trendHeading")}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {metricDescription(METRICS[trendMetric], locale)}
            </p>
          </div>
          <Segmented
            ariaLabel={t("chartMetricSelector")}
            options={TREND_METRICS.map((m) => ({ value: m, label: metricShort(METRICS[m], locale) }))}
            value={trendMetric}
            onChange={setTrendMetric}
          />
        </div>
        <div className="mt-4">
          <TrendChart
            data={buckets}
            compare={compareBuckets}
            compareKind={result.baseline}
            metric={trendMetric}
            granularity={period.granularity}
            anomalies={anomalies}
            goalValue={trendMetric === "pno" ? goalPno : undefined}
          />
        </div>
      </div>

      {/* channels + side rail */}
      <div key={`channels-${periodKey}`} className="grid animate-fade-in gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-navy-800">{t("channelsHeading")}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">{period.label}</span>
              <button
                type="button"
                onClick={exportChannelsCsv}
                title={t("downloadTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                CSV
              </button>
            </div>
          </div>
          <ChannelTable
            rows={channels}
            totals={c}
            goalPno={goalPno}
            revenueDelta={result.delta.revenue}
            revenueSignificance={result.significance.revenue}
          />
        </div>

        <aside className="space-y-6">
          {/* PNO vs goal */}
          <div className="card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Target width={17} height={17} className="text-brand-600" />
              {t("pnoVsGoal")}
            </div>
            <p className="tnum mt-3 text-3xl font-semibold tracking-tight text-navy-800">
              {fmt.fmtPct(c.pno)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("goalLabel", { pct: fmt.fmtPct(goalPno, 0) })} ·{" "}
              <span className={pnoOverGoal ? "text-coral-600" : "text-positive"}>
                {pnoOverGoal
                  ? t("overGoal", { delta: fmt.fmtSignedPct(c.pno - goalPno, 1).replace("+", "") })
                  : t("onGoal")}
              </span>
            </p>
            <div className="relative mt-4 h-2.5 rounded-full bg-navy-50">
              <div
                className={`h-full rounded-full ${pnoOverGoal ? "bg-coral-500" : "bg-brand-500"}`}
                style={{ width: `${Math.min(100, (c.pno / gaugeMax) * 100)}%` }}
              />
              <div
                className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-navy-700"
                style={{ left: `${(goalPno / gaugeMax) * 100}%` }}
                title={t("goalMarker", { pct: fmt.fmtPct(goalPno, 0) })}
              />
            </div>
            <p className="mt-2 text-[13px] text-muted">{t("goalMarkerNote")}</p>
          </div>

          {/* anomaly alerts feed */}
          {topAnomalies.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                <Bolt width={17} height={17} className="text-coral-600" />
                {t("alerts")}
                {/* scope cue — the feed and the impact cover the selected period */}
                <span className="text-xs font-normal text-muted">· {period.label}</span>
                <span className="pill ml-auto bg-coral-soft text-coral-600 !px-2 !py-0.5 text-[13px]">
                  {periodAnomalies.length}
                </span>
              </div>
              {impact.count > 0 && Math.abs(impact.net) >= 1 && (
                <p className="mt-1.5 text-xs text-muted">
                  {t("alertsImpact")}{" "}
                  <span
                    className={`tnum font-semibold ${
                      impact.net < 0 ? "text-coral-600" : "text-positive"
                    }`}
                    title={t("alertsImpactTitle")}
                  >
                    {impact.net < 0 ? "−" : "+"}
                    {fmt.fmtCZKCompact(Math.abs(impact.net))}
                  </span>
                  {/* the upside the same anomalies carried (windfalls + savings) —
                      computed separately by anomalyImpact precisely so it can
                      inform without diluting the damage headline */}
                  {impact.gained >= 1 && (
                    <span className="text-muted" title={t("alertsGainedTitle")}>
                      {" "}
                      (<span className="tnum">+{fmt.fmtCZKCompact(impact.gained)}</span>{" "}
                      {t("alertsGained")})
                    </span>
                  )}
                </p>
              )}
              <ul className="mt-3 space-y-3">
                {topAnomalies.map((a, i) => {
                  const ins = anomalyLine(a, fmt, t, locale);
                  return (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                          ins.tone === "good"
                            ? "bg-positive-soft text-positive"
                            : "bg-coral-soft text-coral-600"
                        }`}
                      >
                        {ins.tone === "good" ? (
                          <TrendUp width={12} height={12} />
                        ) : (
                          <TrendDown width={12} height={12} />
                        )}
                      </span>
                      <span className="leading-snug text-navy-700">
                        <span className="tnum font-medium text-navy-800">{fmt.fmtDateShort(a.date)}</span>{" "}
                        — {ins.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* insights */}
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
                    {ins.tone === "warn" ? (
                      <TrendDown width={12} height={12} />
                    ) : (
                      <TrendUp width={12} height={12} />
                    )}
                  </span>
                  <span className="leading-snug text-navy-700">{ins.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Locale-correct "N days" unit for the truncation hint (Czech needs three
 *  plural forms: 1 den / 2–4 dny / 5+ dní). */
function dayWord(n: number, locale: SupportedLocale): string {
  if (locale === "en") return n === 1 ? "day" : "days";
  return n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní";
}

/** Locale-correct "N weeks" unit for the sustained-trend insight
 *  (1 týden / 2–4 týdny / 5+ týdnů). */
function weekWord(n: number, locale?: SupportedLocale): string {
  if (locale === "en") return n === 1 ? "week" : "weeks";
  return n === 1 ? "týden" : n >= 2 && n <= 4 ? "týdny" : "týdnů";
}

// --- insight generation -----------------------------------------------------

interface Insight {
  text: React.ReactNode;
  tone: "good" | "warn" | "info";
}

type TFn = (key: keyof typeof T.cs, vars?: Record<string, string | number>) => string;

function buildInsights(
  channels: ChannelRow[],
  revenueDelta: number,
  pno: number,
  goalPno: number,
  trends: Trend[],
  fmt: Formatters,
  t: TFn,
  locale?: SupportedLocale
): Insight[] {
  const out: Insight[] = [];
  const paid = channels.filter((ch) => ch.cost > 0);

  // Sustained multi-week drifts first — agencies get fired over unnoticed
  // slow bleeds, not single flagged days, so a trend outranks every other line.
  for (const tr of trends) {
    const favourable =
      (tr.direction === "up") === (METRICS[tr.metric].goodDirection === "up");
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

  // Below ±0.5 % a revenue move is noise, not a story worth surfacing as an insight.
  const MIN_REVENUE_DELTA_TO_REPORT = 0.005;
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
        <>
          {t("insightBestRoas", { channel: bestRoas.channel, roas: fmt.fmtMultiple(bestRoas.roas) })}
        </>
      ),
    });
  }

  // Flag "room to optimise bids" only when the worst channel's PNO is ≥30 % over goal.
  const WORST_PNO_FLAG_MULTIPLE = 1.3;
  const worstPno = [...paid].sort((a, b) => b.pno - a.pno)[0];
  if (worstPno && worstPno.pno > goalPno * WORST_PNO_FLAG_MULTIPLE) {
    out.push({
      tone: "warn",
      text: (
        <>
          {t("insightWorstPno", { channel: worstPno.channel, pno: fmt.fmtPct(worstPno.pno) })}
        </>
      ),
    });
  }

  return out.slice(0, 4);
}

// --- anomaly feed line ------------------------------------------------------

function anomalyLine(
  a: Anomaly,
  fmt: Formatters,
  t: TFn,
  locale?: SupportedLocale
): { tone: "good" | "warn"; text: string } {
  const m = metricShort(METRICS[a.metric], locale);
  const good = METRICS[a.metric].goodDirection;
  const devPct = a.expected > 0 ? (a.observed - a.expected) / a.expected : 0;
  const favourable =
    a.kind === "outage" || a.kind === "goal-breach"
      ? false
      : a.kind === "spike"
        ? good === "up"
        : good === "down";
  let text: string;
  switch (a.kind) {
    case "spike":
      text = t("anomalySpike", { metric: m, pct: fmt.fmtSignedPct(devPct) });
      break;
    case "drop":
      text = t("anomalyDrop", { metric: m, pct: fmt.fmtSignedPct(devPct) });
      break;
    case "outage":
      text = t("anomalyOutage", { metric: m });
      break;
    case "goal-breach":
      text = t("anomalyGoalBreach", { pno: fmt.fmtPct(a.observed) });
      break;
  }
  return { tone: favourable ? "good" : "warn", text };
}
