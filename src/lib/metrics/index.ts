/** Pure analytics layer over the daily series. Everything the dashboard shows is
 *  derived here from one source of truth, so KPIs, charts and the channel table
 *  always reconcile. No React, no formatting — just numbers in, numbers out.
 *
 *  This barrel re-exports the cohesive submodules so `@/lib/metrics` stays a
 *  drop-in for the previous single-file module. */

export * from "./ratios";
export * from "./totals";
export * from "./series";
export * from "./seasonality";
export * from "./pacing";
export * from "./channels";
export * from "./anomalies";
export * from "./meta";
export * from "./snapshot";

/** Convenience accessor for the dataset (typed import target). */
export type { PerformanceData } from "../types";
