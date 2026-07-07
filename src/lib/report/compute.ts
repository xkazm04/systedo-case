/** Monthly report tiles — which metrics the recap surfaces and how a delta reads
 *  (a rise in cost/PNO is bad, a rise in revenue/conversions is good). Pure &
 *  framework-free, tested; the page grounds the values in buildSnapshot(). */

export type ReportMetric = "revenue" | "roas" | "pno" | "conversions" | "cost" | "visits";
export type ReportFormat = "czk" | "multiple" | "pct" | "int";
export type DeltaTone = "positive" | "negative" | "neutral";

export interface ReportTileSpec {
  metric: ReportMetric;
  format: ReportFormat;
  /** true when a decrease is the good outcome (cost, PNO) */
  goodWhenDown: boolean;
  hasDelta: boolean;
}

export const REPORT_TILES: ReportTileSpec[] = [
  { metric: "revenue", format: "czk", goodWhenDown: false, hasDelta: true },
  { metric: "roas", format: "multiple", goodWhenDown: false, hasDelta: false },
  { metric: "pno", format: "pct", goodWhenDown: true, hasDelta: true },
  { metric: "conversions", format: "int", goodWhenDown: false, hasDelta: true },
  { metric: "cost", format: "czk", goodWhenDown: true, hasDelta: true },
  { metric: "visits", format: "int", goodWhenDown: false, hasDelta: true },
];

/** A period's recap figures, grounded in buildSnapshot() by the page. */
export interface ReportSnap {
  label: string;
  current: Record<ReportMetric, number>;
  delta: Partial<Record<ReportMetric, number>>;
}

/** Tone of a period-over-period delta given whether down is the good direction. */
export function deltaTone(delta: number, goodWhenDown: boolean): DeltaTone {
  if (Math.abs(delta) < 0.0001) return "neutral";
  const isGood = goodWhenDown ? delta < 0 : delta > 0;
  return isGood ? "positive" : "negative";
}
