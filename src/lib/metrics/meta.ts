/** Metric metadata — labels, descriptions, formatting and the curated metric sets
 *  the UI iterates over (headline KPIs, trend toggles, ratio-axis metrics). */

import { createFormatters } from "../format";
import type { Formatters, SupportedLocale } from "../format";
import type { MetricKey } from "../types";

/** Default (cs-CZ / CZK) formatter instance — the fallback when a call site does
 *  not pass its own locale-bound `Formatters`, so every existing `meta.format(v)`
 *  call keeps rendering byte-identical Czech output. */
const csF = createFormatters();

export interface MetricMeta {
  key: MetricKey;
  label: string;
  short: string;
  description: string;
  labelEn: string;
  shortEn: string;
  descriptionEn: string;
  /** which direction is "good" — used to colour deltas (PNO down = good) */
  goodDirection: "up" | "down";
  /** Format a value; pass the locale-bound `Formatters` (e.g. from
   *  `useFormatters()`) so the number follows the active locale — omitted, it
   *  falls back to the Czech default. */
  format: (v: number, f?: Formatters) => string;
  /** compact form for chart axes / tooltips */
  formatCompact: (v: number, f?: Formatters) => string;
  /** whether this metric can be plotted as a sum over time */
  plottable: boolean;
}

/** Return the localised label for a metric. Falls back to Czech when no locale is given. */
export function metricLabel(m: MetricMeta, locale?: SupportedLocale): string {
  return locale === "en" ? m.labelEn : m.label;
}

/** Return the localised short label for a metric. Falls back to Czech when no locale is given. */
export function metricShort(m: MetricMeta, locale?: SupportedLocale): string {
  return locale === "en" ? m.shortEn : m.short;
}

/** Return the localised description for a metric. Falls back to Czech when no locale is given. */
export function metricDescription(m: MetricMeta, locale?: SupportedLocale): string {
  return locale === "en" ? m.descriptionEn : m.description;
}

export const METRICS: Record<MetricKey, MetricMeta> = {
  visits: {
    key: "visits",
    label: "Návštěvy",
    short: "Návštěvy",
    description: "Počet návštěv napříč všemi kanály.",
    labelEn: "Visits",
    shortEn: "Visits",
    descriptionEn: "Number of visits across all channels.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtInt(v),
    formatCompact: (v, f = csF) => f.fmtInt(v),
    plottable: true,
  },
  cost: {
    key: "cost",
    label: "Náklady",
    short: "Náklady",
    description: "Mediální výdaje na reklamu.",
    labelEn: "Cost",
    shortEn: "Cost",
    descriptionEn: "Media spend on advertising.",
    goodDirection: "down",
    format: (v, f = csF) => f.fmtCZK(v),
    formatCompact: (v, f = csF) => f.fmtCZKCompact(v),
    plottable: true,
  },
  conversions: {
    key: "conversions",
    label: "Konverze",
    short: "Konverze",
    description: "Počet dokončených objednávek.",
    labelEn: "Conversions",
    shortEn: "Conversions",
    descriptionEn: "Number of completed orders.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtInt(v),
    formatCompact: (v, f = csF) => f.fmtInt(v),
    plottable: true,
  },
  revenue: {
    key: "revenue",
    label: "Hodnota konverzí",
    short: "Obrat",
    description: "Obrat připsaný marketingu (hodnota konverzí).",
    labelEn: "Conversion value",
    shortEn: "Revenue",
    descriptionEn: "Revenue attributed to marketing (conversion value).",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtCZK(v),
    formatCompact: (v, f = csF) => f.fmtCZKCompact(v),
    plottable: true,
  },
  profit: {
    key: "profit",
    label: "Přínos po nákladech",
    short: "Přínos",
    description: "Obrat připsaný marketingu po odečtení nákladů = obrat − náklady.",
    labelEn: "Net contribution",
    shortEn: "Contribution",
    descriptionEn: "Marketing-attributed revenue minus ad spend = revenue − cost.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtCZK(v),
    formatCompact: (v, f = csF) => f.fmtCZKCompact(v),
    plottable: true,
  },
  pno: {
    key: "pno",
    label: "PNO",
    short: "PNO",
    description: "Podíl nákladů na obratu = náklady / obrat.",
    labelEn: "PNO",
    shortEn: "PNO",
    descriptionEn: "Cost-to-revenue ratio = cost / revenue.",
    goodDirection: "down",
    format: (v, f = csF) => f.fmtPct(v),
    formatCompact: (v, f = csF) => f.fmtPct(v),
    plottable: true,
  },
  aov: {
    key: "aov",
    label: "Prům. hodnota objednávky",
    short: "AOV",
    description: "Average order value = obrat / konverze.",
    labelEn: "Avg. order value",
    shortEn: "AOV",
    descriptionEn: "Average order value = revenue / conversions.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtCZK(v),
    formatCompact: (v, f = csF) => f.fmtCZKCompact(v),
    plottable: true,
  },
  cr: {
    key: "cr",
    label: "Konverzní poměr",
    short: "CR",
    description: "Podíl návštěv, které skončily objednávkou.",
    labelEn: "Conversion rate",
    shortEn: "CR",
    descriptionEn: "Share of visits that resulted in an order.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtPct(v, 2),
    formatCompact: (v, f = csF) => f.fmtPct(v, 1),
    plottable: true,
  },
  roas: {
    key: "roas",
    label: "ROAS",
    short: "ROAS",
    description: "Návratnost výdajů = obrat / náklady.",
    labelEn: "ROAS",
    shortEn: "ROAS",
    descriptionEn: "Return on ad spend = revenue / cost.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtMultiple(v),
    formatCompact: (v, f = csF) => f.fmtMultiple(v),
    plottable: true,
  },
  ctr: {
    key: "ctr",
    label: "Míra prokliku",
    short: "CTR",
    description: "Podíl zobrazení reklam, která skončila proklikem.",
    labelEn: "Click-through rate",
    shortEn: "CTR",
    descriptionEn: "Share of ad impressions that resulted in a click.",
    goodDirection: "up",
    format: (v, f = csF) => f.fmtPct(v, 2),
    formatCompact: (v, f = csF) => f.fmtPct(v, 1),
    plottable: true,
  },
  cpc: {
    key: "cpc",
    label: "Cena za proklik",
    short: "CPC",
    description: "Průměrná cena za proklik = náklady / prokliky.",
    labelEn: "Cost per click",
    shortEn: "CPC",
    descriptionEn: "Average cost per click = cost / clicks.",
    goodDirection: "down",
    format: (v, f = csF) => f.fmtCZK(v),
    formatCompact: (v, f = csF) => f.fmtCZK(v),
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

/** Metrics whose natural baseline is not zero (ratios / efficiency). The trend
 *  chart zooms the y-axis to the data range for these instead of anchoring at 0,
 *  so movement in a 3.8×→4.2× ROAS or a 1.8 %→2.1 % CR is actually visible. */
export const RATIO_METRICS: ReadonlySet<MetricKey> = new Set([
  "pno",
  "aov",
  "cr",
  "roas",
  "ctr",
  "cpc",
]);
