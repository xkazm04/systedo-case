# Performance Dashboard & Reporting

> Context #11 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 17

## 1. CSV export re-implements the same metric-precision rule twice, independently

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/dashboard/vykon/ChannelsSection.tsx:76-84`
- **Scenario**: `ChannelsSection.exportChannelsCsv` hand-codes "pno → 4 decimals via `csvNum(r.pno, 4, locale)`, roas → 2 decimals via `csvNum(r.roas, 2, locale)`, everything else → `Math.round`". The exact same classification is re-implemented from scratch in `src/components/dashboard/vykon/TrendCard.tsx:96-100` (`cell()`): `pno|cr|ctr → 4 decimals`, `roas|cpc → 2 decimals`, else `Math.round`. Both are hand-typed metric-name lists rather than a shared rule.
- **Root cause**: There's no shared "how should this metric render as a CSV number" helper — `csvNum(n, digits, locale)` in `src/lib/export.ts` only takes an already-chosen digit count, so every call site re-derives which digit count belongs to which metric.
- **Impact**: If a new ratio metric is added to `ChannelRow` (e.g. a per-channel CTR/CPC column), a dev has to remember to update the precision rule in *both* files. Miss one and the CSV silently renders that metric as a rounded integer in one export but a decimal in the other — inconsistent exports for the same metric.
- **Fix sketch**: Add a small helper next to `csvNum` in `src/lib/export.ts` (or beside `RATIO_METRICS` in the metrics module), e.g. `csvCellForMetric(metric: MetricKey, value: number, locale): string | number`, encoding the `pno/cr/ctr → 4, roas/cpc → 2, else round` rule once. Replace `TrendCard.tsx`'s `cell()` body and `ChannelsSection.tsx`'s inline `r.pno > 0 ? csvNum(...) : ""` / `r.roas > 0 ? csvNum(...) : ""` lines with calls to it.

## 2. The "delta rounds to zero" threshold is a named constant in one file, a bare literal in another

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/dashboard/DeltaBadge.tsx:48-49`
- **Scenario**: `DeltaBadge` defines `const DELTA_NOISE_FLOOR = 0.0005;` with a comment explaining why ("below this rounds to 0,0 % at one decimal") and uses it to decide when to render "beze změny" instead of a signed percentage. `src/components/dashboard/TrendChart.tsx:625` makes the identical decision for the tooltip's period-over-period delta — `Math.abs(cmpDelta) >= 0.0005 ? <signed pct> : <"no change">` — but as an unexplained inline literal, not a reference to `DeltaBadge`'s constant.
- **Root cause**: The same UI rule ("when is a percentage change indistinguishable from zero at the display precision") was implemented twice instead of once, because the two components don't share a formatting utility for it.
- **Impact**: The two copies currently agree only by coincidence. A future tweak to `DELTA_NOISE_FLOOR` (e.g. if the KPI cards move to two-decimal display) silently desyncs the trend-chart tooltip from the KPI badges — the same data point could read "no change" in one place on the page and show a percentage in the other.
- **Fix sketch**: Export `DELTA_NOISE_FLOOR` from `DeltaBadge.tsx` (or move it to `src/lib/format.ts` alongside `fmtSignedPct`) and import it in `TrendChart.tsx` to replace the bare `0.0005` at line 625.

## 3. PNO alert-tone threshold and the PNO gauge's headroom share a magic number, synced only by a code comment

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/dashboard/ChannelTable.tsx:34-43`
- **Scenario**: `ChannelTable.tsx` defines `PNO_TONE_ALERT = 1.6` (the multiple of goal-PNO at which a row's PNO cell turns red) and documents it with `// The 1.6 alert band matches the dashboard PNO gauge's max`. The gauge it refers to is `src/components/dashboard/vykon/PnoGauge.tsx:27`'s `PNO_GAUGE_HEADROOM = 1.6`. The two constants are independent declarations that happen to hold the same value; nothing enforces they stay equal. The comment itself is also stale — it says "(DashboardClient gaugeMax)", but `gaugeMax` is computed inside `PnoGauge.tsx`, not `DashboardClient.tsx`.
- **Root cause**: A cross-file design constraint ("the alert-red threshold should track the gauge's axis ceiling") was documented in prose instead of being expressed as a shared constant.
- **Impact**: Low immediate risk (the values agree today), but the coupling is invisible to a `grep`-driven refactor of either file — changing `PNO_GAUGE_HEADROOM` in `PnoGauge.tsx` will not raise any signal that `ChannelTable.tsx`'s tone logic just went out of sync with the gauge it claims to match.
- **Fix sketch**: Export `PNO_GAUGE_HEADROOM` from `PnoGauge.tsx` (or hoist it to a small shared module, e.g. `src/lib/metrics.ts`) and import it into `ChannelTable.tsx` as `PNO_TONE_ALERT`'s value instead of redeclaring `1.6`. While there, fix the comment to point at `PnoGauge.tsx` instead of `DashboardClient.tsx`.

