# Feature + Moonshot Scan — Trend Chart & Channel Breakdown

> Context: ctx_1781547850508_qfg6z6t
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Click-to-pin a date range on the trend chart, driving the channel table

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/components/dashboard/TrendChart.tsx:onMove` + `src/components/dashboard/DashboardClient.tsx:evaluatePeriod`
- **Scenario**: An analyst spots a revenue spike mid-window in the trend chart and wants to know "which channels drove *that* week?" Today the chart hover is read-only: the period selector only offers fixed 7/30/90/365-day windows (`PERIODS` in `metrics.ts`), and the `ChannelTable` always reflects the full selected period (`channels = channelRows(data.channels, c)` in `DashboardClient.tsx`). There is no way to scope the breakdown to a sub-range the user can see right in front of them.
- **Opportunity**: Add drag-to-select (brush) on the existing pointer-capture `<rect>` in `TrendChart`. On `pointerdown`→`pointermove`→`pointerup`, capture a start/end bucket index, shade the selection, and emit `onRangeSelect(fromDate, toDate)`. `DashboardClient` recomputes a `Totals` for the sliced `data.daily` and feeds `channelRows()` + the KPI footnotes for just that range, with a "× clear selection" chip restoring the full period. The previous-period overlay then re-baselines against the equal span immediately before the brushed range.
- **Impact**: Turns a passive chart into an investigative tool — the single most-requested move in any analytics dashboard. It reuses 100% of the existing pure analytics layer (`totalsOf`, `channelRows`) and the index→date mapping already present in `TrendChart`, so the data is guaranteed to reconcile.
- **Implementation sketch**: (1) In `TrendChart`, add `dragStart`/`dragEnd` state and a translucent `<rect>` between the gridlines and the series; reuse `x(i)` for the band edges. (2) Add a `onRangeSelect?: (from: string, to: string) => void` prop. (3) In `DashboardClient`, hold `selectedRange` state; when set, derive `scopedDaily = data.daily.filter(inRange)` and pass `totalsOf(scopedDaily)` + `channelRows(...)` to KPIs and `ChannelTable`. (4) Add the clear chip near the "Výkon podle kanálů" heading.

## 2. Period-over-period delta + sparkline columns inside the channel table

- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/components/dashboard/ChannelTable.tsx` + `src/lib/metrics.ts:channelRows`
- **Scenario**: The chart already tells a rich period-over-period story (faint overlay, `cmpDelta` in the tooltip, `fmtSignedPct`), but the channel table is a flat snapshot — it shows *where* revenue is now, never *which channel is moving*. `buildInsights()` in `DashboardClient` even computes "best ROAS / worst PNO" channels, proving the comparison data is reachable, yet the table itself carries no trend signal.
- **Opportunity**: Extend `channelRows()` to optionally accept the comparison `Totals` (already available as `result.previous` / `comparePoints`), producing a `revenueDelta` per channel. Render a `DeltaBadge` (the component already exists at `src/components/dashboard/DeltaBadge.tsx`) in the Obrat cell and an 8-point inline channel sparkline. Colour deltas via each metric's `goodDirection` from `METRICS`, exactly like the chart tooltip's `cmpImproving` logic.
- **Impact**: The table becomes scannable for momentum, not just magnitude — "Sklik revenue +18%, Meta −9%" jumps out without leaving the page. It closes the gap between the chart's narrative and the table's static reconciliation, and recycles `DeltaBadge`, `fmtSignedPct`, and the `goodDirection` metadata already in the codebase.
- **Implementation sketch**: (1) Add `compareTotals?: Totals` to `channelRows()` and return `revenueDelta`, `costDelta`, `pnoDelta` per row (guard `prev > 0`). (2) In `ChannelTable`, add a delta column header and a `<DeltaBadge value={r.revenueDelta} good={...} />`. (3) Pass `result.previous` from `DashboardClient`. (4) For the sparkline, bucketize each channel's projected daily series and reuse the `KpiCard` spark renderer.

## 3. Export / share the current view — PNG snapshot + CSV of the channel table

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: S (<1d)
- **File**: `src/components/dashboard/TrendChart.tsx` (SVG root) + `src/components/dashboard/ChannelTable.tsx`
- **Scenario**: This is a case-study app aimed at recruiters and clients who will want to *take the artefact with them* — drop a chart into a deck, paste the channel split into a report. The chart is already a self-contained, dependency-free `<svg>` and the table is plain semantic HTML, so the data is export-ready, but there is no affordance to get it out.
- **Opportunity**: Add a small "Exportovat" control to the trend-chart card header (next to the metric `Segmented`). "Stáhnout PNG" serialises the live `<svg>` (with the comparison overlay and legend) onto a canvas and triggers a download; "Kopírovat CSV" emits the channel rows (`Kanál, Náklady, Konverze, Obrat, PNO, ROAS`) plus the `Celkem` footer, formatted with the existing `fmt*` helpers so the export matches the screen exactly.
- **Impact**: Cheap, high-signal polish that demonstrates product-mindedness in a portfolio piece — and makes the dashboard genuinely useful as a takeaway. No new dependencies (the project is proudly "dependency-free" for the chart), just `XMLSerializer` + a canvas blob.
- **Implementation sketch**: (1) Give the `<svg>` in `TrendChart` a `ref`; add an `exportPng()` helper using `new XMLSerializer().serializeToString` → `Image` → `<canvas>` → `toBlob`. (2) Add a `buildCsv(rows, totals)` util in `metrics.ts` or a small `lib/export.ts`, reusing column order from `ChannelTable`. (3) Wire two buttons in the card header; CSV via `navigator.clipboard.writeText` with a toast.

