/** Metric metadata — labels, descriptions, formatting and the curated metric sets
 *  the UI iterates over (headline KPIs, trend toggles, ratio-axis metrics). */

import {
  fmtCZK,
  fmtCZKCompact,
  fmtInt,
  fmtMultiple,
  fmtPct,
} from "../format";
import type { MetricKey } from "../types";

export interface MetricMeta {
  key: MetricKey;
  label: string;
  short: string;
  description: string;
  /** which direction is "good" — used to colour deltas (PNO down = good) */
  goodDirection: "up" | "down";
  format: (v: number) => string;
  /** compact form for chart axes / tooltips */
  formatCompact: (v: number) => string;
  /** whether this metric can be plotted as a sum over time */
  plottable: boolean;
}

export const METRICS: Record<MetricKey, MetricMeta> = {
  visits: {
    key: "visits",
    label: "Návštěvy",
    short: "Návštěvy",
    description: "Počet návštěv napříč všemi kanály.",
    goodDirection: "up",
    format: fmtInt,
    formatCompact: (v) => fmtInt(v),
    plottable: true,
  },
  cost: {
    key: "cost",
    label: "Náklady",
    short: "Náklady",
    description: "Mediální výdaje na reklamu.",
    goodDirection: "down",
    format: fmtCZK,
    formatCompact: fmtCZKCompact,
    plottable: true,
  },
  conversions: {
    key: "conversions",
    label: "Konverze",
    short: "Konverze",
    description: "Počet dokončených objednávek.",
    goodDirection: "up",
    format: fmtInt,
    formatCompact: (v) => fmtInt(v),
    plottable: true,
  },
  revenue: {
    key: "revenue",
    label: "Hodnota konverzí",
    short: "Obrat",
    description: "Obrat připsaný marketingu (hodnota konverzí).",
    goodDirection: "up",
    format: fmtCZK,
    formatCompact: fmtCZKCompact,
    plottable: true,
  },
  pno: {
    key: "pno",
    label: "PNO",
    short: "PNO",
    description: "Podíl nákladů na obratu = náklady / obrat.",
    goodDirection: "down",
    format: (v) => fmtPct(v),
    formatCompact: (v) => fmtPct(v),
    plottable: true,
  },
  aov: {
    key: "aov",
    label: "Prům. hodnota objednávky",
    short: "AOV",
    description: "Average order value = obrat / konverze.",
    goodDirection: "up",
    format: fmtCZK,
    formatCompact: fmtCZKCompact,
    plottable: true,
  },
  cr: {
    key: "cr",
    label: "Konverzní poměr",
    short: "CR",
    description: "Podíl návštěv, které skončily objednávkou.",
    goodDirection: "up",
    format: (v) => fmtPct(v, 2),
    formatCompact: (v) => fmtPct(v, 1),
    plottable: true,
  },
  roas: {
    key: "roas",
    label: "ROAS",
    short: "ROAS",
    description: "Návratnost výdajů = obrat / náklady.",
    goodDirection: "up",
    format: (v) => fmtMultiple(v),
    formatCompact: (v) => fmtMultiple(v),
    plottable: true,
  },
};

/** Metrics shown as headline KPI cards, in order (mirrors the assignment). */
export const HEADLINE_METRICS: MetricKey[] = [
  "visits",
  "cost",
  "conversions",
  "revenue",
  "pno",
];

/** Metrics offered as toggles on the main trend chart. The derived ratios
 *  (ROAS / AOV / CR) are plotted per-day from `dailyValue`, so a flat run-rate
 *  never hides a worsening efficiency trend behind a rising revenue line. */
export const TREND_METRICS: MetricKey[] = [
  "revenue",
  "cost",
  "visits",
  "conversions",
  "pno",
  "roas",
  "aov",
  "cr",
];

/** Metrics whose natural baseline is not zero (ratios / efficiency). The trend
 *  chart zooms the y-axis to the data range for these instead of anchoring at 0,
 *  so movement in a 3.8×→4.2× ROAS or a 1.8 %→2.1 % CR is actually visible. */
export const RATIO_METRICS: ReadonlySet<MetricKey> = new Set(["pno", "aov", "cr", "roas"]);
