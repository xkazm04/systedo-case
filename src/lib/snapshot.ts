/** Builds a performance snapshot from the dashboard dataset for the analysis
 *  tool. The same numbers the dashboard renders are turned into a compact,
 *  human-readable block that grounds the model — so the analysis interprets real
 *  data instead of inventing it. Server-only (pulls in the dataset).
 *
 *  Sourced from the canonical `buildMetricsSnapshot` contract, so the AI sees the
 *  exact totals/deltas/channels the dashboard does, plus significance, dated
 *  anomalies and the pacing forecast band. */

import { performance } from "./data";
import type { PerformanceData } from "./types";
import {
  buildMetricsSnapshot,
  type Anomaly,
  type AnomalyKind,
  type ChannelRow,
  type MonthlyPacing,
  type PeriodBaseline,
  type Significance,
  type Totals,
  type Trend,
} from "./metrics";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "./format";
import { ANALYSIS_PERIOD_LABELS, type AnalysisPeriod } from "./ai-types";
import type { MetricKey } from "./types";
import type { ProjectType } from "./projects/types";

/** Per-type vocabulary for the recap DATA block. E-shops read revenue/ROAS/PNO;
 *  a leadgen or local client's conversions ARE leads/enquiries, and revenue/ROAS
 *  are e-shop concepts that don't apply — feeding them Obrat/ROAS makes the recap
 *  speak the wrong business (UAT-L1-07 / R01). Conversion-shaped types get a
 *  leads + cost-per-lead block instead; the deeper lead-quality detail arrives
 *  separately via the grounding context (leadSignalsPromptText). */
const CONVERSION_LABEL: Record<ProjectType, string> = {
  eshop: "Konverze",
  leadgen: "Leady",
  local: "Poptávky & hovory",
  content: "Konverzní cíle",
  app: "Registrace",
};
const COST_PER_CONVERSION_LABEL: Record<ProjectType, string> = {
  eshop: "Cena za konverzi",
  leadgen: "Cena za lead (CPL)",
  local: "Cena za poptávku",
  content: "Cena za konverzi",
  app: "Cena za registraci",
};

const PERIOD_DAYS: Record<AnalysisPeriod, number> = { "30d": 30, "90d": 90, "12m": 365 };

export interface Snapshot {
  period: AnalysisPeriod;
  periodLabel: string;
  /** the comparison baseline the deltas were computed against */
  baseline: PeriodBaseline;
  /** true when the series couldn't fill the requested window (span < period days)
   *  — current totals cover fewer days than the label and the delta isn't a true
   *  full-period comparison. See MetricsSnapshot.truncated. */
  truncated: boolean;
  current: Totals;
  delta: Record<MetricKey, number>;
  significance: Record<MetricKey, Significance>;
  channels: ChannelRow[];
  anomalies: Anomaly[];
  /** sustained multi-week drifts ending at the latest data ("slow bleed") */
  trends: Trend[];
  pacing: MonthlyPacing | null;
  goalPno: number;
  client: { name: string; domain: string; segment: string };
}

export function buildSnapshot(
  period: AnalysisPeriod,
  baseline: PeriodBaseline = "previous",
  // Phase-D data seam: ground on a specific project's dataset (getProjectDataset)
  // or, later, its synced live data — defaults to the base case-study dataset so
  // every existing caller is unchanged.
  data: PerformanceData = performance
): Snapshot {
  const snap = buildMetricsSnapshot(data, {
    key: period,
    label: ANALYSIS_PERIOD_LABELS[period],
    days: PERIOD_DAYS[period],
    baseline,
  });
  return {
    period,
    periodLabel: ANALYSIS_PERIOD_LABELS[period],
    baseline: snap.baseline,
    truncated: snap.truncated,
    current: snap.current,
    delta: snap.delta,
    significance: snap.significance,
    channels: snap.channels,
    anomalies: snap.anomalies,
    trends: snap.trends,
    pacing: snap.pacing,
    goalPno: snap.goals.pno,
    client: {
      name: data.client.name,
      domain: data.client.domain,
      segment: data.client.segment,
    },
  };
}

