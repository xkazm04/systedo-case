# Feature + Moonshot Scan — Metrics Analytics Engine

> Context: ctx_1781547850501_x58jrbl
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Per-channel period deltas (the channel table's missing comparison column)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/lib/metrics.ts:channelRows` / new `channelRowsCompared`
- **Scenario**: The headline KPI cards already show a meziobdobní delta per metric (`result.delta` consumed in `DashboardClient.tsx:155`), but the channel table (`channelRows`) only projects the *current* period totals. A marketer looking at "Sklik = ROAS 4.2×" can't tell whether that channel is improving or decaying — the single most important question when reallocating budget.
- **Opportunity**: Add `channelRowsCompared(channels, current: Totals, previous: Totals): ChannelRowDelta[]` that runs the existing `channelRows` projection over **both** windows from `evaluatePeriod` (`result.current` and `result.previous`) and attaches a `delta: Record<MetricKey, number>` per channel using the same `rel()` math already in `evaluatePeriod`. Extend `ChannelRow` with an optional `delta` field so the existing call site stays valid.
- **Impact**: Turns the channel table from a static snapshot into a movement view ("Google Ads obrat +18 %, Sklik −9 %"), unlocking the most actionable insight in the whole dashboard and feeding `buildInsights` with channel-trend statements instead of only point-in-time ROAS/PNO.
- **Implementation sketch**: In `metrics.ts`, factor the `rel()` helper out of `evaluatePeriod` to module scope; add `channelRowsCompared` reusing `channelRows` for each window then zipping by `channel`. Wire `result.previous` (already returned, unused in UI) into `DashboardClient.tsx:103`; render an arrow/percent column in `ChannelTable.tsx`. Note: channel `shares` are static, so deltas mirror totals deltas — to make them *differ per channel* (the realistic, demo-worthy version), allow optional time-varying shares in the dataset (see idea 5).

## 2. Statistical significance / confidence on every delta

- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/lib/metrics.ts:evaluatePeriod` (the `delta` block, lines 101-111)
- **Scenario**: `evaluatePeriod` computes a raw relative change `(cur - prev) / prev` for each metric. A "+6 %" on a 7-day window with noisy daily data may be pure variance, while "+6 %" on 90 days is real. Today both render identically with the same colour, which over-claims — a credibility risk for a case study whose whole point is *trustworthy* analytics.
- **Opportunity**: Compute a confidence signal per metric alongside `delta`. For the additive metrics, run a two-sample comparison of the daily values in `current` vs `previous` (Welch's t-style: difference of means over pooled standard error) and emit `significance: Record<MetricKey, "strong" | "weak" | "noise">` plus a `pValueApprox`. Keep it dependency-free with a small normal-approx helper.
- **Impact**: The UI can mute or annotate insignificant deltas ("v rámci běžného kolísání"), the AI snapshot can stop treating noise as a trend, and the case study demonstrates statistical literacy — a strong differentiator versus generic "number went up" dashboards.
- **Implementation sketch**: Add `dailyStats(points, key)` returning mean/variance over `DailyPoint[]`; add `significanceOf(current, previous)` returning the record; extend `PeriodResult` with `significance`. Surface it in `KpiCard` (dim the delta pill when `noise`) and append a confidence note to `snapshotToPromptText` in `snapshot.ts`.

## 3. Daily anomaly detection feed (spikes, drops, dead days)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: M (1-3d)
- **File**: `src/lib/metrics.ts` (new `detectAnomalies`), consumes `DailyPoint[]`
- **Scenario**: The engine reduces the whole series to totals and buckets; nothing flags the individual days that *caused* a swing. A cost spike, a zero-conversion outage, or a revenue collapse on a single day is invisible until it moves a 30-day total. The "Co stojí za pozornost" panel (`buildInsights`) is purely aggregate.
- **Opportunity**: Add `detectAnomalies(daily, { metric, window = 28, z = 2.5 }): Anomaly[]` using a rolling-window mean/σ (reuse `weekdayWeights`' trailing-window idea) and flag days whose value deviates beyond `z` σ, classified `spike | drop | outage` (outage = additive metric at/near 0 when expected non-zero). Return `{ date, metric, value, expected, z, kind }`.
- **Impact**: Gives the dashboard a real "what happened on May 14?" capability and feeds the AI analysis concrete, dated events ("náklady 14.5. +210 % nad očekáváním") instead of period averages — far more convincing than generic commentary. Becomes the data source for an event-annotation layer on `TrendChart`.
- **Implementation sketch**: Implement rolling stats over `daily` (de-seasonalise by dividing by `weekdayWeights` first to avoid weekend false positives). Add an `Anomaly` interface to `metrics.ts`; surface top-N anomalies in `buildInsights`/`snapshot.ts`; later draw markers in `TrendChart.tsx` at matching bucket dates.

## 4. Forecast confidence bands + goal-attainment probability

- **Severity**: Medium
- **Lens**: moonshot-architect
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/lib/metrics.ts:monthlyPacing` (`projection`/`attainment`, lines 203-218)
- **Scenario**: `monthlyPacing` already produces a sophisticated seasonality-weighted `projection` and a boolean `willHitGoal`. But a single point estimate hides risk: "projekce 2.1 M, cíl 2.0 M → splníme" reads as certainty even when the remaining days could plausibly land between 1.8 M and 2.4 M. Boolean confidence is exactly the trap a *case study* about analytics maturity should avoid.
- **Opportunity**: Extend `MonthlyPacing` with a distribution. Estimate the daily revenue σ from the trailing window, scale it across `daysRemaining` (variance adds), and emit `projectionLow`/`projectionHigh` (e.g. ±1.28σ ≈ P10/P90) plus `goalProbability` = P(month-end ≥ goal) from the normal CDF. This converts `willHitGoal` from a coin-flip boolean into "78 % pravděpodobnost splnění cíle".
- **Impact**: A genuinely premium signal — the `GoalPacing` card can render a shaded band and a probability dial. Makes the forecast honest under uncertainty and is a memorable, screenshot-worthy moment for the portfolio. Reuses the existing seasonality machinery, so the path is short.
- **Implementation sketch**: Add a `dailyRevenueSigma(daily)` helper (residual after removing `weekdayWeights`), compute remaining-days variance, add fields to `MonthlyPacing` and a small `normalCdf` util. Render band + `goalProbability` in `GoalPacing.tsx`; add the probability line to the AI snapshot.

## 5. A versioned `MetricsSnapshot` data contract — one engine output the whole product (and external tools) consume

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: `src/lib/metrics.ts` + `src/lib/snapshot.ts` + `src/lib/types.ts`
- **Scenario**: Right now the engine's outputs are recomputed ad hoc by each consumer: `DashboardClient.tsx` calls `evaluatePeriod`/`bucketize`/`channelRows` and re-derives insights inline (`buildInsights`), while `snapshot.ts` independently rebuilds an overlapping view for the AI. Logic (e.g. insight rules, footnote ratios) is duplicated and drifting. There's no single, serialisable artefact representing "the state of this account" that could be cached, diffed over time, or handed to another system.
- **Opportunity**: Define one canonical `buildMetricsSnapshot(data, period): MetricsSnapshot` in the engine that bundles totals, deltas + significance (idea 2), bucketed series, compared channel rows (idea 1), anomalies (idea 3), pacing-with-bands (idea 4), and a structured `insights[]` (move `buildInsights` rules out of the UI into the engine as data, not JSX). Version it (`schemaVersion`) and make it the *only* thing the dashboard, the AI snapshot, and any future API route consume. This is the platform move: the engine stops being a bag of functions and becomes a documented contract.
- **Impact**: 10x leverage — one source of truth means the dashboard, the Gemini/Claude analysis, an exportable JSON/PDF report, and a hypothetical public `/api/snapshot` endpoint all reconcile by construction. Enables snapshot-over-time diffing (week-over-week "what changed" reports), client-shareable read-only links, and makes the case study's headline claim ("KPIs, charts and the channel table always reconcile") literally enforced by the type system.
- **Implementation sketch**: Add `MetricsSnapshot` to `types.ts` (or a new `snapshot-schema.ts`); implement `buildMetricsSnapshot` composing the existing helpers; port `buildInsights` into `metrics.ts` returning `{ code, tone, params }` objects and have `DashboardClient.tsx` render them. Replace the bespoke `buildSnapshot` in `snapshot.ts` with a thin formatter over `MetricsSnapshot`. Add a `schemaVersion` constant and a serialisation test asserting totals/buckets/channels reconcile.
