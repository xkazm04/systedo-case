# Metrics & Analytics Engine

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 3 · code-refactor 2 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Profit delta silently reads 0 % whenever the previous period's profit was ≤ 0

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/metrics/totals.ts:42`
- **Scenario**: `rel(cur, prev) = prev > 0 ? (cur - prev) / prev : 0`. Every metric except `profit` is non-negative, so the `prev > 0` guard is correct for them. But `profit = revenue − cost` is **signed**. Take a scaling account whose previous 30-day window lost money (`p.profit = −40 000`) and whose current window turned it around (`c.profit = +120 000`). `series.ts:176` computes `profit: rel(c.profit, p.profit)` → `prev > 0` is false → returns **0** (`delta.profit = 0`, "no change"). Same for the channel table at `channels.ts:71` (`rel(row.profit, prev?.profit ?? 0)`). A collapse from `+40 000` to `−120 000` also reports `0`.
- **Root cause**: `rel`'s zero-denominator guard was written for non-negative additive metrics and assumes "≤ 0 baseline ⇒ no meaningful base", but `profit` (in `MetricKey`) is the one signed metric flowing through it. A negative denominator is treated identically to an absent one.
- **Impact**: The profit delta on the trend chart, the snapshot `delta.profit`, and every channel-row profit delta silently show "0 %" (flat) on exactly the swings that matter most — a loss turning profitable, or a profitable account collapsing into loss. Worse, `buildMetricsSnapshot` feeds this delta into the AI grounding, so the model will narrate "profit unchanged" when profit actually doubled or inverted.
- **Fix sketch**: give `profit` a signed-aware relative change: when `prev !== 0` use `(cur - prev) / Math.abs(prev)` (so a sign flip reads as a large positive/negative move); keep returning `0` only when `prev === 0`. Either branch `rel` on a `signed` flag or add a `relSigned()` used for `profit` in both `series.ts` and `channels.ts`.

## 2. Significance badge tests mean-of-daily-ratios but annotates the ratio-of-sums delta for ratio metrics

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/metrics/series.ts:110`
- **Scenario**: For a ratio metric (`pno`/`aov`/`cr`/`roas`/`ctr`/`cpc`), the displayed `delta` is computed from **totals** — e.g. `roas: rel(c.roas, p.roas)` (`series.ts:180`), where `c.roas = roas(sum.revenue, sum.cost)` is the ratio of the summed columns. But the `significance` for the same metric (`series.ts:193`) calls `significanceFor(current, previous, "roas")`, which averages the **per-day** `dailyValue(p,"roas") = roas(p.revenue,p.cost)` (`series.ts:88`) and runs the z-test on those daily ratios. Mean-of-daily-ratios ≠ ratio-of-sums (a Simpson-style divergence): a window with a few tiny-cost, huge-ROAS days pulls the daily mean far from the aggregate. So the badge can read "strong" next to a `+0.3 %` ROAS delta, or "noise" next to a `+45 %` delta.
- **Root cause**: The delta pipeline uses aggregate ratios (`totalsOf`), while the significance heuristic was built as a generic two-sample test over `dailyValue`, and no one reconciled that for ratio metrics the two operate on different statistics.
- **Impact**: The confidence badge (which the UI and AI grounding use to decide whether a change is "real") describes a different quantity than the number it sits beside — for every efficiency metric. Not a crash, but a systematically misleading trust signal on the exact KPIs (ROAS/PNO/CR) users act on.
- **Fix sketch**: make significance measure what the delta measures. For ratio metrics, either test the aggregate ratio via a bootstrap/delta-method over the daily numerator/denominator sums, or explicitly restrict `significanceFor` to additive metrics and render the badge only for those (the additive case is self-consistent because mean = total/n over equal-length windows).

