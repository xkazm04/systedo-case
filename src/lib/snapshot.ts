/** Builds a performance snapshot from the dashboard dataset for the analysis
 *  tool. The same numbers the dashboard renders are turned into a compact,
 *  human-readable block that grounds the model — so the analysis interprets real
 *  data instead of inventing it. Server-only (pulls in the dataset). */

import { performance } from "./data";
import { channelRows, evaluatePeriod, type ChannelRow, type Totals } from "./metrics";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "./format";
import { ANALYSIS_PERIOD_LABELS, type AnalysisPeriod } from "./ai-types";
import type { MetricKey } from "./types";

const PERIOD_DAYS: Record<AnalysisPeriod, number> = { "30d": 30, "90d": 90, "12m": 365 };

export interface Snapshot {
  period: AnalysisPeriod;
  periodLabel: string;
  current: Totals;
  delta: Record<MetricKey, number>;
  channels: ChannelRow[];
  goalPno: number;
  client: { name: string; domain: string; segment: string };
}

export function buildSnapshot(period: AnalysisPeriod): Snapshot {
  const result = evaluatePeriod(performance.daily, PERIOD_DAYS[period]);
  return {
    period,
    periodLabel: ANALYSIS_PERIOD_LABELS[period],
    current: result.current,
    delta: result.delta,
    channels: channelRows(performance.channels, result.current),
    goalPno: performance.goals.pno,
    client: {
      name: performance.client.name,
      domain: performance.client.domain,
      segment: performance.client.segment,
    },
  };
}

export function snapshotToPromptText(s: Snapshot): string {
  const c = s.current;
  const lines: string[] = [
    `Klient: ${s.client.name} (${s.client.domain}) — ${s.client.segment}`,
    `Období: posledních ${s.periodLabel} (srovnání s předchozím stejně dlouhým obdobím)`,
    "",
    "Souhrn metrik (hodnota | meziobdobní změna):",
    `- Návštěvy: ${fmtInt(c.visits)} | ${fmtSignedPct(s.delta.visits)}`,
    `- Náklady: ${fmtCZK(c.cost)} | ${fmtSignedPct(s.delta.cost)}`,
    `- Konverze: ${fmtInt(c.conversions)} | ${fmtSignedPct(s.delta.conversions)}`,
    `- Obrat (hodnota konverzí): ${fmtCZK(c.revenue)} | ${fmtSignedPct(s.delta.revenue)}`,
    `- PNO: ${fmtPct(c.pno)} (cíl ${fmtPct(s.goalPno, 0)}) | ${fmtSignedPct(s.delta.pno)}`,
    `- ROAS: ${fmtMultiple(c.roas)}`,
    `- Konverzní poměr: ${fmtPct(c.cr, 2)}`,
    `- Průměrná hodnota objednávky: ${fmtCZK(c.aov)}`,
    "",
    "Výkon podle kanálů (obrat | podíl na obratu | PNO | ROAS):",
    ...s.channels.map(
      (ch) =>
        `- ${ch.channel}: ${fmtCZK(ch.revenue)} | ${fmtPct(ch.revenueShare, 0)} | ` +
        `${ch.pno > 0 ? fmtPct(ch.pno) : "—"} | ${ch.roas > 0 ? fmtMultiple(ch.roas) : "—"}`
    ),
  ];
  return lines.join("\n");
}
