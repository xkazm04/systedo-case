/** Builds a performance snapshot from the dashboard dataset for the analysis
 *  tool. The same numbers the dashboard renders are turned into a compact,
 *  human-readable block that grounds the model — so the analysis interprets real
 *  data instead of inventing it. Server-only (pulls in the dataset).
 *
 *  Sourced from the canonical `buildMetricsSnapshot` contract, so the AI sees the
 *  exact totals/deltas/channels the dashboard does, plus significance, dated
 *  anomalies and the pacing forecast band. */

import { performance } from "./data";
import {
  buildMetricsSnapshot,
  type Anomaly,
  type AnomalyKind,
  type ChannelRow,
  type MonthlyPacing,
  type Significance,
  type Totals,
} from "./metrics";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "./format";
import { ANALYSIS_PERIOD_LABELS, type AnalysisPeriod } from "./ai-types";
import type { MetricKey } from "./types";

const PERIOD_DAYS: Record<AnalysisPeriod, number> = { "30d": 30, "90d": 90, "12m": 365 };

export interface Snapshot {
  period: AnalysisPeriod;
  periodLabel: string;
  current: Totals;
  delta: Record<MetricKey, number>;
  significance: Record<MetricKey, Significance>;
  channels: ChannelRow[];
  anomalies: Anomaly[];
  pacing: MonthlyPacing | null;
  goalPno: number;
  client: { name: string; domain: string; segment: string };
}

export function buildSnapshot(period: AnalysisPeriod): Snapshot {
  const snap = buildMetricsSnapshot(performance, {
    key: period,
    label: ANALYSIS_PERIOD_LABELS[period],
    days: PERIOD_DAYS[period],
  });
  return {
    period,
    periodLabel: ANALYSIS_PERIOD_LABELS[period],
    current: snap.current,
    delta: snap.delta,
    significance: snap.significance,
    channels: snap.channels,
    anomalies: snap.anomalies,
    pacing: snap.pacing,
    goalPno: snap.goals.pno,
    client: {
      name: performance.client.name,
      domain: performance.client.domain,
      segment: performance.client.segment,
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

export function snapshotToPromptText(s: Snapshot): string {
  const c = s.current;
  const sig = (k: MetricKey) => SIG_NOTE[s.significance[k]];

  const lines: string[] = [
    `Klient: ${s.client.name} (${s.client.domain}) — ${s.client.segment}`,
    `Období: posledních ${s.periodLabel} (srovnání s předchozím stejně dlouhým obdobím)`,
    "",
    "Souhrn metrik (hodnota | meziobdobní změna | spolehlivost změny):",
    `- Návštěvy: ${fmtInt(c.visits)} | ${fmtSignedPct(s.delta.visits)}${sig("visits")}`,
    `- Náklady: ${fmtCZK(c.cost)} | ${fmtSignedPct(s.delta.cost)}${sig("cost")}`,
    `- Konverze: ${fmtInt(c.conversions)} | ${fmtSignedPct(s.delta.conversions)}${sig("conversions")}`,
    `- Obrat (hodnota konverzí): ${fmtCZK(c.revenue)} | ${fmtSignedPct(s.delta.revenue)}${sig("revenue")}`,
    `- PNO: ${fmtPct(c.pno)} (cíl ${fmtPct(s.goalPno, 0)}) | ${fmtSignedPct(s.delta.pno)}${sig("pno")}`,
    `- ROAS: ${fmtMultiple(c.roas)}`,
    `- Konverzní poměr: ${fmtPct(c.cr, 2)}`,
    `- Průměrná hodnota objednávky: ${fmtCZK(c.aov)}`,
    "",
    "Výkon podle kanálů (obrat | podíl | PNO | ROAS | změna obratu):",
    ...s.channels.map(
      (ch) =>
        `- ${ch.channel}: ${fmtCZK(ch.revenue)} | ${fmtPct(ch.revenueShare, 0)} | ` +
        `${ch.pno > 0 ? fmtPct(ch.pno) : "—"} | ${ch.roas > 0 ? fmtMultiple(ch.roas) : "—"} | ` +
        `${ch.delta ? fmtSignedPct(ch.delta.revenue) : "—"}`
    ),
  ];

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

  return lines.join("\n");
}

const METRIC_LABEL: Partial<Record<MetricKey, string>> = {
  visits: "návštěvy",
  cost: "náklady",
  conversions: "konverze",
  revenue: "obrat",
  pno: "PNO",
};