## 3. `anomalyImpact.count` counts anomalies, not days — a day flagged on both revenue and cost is counted twice

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/metrics/anomalies.ts:129`
- **Scenario**: `detectAnomalies` can emit two separate `Anomaly` records for the same date (one `metric: "revenue"`, one `metric: "cost"`) — a Black-Friday-style day often spikes both. `anomalyImpact` then loops those records and does `count += 1` inside both the `revenue` branch (`anomalies.ts:134`) and the `cost` branch (`anomalies.ts:139`). A single calendar day carrying both a revenue and a cost anomaly increments `count` twice.
- **Root cause**: `count` is documented as "count of **days** carrying a monetary effect" (`anomalies.ts:110`), but it is implemented as a count of monetary **anomaly records**, which are per-(day,metric).
- **Impact**: The headline "N dní s dopadem" / day-count shown alongside "dopad ≈ −85 tis. Kč" overstates how many days were actually affected whenever revenue and cost anomalies coincide (which correlated events routinely cause). Cosmetic but it inflates a user-facing count.
- **Fix sketch**: count distinct dates — accumulate `a.date` for revenue/cost anomalies into a `Set<string>` and return `days.size` as `count`, instead of incrementing per record.

## 4. Dead code: `weekdayProfile` / `WeekdayProfilePoint` are exported but have zero consumers

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: dead-code
- **File**: `src/lib/metrics/seasonality.ts:79`
- **Scenario**: `weekdayProfile()` (`seasonality.ts:79-97`) and its `WeekdayProfilePoint` interface (`seasonality.ts:60-69`) are barrel-exported via `metrics/index.ts:11` (`export * from "./seasonality"`), but a repo-wide grep (`--include=*.ts,*.tsx,*.mjs,*.js`, excluding the definition and docs) returns **no call sites** — no component, no route, no test references either symbol. The JSDoc claims it is "exactly the shape ad-scheduling / bid-adjustment decisions need", but nothing consumes it. (Not in the 2026-07-09 report, which covered ratio/variance/de-seasonalize duplication only — this appears to be newly added code.)
- **Root cause**: A user-facing view of `weekdayWeightsFor` was built ahead of the UI that would render it; the UI never landed, leaving an unused public export.
- **Impact**: Dead surface area that ships in the bundle and misleads readers into thinking a weekday-profile feature exists. It also hides a latent correctness trap: because `weekdayWeightsFor` returns weight `1` (not `~0`) for a zero-average weekday (`seasonality.ts:51`, the `a > 0` fallback), a closed-weekend business would render as `index: 1` ("average") for its closed day — so wiring this up later would be shipping a wrong number.
- **Fix sketch**: delete `weekdayProfile` and `WeekdayProfilePoint` until a consumer exists; or, if the profile UI is imminent, add the consuming component in the same change and first fix the zero-average weight fallback so the index reflects a truly-below-average day.

## 5. Triplicated "days-in-month" + YYYY-MM month-grouping calendar logic

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/metrics/pacing.ts:88`
- **Scenario**: The idiom `new Date(Date.UTC(y, m /*1-based*/, 0)).getUTCDate()` for "days in a calendar month" is hand-written three times — `pacing.ts:88` (`monthlyPacing`), `pacing.ts:193` (`monthlyAttainmentHistory`'s complete-month filter), and `series.ts:236` (`bucketize`'s partial-month flag). The paired "group daily points by `p.date.slice(0,7)` into a `Map`" pattern is likewise written three times — `series.ts:227-233`, `pacing.ts:181-188`, and the `mtd` filter at `pacing.ts:92-94`. Each copy independently re-encodes the subtle 1-based-vs-0-based month convention. (Distinct from the 2026-07-09 report, whose duplication findings covered ratio formulas, weekday de-seasonalization, and mean/variance — not calendar-month math.)
- **Root cause**: No shared month/calendar helper module exists, so each analytics function that needs "how many days in this month" or "bucket by month" re-derives it, each time re-choosing the `Date.UTC(y, m, 0)` off-by-one convention.
- **Impact**: A future fix to the month-boundary convention (or a switch away from UTC-string slicing) must be remembered in three files; a miss silently corrupts either pacing's projection weighting, the complete-month track record, or the chart's partial-month flag.
- **Fix sketch**: add `daysInMonthUTC(year: number, month1Based: number): number` and `groupByMonth(points: DailyPoint[]): Map<string, DailyPoint[]>` (e.g. in `seasonality.ts` or a small `calendar.ts`) and point all three call sites of each at them.
