# Feature + Moonshot Scan — Dashboard Workspace & KPIs

> Context: ctx_1781547850514_4k3vv8d
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Per-card AI explanation ("Proč?") wired to the existing snapshot grounding

- **Severity**: High
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: M (1-3d)
- **File**: `src/components/dashboard/KpiCard.tsx` (header row), `src/lib/snapshot.ts` (`buildSnapshot`/`snapshotToPromptText`)
- **Scenario**: A KPI card shows "Náklady +18 %" with a red delta badge, but the client viewing the dashboard has no idea *why* cost jumped or whether it's good. Today the only narrative lives in the static `buildInsights` list (max 4 bullets) at the bottom of `DashboardClient`. The codebase *already* has `buildSnapshot()` + `snapshotToPromptText()` feeding the `ai-asistent` page, but the dashboard cards themselves are inert.
- **Opportunity**: Add a small "Proč?" affordance to each `KpiCard` (and the `DeltaBadge`) that, on click, expands a one-sentence, grounded explanation of that metric's movement. Reuse `snapshotToPromptText` to build the context block and the existing LLM layer (`src/lib/llm/index.ts`) to generate a constrained, single-metric answer ("Náklady vzrostly o 18 %, taženo nárůstem výdajů na PPC; ROAS přitom klesl na 4.1×, takže růst nebyl plně efektivní."). Cache per (metric, period) so it's one call.
- **Impact**: Turns five static numbers into a self-explaining briefing — the single most "wow" moment for a marketing case study, and it directly demonstrates the product's AI value *inside* the dashboard rather than on a separate page.
- **Implementation sketch**: Add an optional `explain?: () => void` + expandable `<details>` slot to `KpiCard`. New route `src/app/api/explain-metric/route.ts` that takes `{ metric, period }`, calls `buildSnapshot(period)` → `snapshotToPromptText`, appends a "vysvětli pohyb metriky X jednou větou" instruction, and returns text. In `DashboardClient`, pass an `explain` handler keyed off `periodKey`/metric; memoize results in a `Map`.

## 2. Shareable dashboard state via URL params (period + trend metric)

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: S (<1d)
- **File**: `src/components/dashboard/DashboardClient.tsx` (`useState("90d")`, `useState<MetricKey>("revenue")`)
- **Scenario**: A reviewer/recruiter lands on `/dashboard`, switches to "12 měsíců" and the "PNO" trend, then copies the URL to send to a colleague. The recipient sees the default 90-day / revenue view instead — all selection state is lost because `periodKey` and `trendMetric` live only in component state. For a portfolio piece meant to be *shared*, that's a missed beat.
- **Opportunity**: Persist `periodKey` and `trendMetric` in the URL query string (`?obdobi=12m&metrika=pno`) using `useSearchParams`/`router.replace` (App Router, shallow). The page already has a clean enum of valid values (`PERIODS`, `TREND_METRICS`) to validate against, so it's a tight, safe mapping.
- **Impact**: Deep-linkable, shareable dashboard views — recruiters can bookmark the exact slice that impressed them, and it signals product polish (state-as-URL is a hallmark of mature analytics tools).
- **Implementation sketch**: In `DashboardClient`, initialise both `useState`s from `useSearchParams()` with a guard against `PERIODS`/`TREND_METRICS`; on `setPeriodKey`/`setTrendMetric`, call `router.replace(\`?obdobi=...&metrika=...\`, { scroll: false })`. No new files; ~20 lines.

