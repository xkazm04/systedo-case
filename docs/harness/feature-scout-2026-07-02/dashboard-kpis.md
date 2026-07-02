# Feature Scout — Dashboard Workspace & KPIs (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/dashboard/page.tsx, src/components/dashboard/DashboardClient.tsx, src/components/dashboard/KpiCard.tsx, src/components/dashboard/GoalPacing.tsx, src/components/dashboard/DeltaBadge.tsx

## 1. Show the required daily run-rate to close the monthly goal gap
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/dashboard/GoalPacing.tsx:222`
- **Opportunity**: The pacing card says where the month will land (projection, P10–P90, pace vs. plan) but never answers the operator's actual question: "kolik denně musíme udělat, abychom cíl ještě splnili?" All inputs already exist in `MonthlyPacing` (`goal`, `mtd`, `daysRemaining`) — the derived stat is simply not computed or rendered.
- **Why valuable**: Turns a passive forecast into a daily operating target the client can act on today; it is the single most actionable number a pacing card can show and it costs one division. Deliberately NOT the deferred "editable goals / what-if slider" idea from the 2026-06-16 scan — no inputs, purely derived display.
- **Build sketch**: In `src/lib/metrics/pacing.ts` add `requiredDailyRunRate = daysRemaining > 0 ? max(0, goal − mtd) / daysRemaining : 0` and `recentDailyPace` (mean of the last 7 de-seasonalised days via the existing `weekdayWeights`) to `MonthlyPacing`; add a co-located `test-unit` case per convention. Render as a fourth `Stat` tile ("Potřebné tempo" / value `fmt.fmtCZK(requiredDailyRunRate)` / sub "vs. {recent}/den nyní", tone red when required > recent) hidden when `complete`. Extend both `T` maps in `GoalPacing.tsx`. pacing.ts is not gate-hashed.

## 2. Scope the alerts feed and its Kč impact to the selected period
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/dashboard/DashboardClient.tsx:205`
- **Opportunity**: `detectAnomalies` + `anomalyImpact` run over the whole 730-day series, so the "Upozornění" count pill, the top-6 feed and the "Odhadovaný dopad ≈ −X Kč" figure are all-time numbers sitting beside strictly period-scoped KPI cards, chart and channel table. On the 7d view the card can headline a spike from a year ago and a two-year damage sum, with no scope cue (the same mixed-scope confusion the pacing card just fixed with its "Tento měsíc" chip).
- **Why valuable**: Restores one-screen coherence — every widget answers about the same window — and makes the impact figure a truthful "what these alerts cost us in this period", which is the number a client would quote.
- **Build sketch**: Keep `detectAnomalies(data.daily, …)` on the full series (its trailing 28-day baseline needs the history), then filter to the current window before display: `const windowDates = new Set(result.points.map(p => p.date))`; feed `anomalies.filter(a => windowDates.has(a.date))` into the count pill, `topAnomalies` and `anomalyImpact`. The existing `topAnomalies.length > 0` guard already hides the card on quiet short windows; add the period label (already rendered for the channel table at `:363`) to the card header for the scope cue.

## 3. Add a month-by-month goal attainment track record to the pacing card
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/dashboard/GoalPacing.tsx:218`
- **Opportunity**: `monthlyPacing` only ever looks at the month of the latest data point, yet the series holds 24 full months of history against the same `goals.monthlyRevenue`. There is no track record — and since the demo dataset ends on 2026-05-31 the card currently renders its "měsíc uzavřen" state with nothing but a single closed month, wasting the flagship widget. Prior scans covered exporting/alerting the *current* forecast, never the history.
- **Why valuable**: "Did we hit goal the last 6 months?" is the first question a client asks after "will we hit it now"; a hit/miss strip turns the pacing card from a point-in-time gauge into a credibility-building performance narrative.
- **Build sketch**: New pure helper in `src/lib/metrics/pacing.ts` — `monthlyAttainmentHistory(daily, goal, n = 6)` grouping complete calendar months (reuse the `YYYY-MM` slice + days-in-month logic from `bucketize`'s month branch), returning `{ month, revenue, attainment, hit }[]` (note the single constant goal in a comment), plus a `test-unit` case. Render under the gauge as a compact row of 6 dots/mini-bars (hit = `bg-brand-500`, miss = `bg-coral-500`) with `title` tooltips via `fmt.fmtMonth` + `fmt.fmtPct(attainment, 0)`; strings into both `T` maps.

## 4. Surface the already-computed anomaly upside next to the damage headline
- **Impact**: 5/10
- **Effort**: 1/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/dashboard/DashboardClient.tsx:426`
- **Opportunity**: `anomalyImpact` (src/lib/metrics/anomalies.ts:107-110) deliberately computes `gained` — revenue windfalls + cost savings — with a doc comment saying it is "reported separately so it informs", but the UI renders only `impact.net`. Half-implemented by construction: the alerts card headline is one-sidedly alarmist even when flagged days also brought upside.
- **Why valuable**: A balanced "škoda −85 tis. Kč · pozitivní events +32 tis. Kč" reads as honest analytics rather than fear-mongering, and it ships a designed-but-dropped feature for one line of JSX.
- **Build sketch**: In the `impact` paragraph (`:426-439`) append a muted `(+{fmt.fmtCZKCompact(impact.gained)} pozitivní odchylky)` span when `impact.gained >= 1`, with its own `title` explaining windfalls/savings; add the two strings to both `T` maps. No lib changes — the field already exists on `AnomalyImpact`. Combines cleanly with idea 2 (same card) if waved together.

## 5. Localise the period selector — the last hardcoded Czech in a bilingual dashboard
- **Impact**: 5/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/dashboard/DashboardClient.tsx:287`
- **Opportunity**: The dashboard is fully bilingual via `useT`/`metricLabel(meta, locale)` — except `PERIODS` (`src/lib/metrics/series.ts:18-23`), whose `label` is Czech-only. In the EN locale the UI renders mixed-language strings: "Period: last 90 dní", segmented pills "7 dní / 12 měsíců", and the channel-table caption `period.label` (`:363`).
- **Why valuable**: The F4 locale toggle is a shipped feature; one untranslated control breaks the impression on every EN view of the app's most-visited page. Closes the gap with the metric-metadata pattern the codebase already established.
- **Build sketch**: Add `labelEn` to `PeriodDef` and the four `PERIODS` entries, plus a `periodLabel(p, locale)` helper mirroring `metricLabel` (`src/lib/metrics/meta.ts:32`). Use it at the three call sites in `DashboardClient.tsx` (`:287`, `:299`, `:363` — locale already in scope via `useLocale`). series.ts is pure and not gate-hashed; existing consumers of `label` are unaffected.
