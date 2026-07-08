"use client";

import { useRef, useState } from "react";
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
  detectAnomalies,
  detectTrends,
  evaluatePeriod,
  monthlyAttainmentHistory,
  monthlyPacing,
  PERIODS,
  TREND_METRICS,
  weekdayProfile,
  type Anomaly,
} from "@/lib/metrics";
import type { PerformanceData, MetricKey } from "@/lib/types";

/** The Výkon dashboard: period-scoped KPIs, a trend chart, a channel breakdown,
 *  and — moved from the old right rail into the main column — the anomaly alerts
 *  feed and the auto-generated insights. This component owns only the shared
 *  state (period, chart metric, alert→chart focus) and the derived views; every
 *  panel is a self-contained piece under ./vykon. */
export default function DashboardClient({
  data,
  reportHref = "/clanek/vykon",
}: {
  data: PerformanceData;
  /** Where the "Datový report" action goes — the live report→chat surface on
   *  each real surface; defaults to the public article. */
  reportHref?: string;
}) {
  const [periodKey, setPeriodKey] = useState("90d");
  const [trendMetric, setTrendMetric] = useState<MetricKey>("revenue");
  // "See this alert in context": clicking an alert switches the chart to the
  // event's metric and pins its point (seq bumps so a repeat click re-applies).
  const [chartFocus, setChartFocus] = useState<{ date: string; seq: number } | null>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);

  const focusAlert = (a: Anomaly) => {
    // goal-breach alerts describe PNO against the goal; other kinds carry their
    // own metric. Only switch to metrics the selector actually offers.
    const metric: MetricKey = a.kind === "goal-breach" ? "pno" : a.metric;
    if (TREND_METRICS.includes(metric)) setTrendMetric(metric);
    setChartFocus((f) => ({ date: a.date, seq: (f?.seq ?? 0) + 1 }));
    chartCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];
  const goalPno = data.goals.pno;

  // Current-month goal pacing + forecast (independent of the period selector).
  const pacing = monthlyPacing(data.daily, data.goals.monthlyRevenue);

  // Full-series detection: the chart maps flagged days to its visible buckets
  // itself, and both anomalies and trends need the whole history for their
  // trailing baselines. The day-of-week profile does too (trailing 12 weeks).
  const anomalies = detectAnomalies(data.daily, data.goals);
  const trends = detectTrends(data.daily);
  const profile = weekdayProfile(data.daily);

  // The analytics helpers are pure and React Compiler (Next 16) memoizes the
  // component automatically, so we compute the derived views directly.
  const result = evaluatePeriod(data.daily, period.days, "previous");

  // Scope the alerts feed + its Kč impact to the selected window, so the card
  // answers about the same period as the KPI cards, chart and channel table.
  const windowDates = new Set(result.points.map((p) => p.date));
  const periodAnomalies = anomalies.filter((a) => windowDates.has(a.date));
  const topAnomalies = [...periodAnomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 6);
  const impact = anomalyImpact(periodAnomalies);

  const buckets = bucketize(result.points, period.granularity);
  // Bucketize the comparison window too so the chart can overlay it (index-aligned).
  const compareBuckets = bucketize(result.comparePoints, period.granularity);
  const c = result.current;
  const channels = channelRowsCompared(data.channels, result.current, result.previous);
  const hasAlerts = topAnomalies.length > 0;

  return (
    <div className="stagger space-y-6">
      <PeriodHeader
        period={period}
        periodKey={periodKey}
        onPeriodChange={setPeriodKey}
        truncated={result.truncated}
        actualDays={result.actualDays}
        reportHref={reportHref}
      />

      <KpiGrid periodKey={periodKey} totals={c} result={result} buckets={buckets} goalPno={goalPno} />

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
          <ChannelsSection
            channels={channels}
            totals={c}
            goalPno={goalPno}
            revenueDelta={result.delta.revenue}
            revenueSignificance={result.significance.revenue}
            period={period}
          />
          <div className={`grid gap-6 ${hasAlerts ? "md:grid-cols-2" : ""}`}>
            {hasAlerts && (
              <AlertsPanel
                topAnomalies={topAnomalies}
                count={periodAnomalies.length}
                impact={impact}
                period={period}
                onFocus={focusAlert}
              />
            )}
            <InsightsPanel
              channels={channels}
              revenueDelta={result.delta.revenue}
              pno={c.pno}
              goalPno={goalPno}
              trends={trends}
              profile={profile}
            />
          </div>
        </div>

        <aside className="space-y-6">
          <PnoGauge pno={c.pno} goalPno={goalPno} />
          <WeekdayProfileCard profile={profile} />
        </aside>
      </div>
    </div>
  );
}