## 3. Forecast confidence + "what it takes to hit goal" callout on GoalPacing

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/components/dashboard/GoalPacing.tsx` (header / stat tiles), `src/lib/metrics.ts` (`monthlyPacing`, `weekdayWeights`)
- **Scenario**: GoalPacing shows a seasonality-weighted `projection` and "78 % cíle" but presents the forecast as a single hard number. A client behind plan asks the obvious next question: "so what do we need per day to still hit it?" — and there's no answer on the card. The data to compute it (`goal`, `mtd`, `daysRemaining`, weekday weights) is all already inside `monthlyPacing`.
- **Opportunity**: Extend `MonthlyPacing` with two derived fields: `requiredDailyRunRate` (= `(goal − mtd) / remaining-weekday-weight`, reusing the weekday weights already computed) and a coarse confidence band (e.g. ± based on trailing daily variance). Render a third headline line under the projection: "Pro dosažení cíle je potřeba ~85 000 Kč/den ve zbývajících 9 dnech" plus a faint band on the gauge. When `complete`, suppress it.
- **Impact**: Converts a passive forecast into an actionable target — the difference between a *reporting* dashboard and a *steering* one, which is exactly the narrative a marketing-product case study wants to tell.
- **Implementation sketch**: In `monthlyPacing`, after `projection`, compute remaining weekday-weight sum and `requiredDailyRunRate`; add stddev of trailing daily revenue for a band. Surface both in `MonthlyPacing`. In `GoalPacing`, add a line in the headline block and an optional lighter band rect on the gauge between `mtd` and `goal`.

## 4. "Steering layer" — turn the dashboard into a recommendation engine with simulated budget reallocation

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/components/dashboard/ChannelTable.tsx` + `src/lib/metrics.ts` (`channelRows`, `Totals`), new `src/lib/simulate.ts`
- **Scenario**: The dashboard *describes* performance (best ROAS channel, worst PNO channel are already detected in `buildInsights`), but stops at description. The end state for an analytics product is prescription: "move X Kč from Sklik to PPC and projected revenue rises Y while PNO falls Z." Everything needed — per-channel ROAS/PNO/CR via `channelRows`, the goal in `goals.pno` — is already derived.
- **Opportunity**: Add a "Co kdyby?" budget-reallocation simulator beneath the channel table: a set of sliders that redistribute the period's total `cost` across channels, with a pure `simulateReallocation()` function projecting new revenue/PNO/ROAS under a simple diminishing-returns curve per channel (efficiency anchored on each channel's current ROAS). Show the projected new headline KPIs side-by-side with current. Optionally hand the resulting plan to the AI assistant for a written rationale.
- **Impact**: Repositions the case study from "I can build a dashboard" to "I can build the decision tool a media buyer actually wants" — a category-defining differentiator. Network effect within the app: the simulated plan becomes the seed for both the AI assistant and the Google Ads console (`kampane`), tying three contexts into one workflow.
- **Implementation sketch**: New pure module `src/lib/simulate.ts`: `simulateReallocation(channels, totals, newCostShares)` applying a per-channel response curve (`revenue ≈ k · cost^α`, α<1, calibrated so current point matches). New `BudgetSimulator.tsx` client component with sliders constrained to sum 100 %; render projected `Totals` through existing `KpiCard`s in a "simulace" mode. Reuse `pnoTone`/`DeltaBadge` for the deltas vs. baseline.

## 5. Anomaly & goal-breach alerting that compounds into a monitoring product

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/lib/metrics.ts` (`evaluatePeriod`, `weekdayWeights`, `monthlyPacing`), `src/components/dashboard/DashboardClient.tsx` (`buildInsights`)
- **Scenario**: `buildInsights` today produces threshold-free, always-on bullets ("PNO is over goal", "best ROAS channel is X"). A real client doesn't want a dashboard they must *visit* to learn cost spiked 40 % yesterday or that month-end projection just slipped below goal — they want to be *told*. The seasonality machinery in `weekdayWeights` already gives a per-weekday expected value, which is exactly the baseline an anomaly detector needs.
- **Opportunity**: Build a real anomaly layer: `detectAnomalies(daily)` flags days where actual revenue/cost deviates beyond N× the weekday-expected value, and `monthlyPacing` already knows when `willHitGoal` flips. Surface these as ranked, severity-typed alerts (reusing the existing `Insight` tone system + `DeltaBadge` colors) at the top of the dashboard, each deep-linkable to the trend chart. The moonshot extension: emit the same alert objects to an `/api` digest endpoint that a scheduled job (or the `claude`/`gemini` LLM layer) turns into a weekly Czech-language email summary — the dashboard becomes a monitoring service, not a page.
- **Impact**: Transforms a one-time "case study" snapshot into a living product with retention mechanics (alerts pull users back) and a clear path to a paid tier (proactive monitoring). It's the platform move: the alert schema becomes the shared currency for dashboard, AI assistant, and email.
- **Implementation sketch**: New `src/lib/anomalies.ts`: `weekdayBaseline(daily)` (reuse `weekdayWeights` logic) + `detectAnomalies(daily): Anomaly[]` with `{ date, metric, expected, actual, zScore, tone }`. Replace/augment `buildInsights` to merge anomalies + pacing breaches, sort by severity, cap at 4. Add `src/app/api/digest/route.ts` that calls `buildSnapshot` + `detectAnomalies`, feeds them through `src/lib/llm/index.ts`, and returns a formatted weekly summary; wire a Vercel cron later.
