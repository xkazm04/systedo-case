"use client";

import { Bolt, TrendDown, TrendUp } from "@/components/icons";
import {
  metricShort,
  METRICS,
  periodLabel,
  type Anomaly,
  type AnomalyImpact,
  type PeriodDef,
} from "@/lib/metrics";
import type { Formatters, SupportedLocale } from "@/lib/format";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TFn } from "@/lib/i18n/interpolate";

const T = {
  cs: {
    alerts: "Upozornění",
    alertFocusTitle: "Zobrazit tuto událost v grafu",
    alertsImpact: "Odhadovaný dopad těchto událostí:",
    alertsImpactTitle:
      "Součet odchylek od očekávání u obratu a nákladů ve dnech s upozorněním ve zvoleném období",
    alertsGained: "pozitivní odchylky",
    alertsGainedTitle:
      "Součet příznivých odchylek ve dnech s upozorněním — neočekávaný obrat navíc a ušetřené náklady. Vykazuje se zvlášť, aby nesnižoval hlavní číslo škody.",
    anomalySpike: "{metric} — nárůst {pct} nad očekávání",
    anomalyDrop: "{metric} — propad {pct} pod očekávání",
    anomalyOutage: "{metric} — výpadek (hodnota u nuly)",
    anomalyGoalBreach: "Překročení cílového PNO ({pno})",
  },
  en: {
    alerts: "Alerts",
    alertFocusTitle: "Show this event on the chart",
    alertsImpact: "Estimated impact of these events:",
    alertsImpactTitle:
      "Sum of revenue and cost deviations from expected on flagged days in the selected period",
    alertsGained: "positive deviations",
    alertsGainedTitle:
      "Sum of favourable deviations on flagged days — unexpected extra revenue and cost savings. Reported separately so it does not dilute the damage figure.",
    anomalySpike: "{metric} — spike {pct} above expected",
    anomalyDrop: "{metric} — drop {pct} below expected",
    anomalyOutage: "{metric} — outage (value near zero)",
    anomalyGoalBreach: "PNO target breached ({pno})",
  },
} as const;

/** Human line + tone for one flagged day — favourable spikes/drops read green,
 *  outages and goal breaches always red. */
function anomalyLine(
  a: Anomaly,
  fmt: Formatters,
  t: TFn<keyof typeof T.cs>,
  locale: SupportedLocale
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

/** The anomaly alerts feed — flagged days for the selected window, their Kč
 *  impact, and a click that pins each event in the trend chart. */
export default function AlertsPanel({
  topAnomalies,
  count,
  impact,
  period,
  onFocus,
}: {
  topAnomalies: Anomaly[];
  count: number;
  impact: AnomalyImpact;
  period: PeriodDef;
  onFocus: (a: Anomaly) => void;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
        <Bolt width={17} height={17} className="text-coral-600" />
        {t("alerts")}
        {/* scope cue — the feed and the impact cover the selected period */}
        <span className="text-xs font-normal text-muted">· {periodLabel(period, locale)}</span>
        <span className="pill ml-auto bg-coral-soft text-coral-600 !px-2 !py-0.5 text-[13px]">{count}</span>
      </div>
      {impact.count > 0 && Math.abs(impact.net) >= 1 && (
        <p className="mt-1.5 text-xs text-muted">
          {t("alertsImpact")}{" "}
          <span
            className={`tnum font-semibold ${impact.net < 0 ? "text-coral-600" : "text-positive"}`}
            title={t("alertsImpactTitle")}
          >
            {fmt.fmtSignedCZKCompact(impact.net)}
          </span>
          {/* the upside the same anomalies carried (windfalls + savings) —
              computed separately by anomalyImpact precisely so it can inform
              without diluting the damage headline */}
          {impact.gained >= 1 && (
            <span className="text-muted" title={t("alertsGainedTitle")}>
              {" "}
              (<span className="tnum">{fmt.fmtSignedCZKCompact(impact.gained)}</span> {t("alertsGained")})
            </span>
          )}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {topAnomalies.map((a, i) => {
          const ins = anomalyLine(a, fmt, t, locale);
          return (
            <li key={i}>
              {/* the alert and the chart's anomaly diamond describe the same
                  event — clicking here switches the chart to the event's metric
                  and pins its point in context */}
              <button
                type="button"
                onClick={() => onFocus(a)}
                title={t("alertFocusTitle")}
                className="group -mx-1.5 flex w-[calc(100%+0.75rem)] gap-2.5 rounded-lg px-1.5 py-0.5 text-left text-sm transition-colors hover:bg-canvas/70"
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    ins.tone === "good" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-600"
                  }`}
                >
                  {ins.tone === "good" ? <TrendUp width={12} height={12} /> : <TrendDown width={12} height={12} />}
                </span>
                <span className="leading-snug text-navy-700 group-hover:text-navy-800">
                  <span className="tnum font-medium text-navy-800">{fmt.fmtDateShort(a.date)}</span> — {ins.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
