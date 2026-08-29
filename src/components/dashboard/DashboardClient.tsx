"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import GoalPacing from "@/components/dashboard/GoalPacing";
import WeekdayProfileCard from "@/components/dashboard/WeekdayProfileCard";
import PeriodHeader from "@/components/dashboard/vykon/PeriodHeader";
import KpiGrid from "@/components/dashboard/vykon/KpiGrid";
import TrendCard from "@/components/dashboard/vykon/TrendCard";
import ChannelsSection from "@/components/dashboard/vykon/ChannelsSection";
import PnoGauge from "@/components/dashboard/vykon/PnoGauge";
import AlertsPanel from "@/components/dashboard/vykon/AlertsPanel";
import InsightsPanel from "@/components/dashboard/vykon/InsightsPanel";
import {
  anomalyImpact,
  bucketize,
  channelRowsCompared,
  decomposeRevenueMove,
  detectAnomalies,
  detectTrends,
  evaluatePeriod,
  explainAnomalies,
  fitResponseCurve,
  monthlyAttainmentHistory,
  monthlyPacing,
  PERIODS,
  resolveChannelTime,
  seriesCoverage,
  TREND_METRICS,
  weekdayProfile,
  weekdayWeightsBundle,
  type Anomaly,
  type PeriodBaseline,
} from "@/lib/metrics";
import type { PerformanceData, MetricKey } from "@/lib/types";
import type { StoredDiagnosis } from "@/lib/diagnoses/types";

// Wave 1 — the ads-performance diagnosis. Lazy: it is a modal-weight AI panel that
// only a click uses, so its chunk streams in behind a height-reserving skeleton.
const AdsDiagnosisPanel = dynamic(() => import("@/components/dashboard/vykon/AdsDiagnosisPanel"), {
  loading: () => <SectionSkeleton height="h-56" lines={2} />,
});

/** What the server page resolved for the ads diagnosis: the project it runs for, the
 *  persisted latest + capped history, the CURRENT request digest (stale badge) and
 *  the CURRENT portfolio PNO (outcome chip). Absent → the panel is not mounted. */
export interface AdsDiagnosisMount {
  projectId: string;
  initial: StoredDiagnosis | null;
  history: StoredDiagnosis[];
  digest?: string;
  pno?: number;
}

/** The Výkon dashboard: period-scoped KPIs, a trend chart, a channel breakdown,
 *  and — moved from the old right rail into the main column — the anomaly alerts
 *  feed and the auto-generated insights. This component owns only the shared
 *  state (period, chart metric, alert→chart focus) and the derived views; every
 *  panel is a self-contained piece under ./vykon. */
