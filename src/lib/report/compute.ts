/** Monthly report tiles — which metrics the recap surfaces and how a delta reads
 *  (a rise in cost/PNO/CPA is bad; a rise in revenue/conversions is good). The
 *  tile set is **per project type**, so a local clinic or a leadgen client sees
 *  enquiries / cost-per-lead — not e-shop Obrat/ROAS/PNO. Same metric vocabulary
 *  as the overview KPI presets (modules.ts), so the two surfaces reconcile. Pure &
 *  framework-free, tested; the page grounds the values in buildSnapshot(). */
import type { ProjectType } from "@/lib/projects/types";

export type ReportMetric =
  | "revenue"
  | "roas"
  | "pno"
  | "conversions"
  | "cost"
  | "visits"
  | "cpa"
  | "convRate"
  /** contribution = revenue − ad cost (NOT after-COGS; margin data is a separate seam) */
  | "profit"
  /** profit on ad spend = contribution / ad cost */
  | "poas"
  /** net profit margin = net profit / revenue (A3, only with a cost model) */
  | "profitMargin"
  /** click-through rate = clicks / impressions (live only — needs the paid-traffic
   *  pair the Ads sync carries; the sample spine drops it, so read as a fraction) */
  | "ctr"
  /** cost per click = ad cost / clicks (live only, paired with ctr) */
  | "cpc";
export type ReportFormat = "czk" | "multiple" | "pct" | "int";
export type DeltaTone = "positive" | "negative" | "neutral";

export interface ReportTileSpec {
  metric: ReportMetric;
  /** cs label */
  label: string;
  /** en label */
  labelEn: string;
  format: ReportFormat;
  /** true when a decrease is the good outcome (cost, PNO, CPA) */
  goodWhenDown: boolean;
  hasDelta: boolean;
}

const T = (
  metric: ReportMetric,
  label: string,
  labelEn: string,
  format: ReportFormat,
  goodWhenDown = false,
  hasDelta = true
): ReportTileSpec => ({ metric, label, labelEn, format, goodWhenDown, hasDelta });

const COST = T("cost", "Náklady", "Cost", "czk", true);
const VISITS = T("visits", "Návštěvy", "Visits", "int");
const CONV_RATE = T("convRate", "Konverzní poměr", "Conversion rate", "pct");

/** Report tiles per project type — mirrors the overview's KPI framing so the two
 *  agree, but carries the fuller ~5–6 tile set a client report wants. */
export const REPORT_TILE_PRESETS: Record<ProjectType, ReportTileSpec[]> = {
  eshop: [
    T("revenue", "Obrat", "Revenue", "czk"),
    T("profit", "Příspěvek", "Contribution", "czk"),
    T("roas", "ROAS", "ROAS", "multiple", false, false),
    T("poas", "POAS", "POAS", "multiple", false, false),
    T("pno", "PNO", "PNO", "pct", true),
    T("conversions", "Konverze", "Conversions", "int"),
    COST,
    VISITS,
  ],
  leadgen: [
    T("conversions", "Leady", "Leads", "int"),
    T("cpa", "Cena za lead", "Cost per lead", "czk", true),
    CONV_RATE,
    COST,
    VISITS,
  ],
  local: [
    T("conversions", "Poptávky & hovory", "Enquiries & calls", "int"),
    T("cpa", "Cena za poptávku", "Cost per enquiry", "czk", true),
    CONV_RATE,
    COST,
    VISITS,
  ],
  content: [
    VISITS,
    T("conversions", "Konverze", "Conversions", "int"),
    CONV_RATE,
    COST,
  ],
  app: [
    T("conversions", "Registrace", "Signups", "int"),
    T("cpa", "CAC", "CAC", "czk", true),
    CONV_RATE,
    COST,
    VISITS,
  ],
};

/** The recap tiles for a project type. */
export function reportTilesForType(type: ProjectType): ReportTileSpec[] {
  return REPORT_TILE_PRESETS[type] ?? REPORT_TILE_PRESETS.eshop;
}

// The paid-traffic pair — CTR reads as a fraction (clicks/impressions), CPC as a
// koruna cost per click. No delta line: a period-over-period paid-efficiency swing
// wants its own baseline the report doesn't reconstruct, so we keep the tile honest
// as a single figure rather than pairing it with a fabricated change.
const CTR = T("ctr", "CTR", "CTR", "pct", false, false);
const CPC = T("cpc", "CPC", "CPC", "czk", true, false);

/** Extra tiles surfaced ONLY on the live report path (a real Ads sync), for the
 *  project types where paid click efficiency is part of the story — the traffic-led
 *  e-shop and content reports. The sample spine has no impressions/clicks, so these
 *  would read 0 there; the page appends them only when `resolved.live`. Kept
 *  deliberately conservative (leadgen/local/app reports stay lead-focused). */
export function livePaidTilesForType(type: ProjectType): ReportTileSpec[] {
  return type === "eshop" || type === "content" ? [CTR, CPC] : [];
}

/** Back-compat: the default (e-shop) tile set. Prefer reportTilesForType(type). */
export const REPORT_TILES: ReportTileSpec[] = REPORT_TILE_PRESETS.eshop;

/** A period's recap figures, grounded in buildSnapshot() by the page. */
export interface ReportSnap {
  label: string;
  /** true when the series is shorter than the requested window (span < period
   *  days) — the totals cover fewer days than `label` claims and the delta is not
   *  a true full-period comparison (propagated from buildSnapshot's `truncated`).
   *  Consumers quoting the period as an absolute span must badge or soften it. */
  truncated: boolean;
  current: Partial<Record<ReportMetric, number>>;
  delta: Partial<Record<ReportMetric, number>>;
}

/** A tile's value from a snapshot, or null when the metric key is ABSENT (a renamed /
 *  drifted metric, or a tile spec added after an old shared link was persisted) — kept
 *  distinct from a real 0 so a client-facing report can SKIP the tile instead of
 *  fabricating a confident "0 Kč" / "0×". `current` is a Partial map, so an absent key
 *  reads `undefined` while a genuine zero reads `0`. Pure; unit-tested. */
export function tileSnapshotValue(snap: ReportSnap, metric: ReportMetric): number | null {
  const v = snap.current[metric];
  return v === undefined ? null : v;
}

/** Tone of a period-over-period delta given whether down is the good direction. */
export function deltaTone(delta: number, goodWhenDown: boolean): DeltaTone {
  if (Math.abs(delta) < 0.0001) return "neutral";
  const isGood = goodWhenDown ? delta < 0 : delta > 0;
  return isGood ? "positive" : "negative";
}
