# Dashboard Workspace & KPIs — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. The rich MetricsSnapshot is invisible — no export, share, or scheduled report
- **Severity**: High
- **Lens**: Both
- **Category**: monetization
- **File**: src/components/dashboard/DashboardClient.tsx, src/lib/metrics.ts (`buildMetricsSnapshot`, `MetricsSnapshot`)
- **Opportunity**: The canonical `MetricsSnapshot` contract already packages totals, deltas+`significance`, channels, `anomalies`, and the full `pacing` forecast band — but the dashboard offers no way to export it (PDF/CSV/PNG), copy a shareable link, or email a recurring digest. Today it only feeds the AI via `snapshot.ts`; the human-facing surface is read-only.
- **Value**: For an agency, the recurring client report IS the billable deliverable. A one-click "Export report" / "Send weekly to client" turns an analytics view into the retention and upsell hook that justifies the retainer — the single most monetizable gap in this context.
- **Effort**: M
- **Fix sketch**: Add an "Export" action in the page header that serialises `buildMetricsSnapshot(performance, period)` to CSV/PDF (reuse `snapshotToPromptText` for a prose summary), plus a "Copy link" that encodes `periodKey` in the URL; later wire a cron-style email digest off the same snapshot.

## 2. Headline KPIs and pacing are static — no drill-down or click-through to channels/anomalies
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/dashboard/KpiCard.tsx, src/components/dashboard/DashboardClient.tsx
- **Opportunity**: `KpiCard` renders value, `DeltaBadge`, footnote, and a `Sparkline`, but nothing is interactive. Clicking a KPI (e.g. revenue) doesn't set `trendMetric`, scroll to the channel table, or filter `topAnomalies` to that metric. The data to do this (`result.delta`, `channels` with per-channel `delta`, `anomalies` carrying `.metric`) is already computed and discarded for interaction.
- **Value**: Drill-down is the difference between a "pretty number wall" and a tool an account manager actually investigates with. "Why did PNO move?" → click PNO → see the channel + the dated anomaly. High perceived sophistication for low data cost; directly strengthens the case-study's "we built a real product" narrative.
- **Effort**: M
- **Fix sketch**: Make `KpiCard` accept an `onSelect(metricKey)`; on click call `setTrendMetric(m)` and scroll to the channel section, and filter `topAnomalies`/`buildInsights` to the selected metric. Reuse the existing `TREND_METRICS` membership check to no-op for non-plottable keys.

## 3. Monthly goal & PNO target are hardcoded — no user-editable targets or scenario "what-if"
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/components/dashboard/GoalPacing.tsx, src/lib/metrics.ts (`monthlyPacing`), src/lib/data (`data.goals`)
- **Opportunity**: `goal` and `goalPno` come from a fixed `data.goals` object. There is no UI to set/adjust the monthly revenue goal or PNO target, and no "what-if" slider showing how `goalProbability`, `attainment`, and `willHitGoal` shift. The forecast engine (`projection`, `goalProbability` via `normalCdf`) is the hard part and already exists — only the input control is missing.
- **Value**: Editable goals convert a passive forecast into a planning instrument — the exact moment a client commits to a number and a budget. It also unlocks the agency conversation "to hit goal you need +X spend," which is where budget upsell lives. Differentiator vs. stock Google Ads/GA dashboards that can't pace against a custom revenue goal.
- **Effort**: M
- **Fix sketch**: Add an inline editable goal in `GoalPacing` (or a small "Cíl" popover) that overrides `data.goals.monthlyRevenue`/`pno` in client state and re-runs `monthlyPacing`; add a remaining-days spend slider that re-derives `projection`/`goalProbability` live so the user sees the probability needle move.

## 4. Period selector is fixed to four presets — no custom range, MoM, or YoY comparison
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/dashboard/DashboardClient.tsx (`Segmented`, `PERIODS`), src/lib/metrics.ts (`evaluatePeriod`)
- **Opportunity**: Comparison is always "previous equal-length window" (`evaluatePeriod` slices `previous` immediately before `current`). There's no custom date range, and no year-over-year option — critical for the seasonal e-commerce client this app models, where "vs. last December" matters far more than "vs. last month." `DeltaBadge` already supports a comparison concept; only the baseline choice is hardwired.
- **Value**: Seasonality-aware businesses judge performance against the same period last year, not the rolling prior window. Offering YoY/custom-range comparison is a concrete, widely-requested power-user feature and reinforces the seasonality story the GoalPacing forecast already tells.
- **Effort**: M
- **Fix sketch**: Extend `PERIODS`/`evaluatePeriod` with a `compareMode` ("prev" | "yoy" | custom range) that selects the comparison slice by date offset rather than adjacency; surface it as a second `Segmented` next to the period one and thread it into `delta`/`significance`.

## 5. Insights & anomaly feeds are template-generated — no AI narrative or "next action" CTA
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/components/dashboard/DashboardClient.tsx (`buildInsights`, `anomalyLine`)
- **Opportunity**: "Co stojí za pozornost" is hand-rolled rule output (revenue delta, PNO vs goal, best ROAS, worst PNO) capped at 4 lines, and anomalies are described mechanically. Meanwhile a full AI grounding pipeline (`snapshot.ts` → `PerformanceAnalyst`) exists elsewhere in the app but isn't tapped here. Each insight is also a dead end — no recommended action or link into the campaign console.
- **Value**: Connecting the existing AI analyst to the dashboard insight rail (with a per-insight "Co s tím" CTA into the Google Ads console) is the headline differentiator the whole case study is pitching — an analytics product that explains AND acts, not just charts. Low incremental cost given the AI layer already exists.
- **Effort**: M
- **Fix sketch**: Add an optional "AI shrnutí" mode to the insights card that calls the existing analyst over the same `buildSnapshot(period)`, and give each `Insight`/anomaly an action link (e.g. worst-PNO channel → campaign console filtered to that channel) using the channel/metric already in scope.
