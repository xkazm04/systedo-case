# Trend Chart & Channel Breakdown — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Channel & footer deltas ignore statistical significance, so noise reads as a trend
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: src/components/dashboard/ChannelTable.tsx (DeltaBadge calls), src/lib/metrics.ts (`channelRowsCompared`)
- **Opportunity**: `DeltaBadge` already accepts a `significance` prop that mutes "noise"-level changes, and the KPI cards pass `result.significance[m]`. But `ChannelTable` renders both the per-row `DeltaBadge delta={r.delta.revenue}` and the `Celkem` footer `revenueDelta` with no `significance`, and `channelRowsCompared` never computes one. A +18 % channel swing driven by one noisy day looks identical to a real, sustained gain.
- **Value**: The whole product's credibility pitch is "we tell you what's real, not what's noise" — that is literally why `significanceFor` (Welch two-sample) exists. Showing unqualified channel deltas undercuts the differentiator on the most action-driving table in the app and can prompt the wrong budget move.
- **Effort**: M
- **Fix sketch**: Add a `significance: Record<MetricKey, Significance>` to `ChannelRow` in `channelRowsCompared` by calling `significanceFor` on per-channel daily series (project channel shares onto daily points), then pass `significance={r.significance.revenue}` to the row badge and the footer's existing `result.significance.revenue` from `DashboardClient`.

## 2. The channel table computes deltas for all 8 metrics but shows only revenue change
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/components/dashboard/ChannelTable.tsx, src/lib/metrics.ts (`channelRowsCompared`)
- **Opportunity**: `channelRowsCompared` already populates `delta.{cost,conversions,revenue,pno,aov,cr,roas}` per channel, but `ChannelTable` discards all of it except `r.delta.revenue` in the "Změna obratu" column. There is no way to see which channel's PNO or cost is moving, and no column sorting — the rows are pre-sorted by revenue only.
- **Value**: "Which channel got more expensive / less efficient?" is the core diagnostic question an agency client asks. Exposing per-column deltas (or a small delta under each cell, like the trend tooltip's period-over-period pattern) turns a static snapshot into a movement view at near-zero compute cost since the data is already there.
- **Effort**: M
- **Fix sketch**: Add inline `DeltaBadge` (size `xs`) under the Náklady / PNO / ROAS cells driven by `r.delta.cost|pno|roas`, and make the `<th>`s clickable to re-sort `rows` by the chosen metric or its delta; reuse the existing `pnoTone`/`DeltaBadge` machinery so styling stays consistent.

## 3. No export or shareable snapshot of the trend + channel breakdown
- **Severity**: High
- **Lens**: Both
- **Category**: monetization
- **File**: src/components/dashboard/DashboardClient.tsx, src/components/dashboard/ChannelTable.tsx, src/components/dashboard/TrendChart.tsx
- **Opportunity**: A grep across `src/` finds no CSV/PNG/clipboard export anywhere in the dashboard. Yet `buildMetricsSnapshot` already assembles a clean, serialisable `MetricsSnapshot` (totals, deltas, significance, buckets, channels, anomalies) explicitly designed so "any future export reconciles by construction." Nothing consumes it for download.
- **Value**: Agencies live in client decks and monthly reports. "Export channel table to CSV" and "Download chart as PNG" are the #1 stickiness/upsell hooks for an analytics tool — they get the brand in front of the client's stakeholders and are an obvious paid-tier gate. The data contract is already built; only the UI is missing.
- **Effort**: M
- **Fix sketch**: Add a small export menu near the "Výkon podle kanálů" header: CSV from `channels`/`totals` via a `toCsv` helper (Blob + `URL.createObjectURL`), and PNG by serialising the `TrendChart` `<svg>` (`XMLSerializer` → canvas → `toBlob`). Build the CSV row set from the same `ChannelRow[]` the table renders so it reconciles.

## 4. Derived ratio metrics (ROAS, CR, AOV) are excluded from the trend chart despite per-day support
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/lib/metrics.ts (`TREND_METRICS`, `MetricMeta.plottable`, `dailyValue`), src/components/dashboard/TrendChart.tsx
- **Opportunity**: `TREND_METRICS` offers only `revenue/cost/visits/conversions/pno`; `roas`, `cr`, `aov` are flagged `plottable:false`. But `dailyValue` already computes a correct per-day value for every one of them, and `Bucket extends Totals` so each bucket already carries `roas/cr/aov`. The chart can plot them today; the gate is just metadata.
- **Value**: ROAS and CR trends over time are exactly what a performance marketer watches to judge account health — arguably more than raw cost. Withholding them makes the showcase feel shallow versus Google Ads / GA4. The previous-period overlay and tooltip already work for any metric.
- **Effort**: S
- **Fix sketch**: Add `roas` (and optionally `cr`) to `TREND_METRICS`, flip their `plottable` flag, and add color entries (already present in `COLORS`). The y-domain logic in `TrendChart` (`yMin`/`yMax` with the `pno` ratio branch) should be generalised to treat any ratio metric like `pno` rather than starting the axis at 0.

## 5. Channel rows can't be isolated or overlaid on the trend chart
- **Severity**: Medium
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/components/dashboard/ChannelTable.tsx, src/components/dashboard/TrendChart.tsx, src/lib/metrics.ts (`channelRows`)
- **Opportunity**: The trend chart only ever plots blended account totals (`buckets`), and the channel table is a separate, static breakdown. There is no interaction between them — clicking "Sklik" or "Google Ads" does nothing. Per-channel daily series are reconstructable by projecting `ChannelShare.shares` onto `result.points` (the same projection `channelRows` already does on totals).
- **Value**: "Show me just this channel's revenue trend" is a natural, expected drill-down that connects the two halves of the dashboard into one analytical surface and makes the channel mix feel alive rather than a footnote. It is the kind of power-user feature that signals depth in a case-study/portfolio piece.
- **Effort**: L
- **Fix sketch**: Add a `bucketizeChannel(points, shares, granularity)` helper that scales daily raw metrics by a channel's shares before `bucketize`, lift a `selectedChannel` state into `DashboardClient`, make `ChannelTable` rows toggle it, and pass the channel's buckets to `TrendChart` (reuse the existing `compare` overlay slot or a second line) so the selected channel overlays the account total.