## 4. AI "explain this trend" — narrate the chart + channel mix on demand

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/components/dashboard/DashboardClient.tsx:buildInsights` ↔ `src/components/ai/AiAssistant.tsx` (structured-output route)
- **Scenario**: `buildInsights()` already hand-codes four templated observations (revenue delta, PNO vs goal, best ROAS, worst PNO) — a brittle, rules-based precursor to real analysis. Meanwhile a sibling feature (`/ai-asistent`, "analýza výkonu klienta") already runs an LLM with **structured JSON output** (`responseSchema`, Gemini in prod / Claude Sonnet in dev, key stays server-side per the page copy). The two never meet: the dashboard's rich period-over-period numbers are never sent to the model, and the AI tool never sees the live chart context.
- **Opportunity**: Add an "Vysvětlit vývoj" button on the trend card that POSTs the *already-computed* structured payload — `{ metric, period, current, previous, delta, channels, pacing }` from `evaluatePeriod`/`channelRows`/`monthlyPacing` — to the existing structured-output route, asking for a JSON `{ headline, drivers[], risks[], nextSteps[] }`. Render the result inline where the templated insights now sit, with each "driver" deep-linking to the relevant channel row or chart point (reusing idea #1's range-pin). Because the input is server-derived and deterministic, the no-key fallback can return a canned-but-honest analysis, exactly like the AI page already does.
- **Impact**: This is the category-defining move for the whole case study — it fuses the analytics layer with the LLM layer into "a dashboard that explains itself," which is the actual product thesis (Systedo = marketing analytics + AI). It upgrades `buildInsights` from string templates to genuine reasoning while keeping the pure-numbers contract: the AI only narrates figures the math layer already reconciled, so it can't hallucinate totals.
- **Implementation sketch**: (1) Define a `chartContext` builder in `metrics.ts` that packages the `PeriodResult` + channels into a flat JSON. (2) Reuse the existing AI route handler (Node runtime, `responseSchema`) — add a `dashboard-explain` mode with its schema and a Czech system prompt embedding the domain rules (PNO goal, ROAS direction). (3) New `<TrendInsightsAI>` component swapping in for the static insights list, with a loading/skeleton state and the deterministic fallback. (4) Each driver references a `channel` or `date` so the UI can scroll/highlight.

## 5. Anomaly + goal-breach detection overlaid on the chart, becoming an alerting backbone

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: feature
- **Effort**: L (>3d)
- **File**: `src/lib/metrics.ts` (new `detectAnomalies` beside `weekdayWeights`) + `src/components/dashboard/TrendChart.tsx` markers
- **Scenario**: The chart faithfully *plots* history but does no judging — a 3× cost spike, a day PNO blew past `goals.pno` (0.15), or a channel ROAS collapse all render as just another point on the line. Yet the codebase already contains the exact machinery to detect such events: `weekdayWeights()` builds a seasonality baseline, `monthlyPacing()` projects expected revenue, and `goalPno`/`monthlyRevenue` goals are in the dataset. The intelligence exists; it just isn't pointed at the series to flag *the moments that matter*.
- **Opportunity**: Add a pure `detectAnomalies(daily, goals)` that flags buckets where a metric deviates beyond, say, 2.5× the weekday-adjusted rolling MAD, plus discrete "goal-breach" events (day/month PNO > goal, pace falling behind). `TrendChart` renders these as small pulsing markers on the line with a reason in the tooltip ("Náklady +210 % vs. očekávání pro úterý"). Below the chart, a compact "Upozornění" feed lists events with severity. The end state: this becomes the seed of a real **alerting platform** — the same `detectAnomalies` output feeds a digest the user can subscribe to, and (network effect) anomalies detected here can auto-spawn an investigation in the `/kampane` Google Ads console or a recommended action in the AI assistant.
- **Impact**: Moves the product from "rear-view reporting" to "tells you what changed before you ask" — the difference between a dashboard and a monitoring system, and the foundation for retention-driving notifications/digests. Working backward from "an analyst never misses a budget overrun," every primitive (seasonality, goals, the pure analytics layer, the AI narrator from #4) is already in place; the missing piece is the detector and the visual vocabulary.
- **Implementation sketch**: (1) Add `detectAnomalies(daily, goals): Anomaly[]` in `metrics.ts` using a trailing rolling median/MAD scaled by `weekdayWeights`, returning `{ date, metric, observed, expected, z, kind }`. (2) Pass anomalies into `TrendChart`; render markers at `x(i)/y(v)` reusing the hover-marker style, and extend the tooltip to show the reason for anomalous buckets. (3) Add an "Upozornění" card in the side rail (next to "Co stojí za pozornost"), sorted by severity. (4) Stub a `subscribeDigest()` boundary and a "Prozkoumat v kampaních" link to seed the cross-feature alerting story.

---

### Files read
- `src/components/dashboard/TrendChart.tsx`
- `src/components/dashboard/ChannelTable.tsx`
- `tests/dashboard-comparison.spec.ts`
- `src/components/dashboard/DashboardClient.tsx`
- `src/lib/metrics.ts`, `src/lib/types.ts`, `src/lib/format.ts`, `src/lib/data.ts`
- `src/app/dashboard/page.tsx`, plus headers of `src/app/ai-asistent/page.tsx` and `src/app/kampane/page.tsx`, and `src/data/performance.json` (channels/goals)
