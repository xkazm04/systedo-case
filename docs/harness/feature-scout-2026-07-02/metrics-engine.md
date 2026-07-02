# Feature Scout — Metrics Analytics Engine (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/lib/metrics.ts, src/lib/data.ts, src/lib/types.ts
> Note: `src/lib/metrics.ts` has been split into `src/lib/metrics/*` (index, ratios, totals, series, seasonality, pacing, channels, anomalies, meta, snapshot). All prior-scan findings for this context are either fixed in code (truncated/partial flags, lost/gained impact split, sample variance) or listed as open follow-ups — none are re-proposed here.

## 1. Add a year-over-year comparison baseline to evaluatePeriod
- **Impact**: 8/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/metrics/series.ts:92`
- **Opportunity**: `evaluatePeriod` only compares against the immediately preceding window (`daily.slice(n - span * 2, n - span)`, series.ts:99). For a seasonal e-shop this is often apples-to-oranges (Q4 vs Q3), and the seed is exactly 730 days — two full years — so a same-period-last-year baseline is computable for every period up to 365d, yet the engine can't express it.
- **Why valuable**: "vs. stejné období loni" is the comparison every e-commerce marketer reaches for first during seasonal swings; without it the dashboard's deltas overstate/understate seasonal moves and the AI grounding inherits the same blind spot.
- **Build sketch**: Add an optional `baseline: "previous" | "yoy"` parameter to `evaluatePeriod`; for `yoy` slice `previous = daily.slice(n - span - 365, n - 365)` (fall back to `previous` + set the existing `truncated` flag when the series is too short). Totals, `rel` deltas, `significanceFor` and `comparePoints` all reuse unchanged — `PeriodResult` keeps its shape. UI: a tiny two-option toggle next to the existing `Segmented` period selector in `DashboardClient.tsx` (already `"use client"`), and thread the choice through `buildMetricsSnapshot` via `SnapshotPeriod` so the AI prompt line "srovnání s předchozím stejně dlouhým obdobím" stays truthful.

## 2. Turn "behind plan" into a required-pace prescription in monthlyPacing
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/lib/metrics/pacing.ts:75`
- **Opportunity**: `MonthlyPacing` diagnoses (pace, projection, goalProbability) but never prescribes: when a month is behind, nothing says what daily revenue — or ad spend — the remaining days must deliver to still hit the goal. All inputs are already computed (goal, mtd, daysRemaining, weekday weights, current ROAS via `totalsOf`).
- **Why valuable**: "You need ≈ 64 000 Kč/day, 18 % above your recent pace — at current ROAS that's ≈ +4 000 Kč/day of spend" is the single most actionable line an agency dashboard can show a client; it converts a passive forecast into a steering decision.
- **Build sketch**: Add pure derived fields to `MonthlyPacing`: `requiredDailyRevenue = (goal − mtd) / daysRemaining` (or its weekday-weighted variant using the already-built `weightMonth`/`weightElapsed` loop), `recentDailyRevenue` (projection-implied remaining pace), and `requiredVsRecent` ratio; optionally `impliedExtraDailySpend = shortfall_per_day / roas` using `totalsOf(daily.slice(-28)).roas`. Render as a fourth `Stat` tile in `GoalPacing.tsx` (already `"use client"`), shown only when `!complete && !willHitGoal`.

## 3. Detect sustained trends (slow bleed) as a complement to single-day anomalies
- **Impact**: 8/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/lib/metrics/anomalies.ts:56`
- **Opportunity**: `detectAnomalies` only flags individual days breaching `|z| ≥ 2.5` against a 28-day baseline — a gradual 4-week revenue or CR decline never trips a per-day threshold, and `buildInsights` (DashboardClient.tsx:513) only compares whole-period totals. The engine has no concept of momentum, so the most dangerous failure mode for an account (slow bleed) is invisible everywhere: alerts, insights, and the AI grounding.
- **Why valuable**: Agencies get fired over unnoticed multi-week drifts, not single flagged days; a "obrat klesá 4 týdny v řadě (−12 %)" finding is the highest-signal alert this dashboard could add.
- **Build sketch**: New pure module `src/lib/metrics/trends.ts`: de-seasonalise daily values with the existing `weekdayWeightsFor`, roll them into consecutive 7-day means, and emit a `Trend { metric, weeks, cumulativeChange, direction }` when ≥3 consecutive weekly moves in one direction exceed noise (reuse the `meanVar` + z heuristic from series.ts). Export via the barrel, add a `trends` field to `MetricsSnapshot` in `snapshot.ts`, surface as a top-priority line in the "Co stojí za pozornost" card and a line in `snapshotToPromptText` (src/lib/snapshot.ts — not a gate-hashed file).

## 4. Surface the weekday performance profile the engine already computes
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/lib/metrics/seasonality.ts:37`
- **Opportunity**: `weekdayWeightsFor` computes per-weekday indices for every raw metric, but it's consumed only internally (de-seasonalising anomalies, weighting the forecast) — the user never sees the day-of-week shape of their business. Half-implemented feature: the math exists, the presentation doesn't.
- **Why valuable**: "Neděle běží 35 % pod průměrem, úterý 20 % nad" directly drives ad scheduling and bid adjustments by day of week — a concrete, recognisable agency deliverable that also explains why the forecast band behaves as it does.
- **Build sketch**: Export a `weekdayProfile(daily)` helper returning `{ day, index, best, worst }[]` for revenue (and optionally CR via a per-day ratio series), normalised around 1 like the existing weights. Render as a compact 7-bar mini-chart card in the dashboard side rail (hand-rolled `<svg>` per the codebase convention, pure points serializer so it could stay server-renderable; realistically lands in `DashboardClient.tsx`, hence [CLIENT]). Feed the best/worst line into `buildInsights` as a fifth candidate insight.

## 5. Add profit (revenue − cost) as a first-class metric
- **Impact**: 6/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/types.ts:50`
- **Opportunity**: The metric set has efficiency ratios (PNO, ROAS) and gross totals, but no absolute contribution metric — "kolik nám marketing vydělal po odečtení nákladů" is absent from KPIs, trend toggles, channel rows and the AI grounding. The workspace's `lib/profit` module proves the product cares about this, yet the case-study engine can't express even the margin-free version.
- **Why valuable**: A rising-revenue/rising-cost account can be flat or negative on contribution while every headline metric looks green; one additive metric closes that story and makes the trend chart able to show "net" directly.
- **Build sketch**: Extend `MetricKey` with `"profit"`; the compiler then walks you through every site: `dailyValue` switch (series.ts:51), `totalsOf` (totals.ts:38, `revenue − cost`), the explicit `delta`/`significance` records in `evaluatePeriod`, `channelRowsCompared` deltas, `METRICS` meta (label "Přínos po nákladech", `fmtCZK`, `goodDirection: "up"`, plottable) and `TREND_METRICS`. `Record<MetricKey, …>` exhaustiveness makes the change mechanical; the [CLIENT] part is the `footnotes` record in `DashboardClient.tsx` plus optionally a `snapshotToPromptText` line. Keep it out of `HEADLINE_METRICS` to preserve the 5-card layout.