## 4. `weekdayName` is a pure formatting helper defined inside a component file and cross-imported by a sibling component

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/dashboard/WeekdayProfileCard.tsx:42-44`
- **Scenario**: `export function weekdayName(day, locale)` lives in `WeekdayProfileCard.tsx` next to the `DAY_NAMES`/`DAY_SHORT` tables it wraps. `src/components/dashboard/vykon/InsightsPanel.tsx:5` imports it — `import { weekdayName } from "@/components/dashboard/WeekdayProfileCard"` — purely for its weekday-insight sentence; it renders none of `WeekdayProfileCard`'s JSX.
- **Root cause**: The helper was added where its first (and originally only) caller lived, then a second, unrelated component started depending on that component module purely for a string helper.
- **Impact**: Minor but real coupling smell — `InsightsPanel.tsx` now has a build-time dependency on a whole chart component (and, transitively, everything `WeekdayProfileCard.tsx` imports) just to format a day name; a change to `WeekdayProfileCard`'s own imports could ripple into `InsightsPanel`'s bundle/graph for no functional reason. The codebase already has the right pattern for this exact situation next door — `src/components/dashboard/vykon/plural.ts` is a small, component-free locale-format module shared by `PeriodHeader.tsx` and `InsightsPanel.tsx`.
- **Fix sketch**: Move `weekdayName` (and `DAY_NAMES`, which only it uses) out of `WeekdayProfileCard.tsx` into a non-component module — either `dashboard/vykon/plural.ts` (already the shared locale-format home for this feature) or a new `dashboard/vykon/weekday.ts` — and have both `WeekdayProfileCard.tsx` and `InsightsPanel.tsx` import it from there.

## 5. The "value as % of a headroom-padded axis, clamped" formula is written out twice

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/dashboard/GoalPacing.tsx:131-133`
- **Scenario**: `GoalPacing.tsx` computes `gaugeMax = Math.max(goal, projection, mtd) * PACING_GAUGE_HEADROOM` then `pct = (v) => \`${Math.min(100, Math.max(0, (v / gaugeMax) * 100))}%\`` for its bar fill, forecast extension and two markers. `src/components/dashboard/vykon/PnoGauge.tsx:27,36,56,60` computes the same shape of value — `gaugeMax = Math.max(pno, goalPno) * PNO_GAUGE_HEADROOM`, then inlines `Math.min(100, (pno / gaugeMax) * 100)` and `(goalPno / gaugeMax) * 100` at each usage site instead of factoring out a `pct()` helper the way `GoalPacing.tsx` does. The two components are the dashboard's only two horizontal-bar gauges and both reinvent "headroom-padded axis → clamped percentage" from scratch.
- **Root cause**: No shared gauge-axis utility exists, so each new gauge (`PnoGauge`, then `GoalPacing`) wrote its own version — and picked up a small inconsistency doing it: `GoalPacing`'s `pct()` clamps the low end (`Math.max(0, …)`), `PnoGauge`'s inline version does not.
- **Impact**: No active bug (both PNO and goal values are non-negative in practice), but it's a repeated ~2-line formula that a third gauge would copy a third time, and the unclamped low end in `PnoGauge.tsx` is a latent edge case (a hypothetical negative PNO/goal would render a bar starting off the left edge of the track) that the `GoalPacing.tsx` copy already guards against.
- **Fix sketch**: Extract a small `pctOfAxis(value: number, max: number): string` (clamped 0–100, `%`-suffixed) helper — e.g. in `src/lib/format.ts` or a new `dashboard/gauge.ts` — and have both `PnoGauge.tsx` and `GoalPacing.tsx` call it instead of each computing the clamp inline.
