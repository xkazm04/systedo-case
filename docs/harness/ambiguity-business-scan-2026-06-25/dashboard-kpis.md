# Dashboard Workspace & KPIs — Ambiguity + Business scan
> Context: Interactive performance dashboard — headline KPI cards, period switching, PoP delta badges, a seasonality-aware monthly goal-pacing forecast, and auto-generated insights.
> Files analyzed: 5
> Total findings: 5

## 1. Forecast shows a confident "X % chance of hitting goal" built on undocumented, unguarded assumptions
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: src/components/dashboard/GoalPacing.tsx:137 (also src/lib/metrics/pacing.ts:77-88)
- **Problem/Opportunity**: The pacing card renders `goalProbability` as a precise figure ("73 % šance na splnění") and a single-number projection. That probability assumes the remaining days are i.i.d. normal around a de-seasonalised mean (`normalCdf((projection − goal)/remainingStd)`), with `remainingStd = sigma·√daysRemaining` and a hard-coded `z90 = 1.2816`. None of this is surfaced to the viewer, and there is no guard for early-month volatility: `daysElapsed` comes from the latest data point (`pacing.ts:58`), so on day 2 the projection extrapolates 2 days × a weekday-weight ratio and the "chance" collapses toward a coin-flip presented as a hard percentage.
- **Why it matters**: This seasonality-aware forecast is the flagship analytical feature of the case study; a confident-but-fragile probability early in the month reads as false precision and undermines credibility with exactly the technical audience the portfolio targets.
- **Fix sketch**: In `pacing.ts` add a documented `minElapsedDaysForProbability` (e.g. 5) and a max relative-band check; when below it, return `goalProbability: null`/wide-band flag. In `GoalPacing.tsx:135-139` suppress or qualify the `chanceLabel` (e.g. „výhled se ustálí po několika dnech") and add a one-line comment stating the i.i.d.-normal assumption. Not gate-triggering (no LLM files touched).

## 2. Only the channel table is exportable — the headline narrative (KPIs, pacing, insights) cannot be shared
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/components/dashboard/DashboardClient.tsx:246-275
- **Problem/Opportunity**: `exportChannelsCsv` exports only the per-channel breakdown for the selected period. The most client-facing parts — the five headline KPIs with PoP deltas, the monthly goal pacing/forecast, the alerts impact (≈ Kč figure), and the auto-generated insights — have no export. The „Datový report" link (`:287`) just navigates to an article, not a deliverable. For an agency case-study app whose entire premise is client deliverables, the shareable summary IS the product.
- **Why it matters**: A client forwards a one-page summary to their boss, not a channel CSV; a "export this dashboard" action is the difference between a demo and a usable reporting tool, and directly showcases the app's value.
- **Fix sketch**: Add an "Export přehledu" action next to the period selector that builds a second CSV/section (KPI label, value, Δ, significance) plus pacing rows, reusing existing `toCsv`/`downloadText` (`@/lib/export`). Stretch: render the same data to a print stylesheet for PDF. No gate-triggering files. (An AI-written narrative variant via the existing assistant WOULD be gate-triggering — keep it separate.)

## 3. Cluster of undocumented magic numbers driving gauges, thresholds and caps
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/dashboard/DashboardClient.tsx:242, :521, :558 (+ GoalPacing.tsx:96, DeltaBadge.tsx:47)
- **Problem/Opportunity**: Several behaviour-shaping constants have no recorded reasoning: PNO-gauge axis headroom `*1.6` (`DashboardClient:242`); the "room to optimise bids" trigger `worstPno.pno > goalPno * 1.3` (`:558`); the revenue-insight floor `Math.abs(revenueDelta) > 0.005` (`:521`); the pacing-gauge headroom `*1.12` (`GoalPacing:96`); the DeltaBadge "no change" cutoff `< 0.0005` (`DeltaBadge:47`); plus the `slice(0,6)` alert and `slice(0,4)` insight caps (`:206`, `:569`). Why 1.3× and not 1.5×? Why 0.5 %? A reviewer can't tell intent from accident.
- **Why it matters**: These thresholds decide which warnings a client sees; undocumented they invite silent drift and make the analytics look arbitrary rather than deliberate.
- **Fix sketch**: Hoist them to named, commented constants (e.g. `PNO_GAUGE_HEADROOM = 1.6`, `WORST_PNO_FLAG_MULTIPLE = 1.3`, `MIN_REVENUE_DELTA_TO_REPORT = 0.005`, `MAX_INSIGHTS = 4`) at the top of each file with a one-line rationale. Pure refactor, no behaviour change, not gate-triggering.

## 4. Pacing card silently ignores the period selector — likely user confusion
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/components/dashboard/DashboardClient.tsx:201-202 (rendered GoalPacing.tsx:117-122)
- **Problem/Opportunity**: A code comment notes pacing is "independent of the period selector," but the UI gives no such cue. When a user switches the global period to 7d/30d/12m, every KPI card and the chart re-key and animate, yet the goal-pacing card stays fixed on the current calendar month. Its header only shows the month name + day progress (`GoalPacing.tsx:117-122`), not a "this month, regardless of period" scope label.
- **Why it matters**: Mixed scopes on one screen with no signposting is a classic trust/clarity bug — users assume everything reflects the chosen period and misread the forecast.
- **Fix sketch**: Add a small scope chip/label to the pacing header (cs: „Tento měsíc" / en: "This month") and/or visually group it apart from period-scoped widgets. Localised string only; not gate-triggering.

## 5. The forecast already knows goal-risk — turn it into proactive month-end alerting
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/components/dashboard/GoalPacing.tsx:135-139 (model: src/lib/metrics/pacing.ts:87-106)
- **Problem/Opportunity**: `monthlyPacing` already computes `goalProbability`, `onPace`, `pace` and a P10/P90 band, but they only render passively. The repo has cron jobs and an email lib. A genuine retention/differentiation feature: when the probability of hitting the monthly goal drops below a threshold (or pace falls behind plan) for a tenant, push a "goal at risk" notification — the proactive layer a passive GA dashboard lacks.
- **Why it matters**: Solves a real need (clients find out they missed the goal only at month-end); converts an existing, already-computed signal into engagement with low incremental modelling cost. Realistically scoped as an internal/portfolio capability, not paid SaaS.
- **Fix sketch**: Expose `monthlyPacing` via the existing snapshot path (`src/lib/metrics/snapshot.ts:63`) to a cron handler; when `goalProbability < threshold` and not already alerted this month, send via the email lib. Pure-forecast + email, no LLM — not gate-triggering. (If the alert body is AI-written, that becomes gate-triggering.)
