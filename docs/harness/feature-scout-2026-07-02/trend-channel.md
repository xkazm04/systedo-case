# Feature Scout — Trend Chart & Channel Breakdown (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/components/dashboard/TrendChart.tsx, src/components/dashboard/ChannelTable.tsx, tests/dashboard-comparison.spec.ts

## 1. Draw the PNO goal as a reference line on the trend chart
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/dashboard/TrendChart.tsx:252`
- **Opportunity**: The dashboard's flagship question is "is PNO under the agreed goal?" — the gauge (DashboardClient.tsx:402-411) draws a goal marker and `detectAnomalies` even emits `goal-breach` events against `goals.pno`, yet when the user switches the trend chart to PNO there is no target line: the viewer cannot see *when* the series crossed the goal, only that individual breach diamonds exist.
- **Why valuable**: A horizontal target line is table-stakes in every analytics tool (GA4, Ads, Sklik all draw them); it instantly turns the PNO trend into a pass/fail story over time and makes the goal-breach anomaly markers legible ("the diamond is where the line crosses the dashes").
- **Build sketch**: Add an optional `goalValue?: number` prop to `TrendChart`; DashboardClient passes `trendMetric === "pno" ? goalPno : undefined` (goalPno already in scope at :199). Include `goalValue` in `domainValues` (TrendChart.tsx:120) so the line never clips, then render one dashed `<line>` at `y(goalValue)` next to the gridlines block (:252-272) with a small „Cíl {pct}" label — reuse the existing `goalMarker` string pattern from DashboardClient's T. Localize the label via the component's `T`/`useT` pattern. Extend `tests/dashboard-comparison.spec.ts` with a PNO-metric assertion.

## 2. Surface the dormant `partial` (and `truncated`) flags the metrics layer already computes
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/dashboard/TrendChart.tsx:409` (flag built at src/lib/metrics/series.ts:159-167)
- **Opportunity**: `Bucket.partial` exists explicitly "so the UI can avoid reading a half-month bar as a full-month collapse" (series.ts:140-145), and `PeriodResult.truncated` exists so the UI can warn when „12 měsíců" was silently shortened (series.ts:45-47) — but no component consumes either flag. On the 12m view the first/last month buckets are usually partial, so the line visibly sags at both ends and reads as a real collapse.
- **Why valuable**: This is a finished data-model feature with zero UI — the cheapest possible credibility win. A prospect scrutinizing the 12-month view currently sees a fake month-end crash; one tooltip note and a hollow end-marker remove the misread.
- **Build sketch**: In the tooltip header (TrendChart.tsx:408-410), when `tipBucket.partial` append a muted „ · neúplný měsíc" (add cs/en strings to the component `T`); render partial buckets' hover marker hollow (fill `var(--color-surface)`) like the compare dot at :356-366. Separately, in DashboardClient's period label (:285-289) show a small hint when `result.truncated` („zkráceno na {n} dní"). Pure prop reads, no metrics changes.

## 3. Click an alert in the feed to focus that point on the chart
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/dashboard/DashboardClient.tsx:441`
- **Opportunity**: The alerts feed (DashboardClient.tsx:440-465) and the chart's anomaly diamonds (TrendChart.tsx:305-327) describe the same events but are completely disconnected: an alert names a date + metric, and the user must manually switch the chart metric and hunt for the 8-px diamond to see context. The diamonds' only affordance is a native `<title>`.
- **Why valuable**: "See this alert in context" is the natural next click after reading „12. 5. — propad −38 %"; wiring the two existing features together makes the anomaly system feel like one product instead of two widgets, at zero new data cost.
- **Build sketch**: Make each alert `<li>` a button that calls `setTrendMetric(a.metric)` (goal-breach → "pno") and sets a new `focusDate` state; pass `focusDate?: string` into `TrendChart`, which resolves it to a bucket index (reuse the exact/YYYY-MM matching already written for anomalies at :99-102) and seeds the existing `hover` state so the crosshair + tooltip open pinned. Scroll the chart card into view (`scrollIntoView({behavior:"smooth"})`). Clear on pointer move. Add one e2e case to `tests/dashboard-comparison.spec.ts`.

## 4. Export the trend series as CSV, mirroring the channel-table export
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/dashboard/DashboardClient.tsx:249`
- **Opportunity**: The channel table has a one-click CSV deliverable (`exportChannelsCsv`, :249-278) but the chart's underlying time series — the data a client's analyst actually wants in Excel — has no export at all. `buckets` and `compareBuckets` (:213-215) already hold everything: date, all 8 metrics per bucket, plus the index-aligned previous period. (Distinct from the deferred "dashboard narrative export" follow-up, which covers KPI/pacing/insight prose — this is the raw series.)
- **Why valuable**: Agencies re-plot data in client decks and spreadsheets; today they'd have to transcribe the chart by hand. Same deliverable logic that justified the channel CSV, applied to the richer dataset.
- **Build sketch**: Add a second small CSV button beside the metric selector (or extend the existing one into both actions): build rows `[date, revenue, cost, visits, conversions, pno, roas, aov, cr, prev_<metric>…]` from `buckets` + `compareBuckets[i]`, reuse `toCsv`/`downloadText` from `@/lib/export` (semicolon + BOM for Czech Excel), filename `systedo-vyvoj-${period.key}.csv`. Follow the existing raw-integers/ratio-decimals convention (:259-267).

## 5. Make the chart keyboard-navigable with a pinnable tooltip
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/dashboard/TrendChart.tsx:372`
- **Opportunity**: The chart's entire readout (tooltip with value, PoP delta, anomaly reason, secondary metrics) is reachable only via pointer hover on the capture rect (:372-381); there is no keyboard access, and the tooltip vanishes on `pointerleave` so values can't be inspected or compared calmly. The `role="img"` aria-label is the only non-pointer surface.
- **Why valuable**: Keyboard/AT users currently get a static image; power users can't hold a reference point. Arrow-key stepping + click-to-pin is the expected interaction on serious analytics charts and a visible accessibility signal for a portfolio piece.
- **Build sketch**: Give the wrapper `tabIndex={0}` + `onKeyDown` (←/→ step `hover` by ±1, Home/End jump, Esc clears); add a `pinned` boolean toggled by click on the capture rect so `pointerleave` no longer clears when pinned. Announce the active bucket via a visually-hidden `aria-live="polite"` node reusing the existing formatted strings (`meta.format`, `fmt.fmtSignedPct(cmpDelta)`). Mind LANDMINE 2 (no `Date.now()`/ref reads in render — state only). Extend the hover e2e test with a keyboard case.
