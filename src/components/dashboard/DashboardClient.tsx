"use client";

import { useEffect, useRef, useState } from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import GoalPacing from "@/components/dashboard/GoalPacing";
import TrendChart from "@/components/dashboard/TrendChart";
import ChannelTable from "@/components/dashboard/ChannelTable";
import { Bolt, Bulb, Target, TrendDown, TrendUp } from "@/components/icons";
import {
  bucketize,
  channelRowsCompared,
  detectAnomalies,
  evaluatePeriod,
  HEADLINE_METRICS,
  METRICS,
  monthlyPacing,
  PERIODS,
  TREND_METRICS,
  type Anomaly,
  type ChannelRow,
} from "@/lib/metrics";
import type { PerformanceData, MetricKey } from "@/lib/types";
import { fmtCZK, fmtDateShort, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";

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
  const [periodKey, setPeriodKey] = useState("90d");
  const [trendMetric, setTrendMetric] = useState<MetricKey>("revenue");

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[1];
  const goalPno = data.goals.pno;

  // Current-month goal pacing + forecast (independent of the period selector).
  const pacing = monthlyPacing(data.daily, data.goals.monthlyRevenue);

  // Flagged days across the whole series (chart markers + the alerts feed).
  const anomalies = detectAnomalies(data.daily, data.goals);
  const topAnomalies = [...anomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 6);

  // The analytics helpers are pure and React Compiler (Next 16) memoizes the
  // component automatically, so we compute the derived views directly.
  const result = evaluatePeriod(data.daily, period.days);
  const buckets = bucketize(result.points, period.granularity);
  // Bucketize the comparison window too so the chart can overlay it (index-aligned).
  const compareBuckets = bucketize(result.comparePoints, period.granularity);
  const c = result.current;
  const channels = channelRowsCompared(data.channels, result.current, result.previous);

  // contextual secondary stat under each KPI
  const footnotes: Record<MetricKey, React.ReactNode> = {
    visits: <>Konv. poměr {fmtPct(c.cr, 2)}</>,
    cost: <>ROAS {fmtMultiple(c.roas)}</>,
    conversions: <>AOV {fmtCZK(c.aov)}</>,
    revenue: <>AOV {fmtCZK(c.aov)}</>,
    pno: (
      <span className={c.pno <= goalPno ? "text-positive" : "text-coral-600"}>
        Cíl {fmtPct(goalPno, 0)} {c.pno <= goalPno ? "splněn" : "překročen"}
      </span>
    ),
    aov: null,
    cr: null,
    roas: null,
  };

  // auto-generated insights
  const insights = buildInsights(channels, result.delta.revenue, c.pno, goalPno);

  const pnoOverGoal = c.pno > goalPno;
  const gaugeMax = Math.max(c.pno, goalPno) * 1.6;

  return (
    <div className="space-y-6">
      {/* period selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Období: <span className="font-medium text-navy-700">posledních {period.label}</span>
          <span className="text-muted"> · srovnání s předchozím stejně dlouhým obdobím</span>
        </p>
        <Segmented
          ariaLabel="Výběr období"
          options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
          value={periodKey}
          onChange={setPeriodKey}
        />
      </div>

      {/* KPI cards — 1 col on small phones, 2 on larger phones, 5 on desktop.
          Keyed by period so the values ease in (staggered) on each switch. */}
      <div
        key={`kpi-${periodKey}`}
        className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-5"
      >
        {HEADLINE_METRICS.map((m, i) => (
          <KpiCard
            key={m}
            meta={METRICS[m]}
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

      {/* monthly revenue goal pacing + month-end forecast */}
      {pacing && <GoalPacing pacing={pacing} />}

      {/* trend chart */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-navy-800">Vývoj v čase</h2>
            <p className="mt-0.5 text-sm text-muted">
              {METRICS[trendMetric].description}
            </p>
          </div>
          <Segmented
            ariaLabel="Metrika grafu"
            options={TREND_METRICS.map((m) => ({ value: m, label: METRICS[m].short }))}
            value={trendMetric}
            onChange={setTrendMetric}
          />
        </div>
        <div className="mt-4">
          <TrendChart
            data={buckets}
            compare={compareBuckets}
            metric={trendMetric}
            granularity={period.granularity}
            anomalies={anomalies}
          />
        </div>
      </div>

      {/* channels + side rail */}
      <div key={`channels-${periodKey}`} className="grid animate-fade-in gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy-800">Výkon podle kanálů</h2>
            <span className="text-xs text-muted">{period.label}</span>
          </div>
          <ChannelTable
            rows={channels}
            totals={c}
            goalPno={goalPno}
            revenueDelta={result.delta.revenue}
          />
        </div>

        <aside className="space-y-6">
          {/* PNO vs goal */}
          <div className="card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Target width={17} height={17} className="text-brand-600" />
              PNO vs. cíl
            </div>
            <p className="tnum mt-3 text-3xl font-semibold tracking-tight text-navy-800">
              {fmtPct(c.pno)}
            </p>
            <p className="mt-1 text-sm text-muted">
              Cíl {fmtPct(goalPno, 0)} ·{" "}
              <span className={pnoOverGoal ? "text-coral-600" : "text-positive"}>
                {pnoOverGoal
                  ? `o ${fmtSignedPct(c.pno - goalPno, 1).replace("+", "")} nad cílem`
                  : "v cíli"}
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
                title={`Cíl ${fmtPct(goalPno, 0)}`}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted">Svislá značka = cílová hodnota PNO.</p>
          </div>

          {/* anomaly alerts feed */}
          {topAnomalies.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                <Bolt width={17} height={17} className="text-coral-600" />
                Upozornění
                <span className="pill ml-auto bg-coral-soft text-coral-600 !px-2 !py-0.5 text-[11px]">
                  {anomalies.length}
                </span>
              </div>
              <ul className="mt-3 space-y-3">
                {topAnomalies.map((a, i) => {
                  const ins = anomalyLine(a);
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
                        <span className="tnum font-medium text-navy-800">{fmtDateShort(a.date)}</span>{" "}
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
              Co stojí za pozornost
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

// --- insight generation -----------------------------------------------------

interface Insight {
  text: React.ReactNode;
  tone: "good" | "warn" | "info";
}

function buildInsights(
  channels: ChannelRow[],
  revenueDelta: number,
  pno: number,
  goalPno: number
): Insight[] {
  const out: Insight[] = [];
  const paid = channels.filter((ch) => ch.cost > 0);

  if (Number.isFinite(revenueDelta) && Math.abs(revenueDelta) > 0.005) {
    out.push({
      tone: revenueDelta > 0 ? "good" : "warn",
      text: (
        <>
          Obrat {revenueDelta > 0 ? "vzrostl" : "klesl"} o{" "}
          <strong>{fmtSignedPct(revenueDelta).replace("+", "")}</strong> oproti předchozímu období.
        </>
      ),
    });
  }

  out.push({
    tone: pno <= goalPno ? "good" : "warn",
    text: (
      <>
        Celkové PNO <strong>{fmtPct(pno)}</strong> je{" "}
        {pno <= goalPno ? "pod cílem" : "nad cílem"} {fmtPct(goalPno, 0)}.
      </>
    ),
  });

  const bestRoas = [...paid].sort((a, b) => b.roas - a.roas)[0];
  if (bestRoas) {
    out.push({
      tone: "good",
      text: (
        <>
          Nejefektivnější kanál je <strong>{bestRoas.channel}</strong> s ROAS{" "}
          {fmtMultiple(bestRoas.roas)}.
        </>
      ),
    });
  }

  const worstPno = [...paid].sort((a, b) => b.pno - a.pno)[0];
  if (worstPno && worstPno.pno > goalPno * 1.3) {
    out.push({
      tone: "warn",
      text: (
        <>
          <strong>{worstPno.channel}</strong> má nejvyšší PNO {fmtPct(worstPno.pno)} — prostor pro
          optimalizaci nabídek.
        </>
      ),
    });
  }

  return out.slice(0, 4);
}

// --- anomaly feed line ------------------------------------------------------

function anomalyLine(a: Anomaly): { tone: "good" | "warn"; text: string } {
  const m = METRICS[a.metric].short;
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
      text = `${m} — nárůst ${fmtSignedPct(devPct)} nad očekávání`;
      break;
    case "drop":
      text = `${m} — propad ${fmtSignedPct(devPct)} pod očekávání`;
      break;
    case "outage":
      text = `${m} — výpadek (hodnota u nuly)`;
      break;
    case "goal-breach":
      text = `Překročení cílového PNO (${fmtPct(a.observed)})`;
      break;
  }
  return { tone: favourable ? "good" : "warn", text };
}