export default function DashboardClient({
  data,
  reportHref = "/clanek/vykon",
  adsDiagnosis,
}: {
  data: PerformanceData;
  /** server-resolved inputs for the ads-performance diagnosis panel (omitted on the
   *  public article surface, which has no project) */
  adsDiagnosis?: AdsDiagnosisMount;
  /** Where the "Datový report" action goes — the live report→chat surface on
   *  each real surface; defaults to the public article. */
  reportHref?: string;
}) {
  const [periodKey, setPeriodKey] = useState("90d");
  // Which comparison window the KPIs/chart/insights measure against: the adjacent
  // previous window (default) or the same window a year ago. Client-side like
  // periodKey; the engine (evaluatePeriod) does the actual windowing.
  const [baselineKey, setBaselineKey] = useState<PeriodBaseline>("previous");
  const [trendMetric, setTrendMetric] = useState<MetricKey>("revenue");
  // "See this alert in context": clicking an alert switches the chart to the
  // event's metric and pins its point (seq bumps so a repeat click re-applies).
  const [chartFocus, setChartFocus] = useState<{ date: string; seq: number } | null>(null);
  // "See this channel in the table": clicking the mix-shift insight scrolls to the
  // channels section and flashes the moved channel's row (seq bumps to re-trigger).
  const [channelFocus, setChannelFocus] = useState<{ channel: string; seq: number } | null>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);

  // Pin the trend chart on a metric + date: switch the chart to that metric (when
  // the selector offers it) and open its tooltip on the date, then bring the chart
  // into view. Shared by the alerts feed and the metric-backed insights.
  const focusChart = (metric: MetricKey, date: string) => {
    if (TREND_METRICS.includes(metric)) setTrendMetric(metric);
    setChartFocus((f) => ({ date, seq: (f?.seq ?? 0) + 1 }));
    chartCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const focusAlert = (a: Anomaly) => {
    // goal-breach alerts describe PNO against the goal; other kinds carry their
    // own metric. Only switch to metrics the selector actually offers.
    focusChart(a.kind === "goal-breach" ? "pno" : a.metric, a.date);
  };

  // Mix-shift insight → scroll to the channel table and flash the moved channel.
  const focusChannel = (channel: string) => {
    setChannelFocus((f) => ({ channel, seq: (f?.seq ?? 0) + 1 }));
    channelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];
  const goalPno = data.goals.pno;

  // Current-month goal pacing + forecast (independent of the period selector).
  const pacing = monthlyPacing(
    data.daily,
    data.goals.monthlyRevenue,
    undefined,
    // The account's fitted diminishing-returns response curve, so the "extra daily
    // spend" prescription prices the NEXT koruna at its marginal return instead of the
    // trailing average ROAS. An unfitted curve leaves the previous formula in place.
    fitResponseCurve(data.daily.map((p) => ({ spend: p.cost, revenue: p.revenue })))
  );

  // Full-series detection: the chart maps flagged days to its visible buckets
  // itself, and both anomalies and trends need the whole history for their
  // trailing baselines. The day-of-week profile does too (trailing 12 weeks).
  // Compute the weekday-weights bundle ONCE and share it across all three passes,
  // which each used to re-derive it (numerically identical — see metrics-spine).
  const weekdayWeights = weekdayWeightsBundle(data.daily);
  const anomalies = detectAnomalies(data.daily, data.goals, { weights: weekdayWeights });
  const trends = detectTrends(data.daily, { weights: weekdayWeights });
  const profile = weekdayProfile(data.daily, "revenue", weekdayWeights.revenue);
  // How much history the detectors had — so the alerts/insights cards can note
  // honestly when a short series makes detection less sensitive (or impossible)
  // rather than letting an empty feed read as "all clear".
  const coverage = seriesCoverage(data.daily.length);

  // Can the series support a year-over-year comparison for THIS window? Probe the
  // engine: yoy is fully supported only when it neither falls back to "previous"
  // (no year-ago day fits) nor truncates (only part of the window has a twin). When
  // it can't, the toggle disables yoy with an honest note instead of silently
  // serving a shortened or adjacent comparison.
  const yoyProbe = evaluatePeriod(data.daily, period.days, "yoy");
  const yoySupported = yoyProbe.baseline === "yoy" && !yoyProbe.truncated;
  // The baseline actually used: honour a yoy request only while it's supported, so
  // switching to a window that can't support yoy cleanly falls back to previous
  // (and the segmented control reflects that).
  const baseline: PeriodBaseline = baselineKey === "yoy" && yoySupported ? "yoy" : "previous";

  // The analytics helpers are pure and React Compiler (Next 16) memoizes the
  // component automatically, so we compute the derived views directly.
  const result = evaluatePeriod(data.daily, period.days, baseline);

  // Scope the alerts feed + its Kč impact to the selected window, so the card
  // answers about the same period as the KPI cards, chart and channel table.
  const windowDates = new Set(result.points.map((p) => p.date));
  const periodAnomalies = anomalies.filter((a) => windowDates.has(a.date));
  const topAnomalies = [...periodAnomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 6);
  // Label each surfaced anomaly against the dataset's event calendar (authored
  // events + client annotations, unified upstream into data.events): a flagged day
  // inside a known event reads as "expected" rather than an alarm. Never suppresses
  // — impact below still counts every anomaly. Pure join; detection is unchanged.
  const explainedTop = explainAnomalies(topAnomalies, data.events);
  const impact = anomalyImpact(periodAnomalies);

  // WHY the revenue moved — split across traffic / conversion rate / AOV — but
  // only for a statistically strong move, so the insight never explains noise.
  const funnel =
    result.significance.revenue === "strong"
      ? decomposeRevenueMove(result.current, result.previous)
      : null;

  const buckets = bucketize(result.points, period.granularity);
  // Bucketize the comparison window too so the chart can overlay it (index-aligned).
  const compareBuckets = bucketize(result.comparePoints, period.granularity);
  const c = result.current;
  // Time-resolve the channel mix when the dataset carries a per-day breakdown, so
  // the channel table shows REAL per-channel deltas + a mix-shift insight; falls
  // back to the static projection otherwise (live/legacy datasets unchanged).
  const channelTime = resolveChannelTime(
    data.channels.length,
    data.channelDaily,
    result.points,
    result.comparePoints
  );
  const channels = channelRowsCompared(data.channels, result.current, result.previous, channelTime);
  const hasAlerts = topAnomalies.length > 0;

  return (
    <div className="stagger space-y-6">
      <PeriodHeader
        period={period}
        periodKey={periodKey}
        onPeriodChange={setPeriodKey}
        baseline={baseline}
        onBaselineChange={setBaselineKey}
        yoySupported={yoySupported}
        truncated={result.truncated}
        actualDays={result.actualDays}
        reportHref={reportHref}
      />

      <KpiGrid
        periodKey={periodKey}
        totals={c}
        result={result}
        buckets={buckets}
        goalPno={goalPno}
        baseline={baseline}
      />

      {pacing && (
        <GoalPacing
          pacing={pacing}
          history={monthlyAttainmentHistory(data.daily, data.goals.monthlyRevenue)}
        />
      )}

      <TrendCard
        ref={chartCardRef}
        buckets={buckets}
        compareBuckets={compareBuckets}
        baseline={result.baseline}
        trendMetric={trendMetric}
        onMetricChange={setTrendMetric}
        granularity={period.granularity}
        anomalies={anomalies}
        goalPno={goalPno}
        chartFocus={chartFocus}
        period={period}
      />

      {/* channels + alerts + insights in the main column; PNO gauge + weekday
          profile in the thin right rail */}
      <div key={`channels-${periodKey}`} className="grid animate-fade-in gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div ref={channelsRef} className="scroll-mt-6">
            <ChannelsSection
              channels={channels}
              totals={c}
              goalPno={goalPno}
              revenueDelta={result.delta.revenue}
              revenueSignificance={result.significance.revenue}
              period={period}
              timeResolved={!!channelTime}
              baseline={baseline}
              highlightChannel={channelFocus}
            />
          </div>
          <div className={`grid gap-6 ${hasAlerts ? "md:grid-cols-2" : ""}`}>
            {hasAlerts && (
              <AlertsPanel
                topAnomalies={explainedTop}
                count={periodAnomalies.length}
                impact={impact}
                period={period}
                onFocus={focusAlert}
                coverage={coverage}
              />
            )}
            <InsightsPanel
              channels={channels}
              revenueDelta={result.delta.revenue}
              pno={c.pno}
              goalPno={goalPno}
              trends={trends}
              profile={profile}
              significance={result.significance}
              coverage={coverage}
              funnel={funnel}
              baseline={baseline}
              windowEndDate={result.points[result.points.length - 1]?.date ?? ""}
              onFocusMetric={focusChart}
              onMixShift={focusChannel}
            />
          </div>
          {adsDiagnosis && (
            <AdsDiagnosisPanel
              projectId={adsDiagnosis.projectId}
              initialDiagnosis={adsDiagnosis.initial}
              history={adsDiagnosis.history}
              currentDigest={adsDiagnosis.digest}
              currentPno={adsDiagnosis.pno}
            />
          )}
        </div>

        <aside className="space-y-6">
          <PnoGauge pno={c.pno} goalPno={goalPno} />
          <WeekdayProfileCard profile={profile} />
        </aside>
      </div>
    </div>
  );
}