const SIG_NOTE: Record<Significance, string> = {
  strong: " · statisticky významné",
  weak: " · slabý signál",
  noise: " · v rámci běžného kolísání",
};

const KIND_LABEL: Record<AnomalyKind, string> = {
  spike: "prudký nárůst",
  drop: "propad",
  outage: "výpadek (nula)",
  "goal-breach": "překročení cílového PNO",
};

/** ISO "2026-05-14" → "14.5." */
const ddmm = (iso: string): string => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
};

export function snapshotToPromptText(s: Snapshot, projectType?: ProjectType): string {
  const c = s.current;
  const sig = (k: MetricKey) => SIG_NOTE[s.significance[k]];
  // E-shop (or unknown) reads revenue/ROAS/PNO/AOV; conversion-first businesses
  // (leadgen/local/…) get a leads + cost-per-lead block so the recap never quotes
  // fabricated Obrat/ROAS for them (R01).
  const isEshop = !projectType || projectType === "eshop";

  const lines: string[] = [
    `Klient: ${s.client.name} (${s.client.domain}) — ${s.client.segment}`,
    // Name the baseline the deltas were actually computed against, so the model
    // never interprets a year-over-year move as a period-over-period one.
    `Období: posledních ${s.periodLabel} (srovnání ${
      s.baseline === "yoy"
        ? "se stejným obdobím loni"
        : "s předchozím stejně dlouhým obdobím"
    })`,
    "",
    "Souhrn metrik (hodnota | meziobdobní změna | spolehlivost změny):",
    `- Návštěvy: ${fmtInt(c.visits)} | ${fmtSignedPct(s.delta.visits)}${sig("visits")}`,
    `- Náklady: ${fmtCZK(c.cost)} | ${fmtSignedPct(s.delta.cost)}${sig("cost")}`,
  ];

  if (isEshop) {
    lines.push(
      `- Konverze: ${fmtInt(c.conversions)} | ${fmtSignedPct(s.delta.conversions)}${sig("conversions")}`,
      `- Obrat (hodnota konverzí): ${fmtCZK(c.revenue)} | ${fmtSignedPct(s.delta.revenue)}${sig("revenue")}`,
      `- PNO: ${fmtPct(c.pno)} (cíl ${fmtPct(s.goalPno, 0)}) | ${fmtSignedPct(s.delta.pno)}${sig("pno")}`,
      `- ROAS: ${fmtMultiple(c.roas)}`,
      `- Konverzní poměr: ${fmtPct(c.cr, 2)}`,
      `- Průměrná hodnota objednávky: ${fmtCZK(c.aov)}`,
      // The channel block is omitted when there is no channel mix (e.g. a live
      // account-level Ads sync, which has no per-channel data) so the recap never
      // fabricates a per-channel breakdown from a sample mix.
      ...(s.channels.length
        ? [
            "",
            "Výkon podle kanálů (obrat | podíl | PNO | ROAS | změna obratu):",
            ...s.channels.map(
              (ch) =>
                `- ${ch.channel}: ${fmtCZK(ch.revenue)} | ${fmtPct(ch.revenueShare, 0)} | ` +
                `${ch.pno > 0 ? fmtPct(ch.pno) : "—"} | ${ch.roas > 0 ? fmtMultiple(ch.roas) : "—"} | ` +
                `${ch.delta ? fmtSignedPct(ch.delta.revenue) : "—"}`
            ),
          ]
        : [])
    );
  } else {
    const t = projectType;
    const convLabel = CONVERSION_LABEL[t];
    const cpcLabel = COST_PER_CONVERSION_LABEL[t];
    const cpc = c.conversions > 0 ? c.cost / c.conversions : 0;
    const totalConv = s.channels.reduce((sum, ch) => sum + ch.conversions, 0);
    lines.push(
      `- ${convLabel}: ${fmtInt(c.conversions)} | ${fmtSignedPct(s.delta.conversions)}${sig("conversions")}`,
      `- ${cpcLabel}: ${fmtCZK(cpc)}`,
      `- Konverzní poměr: ${fmtPct(c.cr, 2)}`,
      // Revenue/ROAS/PNO/AOV are e-shop concepts — omitted so the recap doesn't
      // present them as this client's reality.
      // Channel block omitted when there is no channel mix (see e-shop branch).
      ...(s.channels.length
        ? [
            "",
            `Výkon podle kanálů (${convLabel.toLowerCase()} | podíl | ${cpcLabel.toLowerCase()} | změna):`,
            ...s.channels.map((ch) => {
              const share = totalConv > 0 ? ch.conversions / totalConv : 0;
              const chCpc = ch.conversions > 0 ? ch.cost / ch.conversions : 0;
              return (
                `- ${ch.channel}: ${fmtInt(ch.conversions)} | ${fmtPct(share, 0)} | ` +
                `${ch.conversions > 0 ? fmtCZK(chCpc) : "—"} | ` +
                `${ch.delta ? fmtSignedPct(ch.delta.conversions) : "—"}`
              );
            }),
          ]
        : [])
    );
  }

  if (s.pacing && !s.pacing.complete) {
    const p = s.pacing;
    lines.push(
      "",
      "Plnění měsíčního cíle (projekce do konce měsíce):",
      `- Zatím tento měsíc: ${fmtCZK(p.mtd)} z cíle ${fmtCZK(p.goal)} (${p.onPace ? "na plánu" : "pod plánem"})`,
      `- Projekce konce měsíce: ${fmtCZK(p.projection)} (rozpětí ${fmtCZK(p.projectionLow)}–${fmtCZK(p.projectionHigh)})`,
      `- Pravděpodobnost splnění cíle: ${fmtPct(p.goalProbability, 0)}`
    );
  }

  if (s.anomalies.length > 0) {
    const top = [...s.anomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5);
    lines.push(
      "",
      "Významné události v období (anomálie vs. očekávání):",
      ...top.map((a) => {
        const devPct = a.expected > 0 ? (a.observed - a.expected) / a.expected : 0;
        const what = METRIC_LABEL[a.metric] ?? a.metric;
        return a.kind === "goal-breach"
          ? `- ${ddmm(a.date)}: ${KIND_LABEL[a.kind]} (PNO ${fmtPct(a.observed)} vs. cíl ${fmtPct(a.expected, 0)})`
          : `- ${ddmm(a.date)}: ${what} — ${KIND_LABEL[a.kind]} ${fmtSignedPct(devPct)} vs. očekávání`;
      })
    );
  }

  // Sustained multi-week drifts — the "slow bleed" the per-day anomalies miss.
  if (s.trends.length > 0) {
    lines.push(
      "",
      "Setrvalé trendy (klouzavé týdenní průměry, očištěné o den v týdnu):",
      ...s.trends.map((tr) => {
        const what = METRIC_LABEL[tr.metric] ?? tr.metric;
        const dir = tr.direction === "down" ? "pokles" : "růst";
        return `- ${what}: ${dir} ${tr.weeks} ${weekWord(tr.weeks)} v řadě, kumulativně ${fmtSignedPct(tr.cumulativeChange)}`;
      })
    );
  }

  return lines.join("\n");
}

/** Czech plural for "N weeks" (1 týden / 2–4 týdny / 5+ týdnů). */
const weekWord = (n: number): string => (n === 1 ? "týden" : n >= 2 && n <= 4 ? "týdny" : "týdnů");

const METRIC_LABEL: Partial<Record<MetricKey, string>> = {
  visits: "návštěvy",
  cost: "náklady",
  conversions: "konverze",
  revenue: "obrat",
  pno: "PNO",
};
