"use client";

import { forwardRef } from "react";
import TrendChart from "@/components/dashboard/TrendChart";
import Segmented from "./Segmented";
import { Download } from "@/components/icons";
import { csvNum, downloadText, toCsv } from "@/lib/export";
import {
  metricDescription,
  metricShort,
  METRICS,
  TREND_METRICS,
  type Anomaly,
  type Bucket,
  type PeriodBaseline,
  type PeriodDef,
} from "@/lib/metrics";
import type { MetricKey } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    trendHeading: "Vývoj v čase",
    chartMetricSelector: "Metrika grafu",
    downloadTrendTitle: "Stáhnout časovou řadu grafu jako CSV",
    csvDate: "Datum",
    baselinePrevious: "Předchozí období",
    baselineYoy: "Loni",
  },
  en: {
    trendHeading: "Trend over time",
    chartMetricSelector: "Chart metric",
    downloadTrendTitle: "Download the chart's time series as CSV",
    csvDate: "Date",
    baselinePrevious: "Previous period",
    baselineYoy: "Last year",
  },
} as const;

/** Column order of the trend-series CSV — the full metric set, dates first. */
const TREND_CSV_METRICS: MetricKey[] = [
  "revenue",
  "cost",
  "profit",
  "visits",
  "conversions",
  "pno",
  "roas",
  "aov",
  "cr",
  "ctr",
  "cpc",
];

/** The trend-over-time chart card: a metric Segmented, the CSV export of the
 *  chart's underlying series (with the index-aligned comparison window), and the
 *  chart itself. `ref` is the scroll target the alerts feed pins to. */
const TrendCard = forwardRef<
  HTMLDivElement,
  {
    buckets: Bucket[];
    compareBuckets: Bucket[];
    baseline: PeriodBaseline;
    trendMetric: MetricKey;
    onMetricChange: (m: MetricKey) => void;
    granularity: "day" | "month";
    anomalies: Anomaly[];
    goalPno: number;
    chartFocus: { date: string; seq: number } | null;
    period: PeriodDef;
  }
>(function TrendCard(
  {
    buckets,
    compareBuckets,
    baseline,
    trendMetric,
    onMetricChange,
    granularity,
    anomalies,
    goalPno,
    chartFocus,
    period,
  },
  ref
) {
  const t = useT(T);
  const { locale } = useLocale();

  // Export the chart's underlying time series — the dataset an analyst re-plots
  // in a client deck. One row per visible bucket with all metrics, plus the
  // index-aligned comparison window as prefixed columns. Raw integers for
  // money/counts, locale-decimal ratios (csvNum) so Czech Excel parses them.
  const exportTrendCsv = () => {
    const cell = (b: Bucket, m: MetricKey): string | number => {
      if (m === "pno" || m === "cr" || m === "ctr") return b[m] > 0 ? csvNum(b[m], 4, locale) : "";
      if (m === "roas" || m === "cpc") return b[m] > 0 ? csvNum(b[m], 2, locale) : "";
      return Math.round(b[m]);
    };
    const label = (m: MetricKey) => metricShort(METRICS[m], locale);
    const hasCompare = compareBuckets.length > 0;
    const prevWord = baseline === "yoy" ? t("baselineYoy") : t("baselinePrevious");
    const headers = [
      t("csvDate"),
      ...TREND_CSV_METRICS.map(label),
      ...(hasCompare ? TREND_CSV_METRICS.map((m) => `${prevWord} — ${label(m)}`) : []),
    ];
    const rows: (string | number)[][] = buckets.map((b, i) => {
      const prev = compareBuckets[i];
      return [
        b.date,
        ...TREND_CSV_METRICS.map((m) => cell(b, m)),
        ...(hasCompare ? TREND_CSV_METRICS.map((m) => (prev ? cell(prev, m) : "")) : []),
      ];
    });
    downloadText(`adamant-vyvoj-${period.key}.csv`, toCsv(headers, rows));
  };

  return (
    <div ref={ref} className="card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-navy-800">{t("trendHeading")}</h2>
          <p className="mt-0.5 text-sm text-muted">{metricDescription(METRICS[trendMetric], locale)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel={t("chartMetricSelector")}
            options={TREND_METRICS.map((m) => ({ value: m, label: metricShort(METRICS[m], locale) }))}
            value={trendMetric}
            onChange={onMetricChange}
          />
          <button
            type="button"
            onClick={exportTrendCsv}
            title={t("downloadTrendTitle")}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            <Download width={14} height={14} />
            CSV
          </button>
        </div>
      </div>
      <div className="mt-4">
        <TrendChart
          data={buckets}
          compare={compareBuckets}
          compareKind={baseline}
          metric={trendMetric}
          granularity={granularity}
          anomalies={anomalies}
          goalValue={trendMetric === "pno" ? goalPno : undefined}
          focus={chartFocus}
        />
      </div>
    </div>
  );
});

export default TrendCard;
