/** Anomaly detection over a de-seasonalised trailing baseline (spike / drop /
 *  outage / pno goal-breach), and the aggregate money impact of the flagged days. */

import type { DailyPoint, MetricKey, RawMetric } from "../types";
import { dayOfWeek, weekdayWeightsFor } from "./seasonality";

export type AnomalyKind = "spike" | "drop" | "outage" | "goal-breach";

export interface Anomaly {
  date: string;
  /** the metric that anomalies (revenue/cost/conversions/visits, or pno for a breach) */
  metric: MetricKey;
  observed: number;
  /** de-seasonalised rolling expectation for that day (the goal for a breach) */
  expected: number;
  /** standardised deviation from the rolling baseline (signed) */
  z: number;
  kind: AnomalyKind;
}

export interface AnomalyOptions {
  /** trailing baseline window in days (a multiple of 7 keeps weekdays balanced) */
  window?: number;
  /** |z| threshold to flag a point */
  z?: number;
}

/**
 * Flag individual days whose metric value deviates from a de-seasonalised
 * trailing baseline (spike / drop / outage), plus PNO goal-breaches that are
 * actually driven by an anomalous day (a cost spike or a revenue collapse) so
 * normal daily variance isn't reported. Pure; reuses the same weekday-seasonality
 * idea as `monthlyPacing`, so it can't double-count weekend dips.
 */
export function detectAnomalies(
  daily: DailyPoint[],
  goals: { pno: number },
  options: AnomalyOptions = {}
): Anomaly[] {
  const window = options.window ?? 28;
  const threshold = options.z ?? 2.5;
  if (daily.length < window + 1) return [];

  const metrics: RawMetric[] = ["revenue", "cost", "conversions", "visits"];
  const out: Anomaly[] = [];
  const zByMetric: Partial<Record<RawMetric, Map<string, number>>> = {};

  for (const key of metrics) {
    const weights = weekdayWeightsFor(daily, key);
    // De-seasonalise so a normal weekend low isn't mistaken for a drop.
    const adj = daily.map((p) => {
      const w = weights[dayOfWeek(p.date)] || 1;
      return p[key] / (w > 0 ? w : 1);
    });
    const zMap = new Map<string, number>();
    for (let i = window; i < daily.length; i++) {
      const base = adj.slice(i - window, i);
      const mean = base.reduce((a, b) => a + b, 0) / base.length;
      const variance = base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length;
      const std = Math.sqrt(variance);
      if (!(std > 0)) continue;
      const z = (adj[i] - mean) / std;
      zMap.set(daily[i].date, z);
      if (Math.abs(z) < threshold) continue;
      const w = weights[dayOfWeek(daily[i].date)] || 1;
      const expected = mean * (w > 0 ? w : 1);
      const observed = daily[i][key];
      const nearZero = expected > 0 && observed <= expected * 0.1;
      const kind: AnomalyKind = z < 0 && nearZero ? "outage" : z > 0 ? "spike" : "drop";
      out.push({ date: daily[i].date, metric: key, observed, expected, z, kind });
    }
    zByMetric[key] = zMap;
  }

  // PNO goal-breach: a day whose pno exceeds the goal AND is driven by an
  // anomalous cost spike or revenue collapse (not ordinary daily variance).
  const costZ = zByMetric.cost;
  const revZ = zByMetric.revenue;
  for (let i = window; i < daily.length; i++) {
    const p = daily[i];
    if (p.revenue <= 0) continue;
    const pno = p.cost / p.revenue;
    if (pno <= goals.pno) continue;
    const cz = costZ?.get(p.date) ?? 0;
    const rz = revZ?.get(p.date) ?? 0;
    if (cz >= threshold || rz <= -threshold) {
      out.push({ date: p.date, metric: "pno", observed: pno, expected: goals.pno, z: Math.max(cz, -rz), kind: "goal-breach" });
    }
  }

  return out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : Math.abs(b.z) - Math.abs(a.z)
  );
}

/** Aggregate money effect of the flagged days, in CZK. */
export interface AnomalyImpact {
  /** Σ of revenue *shortfalls* only (observed < expected, ≤ 0 = revenue lost).
   *  Windfalls are excluded so a good day can't mask a bad one in the headline. */
  revenue: number;
  /** Σ of cost *overspend* only (observed > expected, ≥ 0 = wasted spend).
   *  Underspend is excluded for the same reason. */
  cost: number;
  /** Net damage = revenue − cost, so lost revenue and wasted spend both push the
   *  figure negative (a clean, windfall-free "this cost us ~X Kč" headline). */
  net: number;
  /** Upside the same anomalies carried (revenue windfalls + cost savings, ≥ 0),
   *  reported separately so it informs without diluting the damage figure. */
  gained: number;
  /** count of days carrying a monetary effect (revenue or cost anomalies) */
  count: number;
}

/**
 * Quantify the anomalies the detector already found into a single Kč figure.
 * Only *adverse* deviations feed the damage headline — revenue shortfalls and
 * cost overspend — so a windfall day can no longer net out a loss day inside the
 * same "this cost us" number (the previous Σ(observed − expected) blended both,
 * understating the real damage). Windfalls and savings are surfaced separately as
 * `gained`. PNO goal-breaches are derived from their underlying cost/revenue
 * anomalies, so they are intentionally not added again (no double-counting).
 * Turns "3 upozornění" into "dopad ≈ −85 tis. Kč".
 */
export function anomalyImpact(anomalies: Anomaly[]): AnomalyImpact {
  let revenue = 0; // adverse revenue (shortfalls, ≤ 0)
  let cost = 0; // adverse cost (overspend, ≥ 0)
  let gained = 0; // windfalls + savings, ≥ 0
  let count = 0;
  for (const a of anomalies) {
    if (a.metric === "revenue") {
      const d = a.observed - a.expected;
      if (d < 0) revenue += d;
      else gained += d;
      count += 1;
    } else if (a.metric === "cost") {
      const d = a.observed - a.expected;
      if (d > 0) cost += d;
      else gained += -d; // cost below expected = a saving
      count += 1;
    }
  }
  return { revenue, cost, net: revenue - cost, gained, count };
}
