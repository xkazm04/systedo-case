# Metrics & Analytics Engine

> Context #40 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 1, Low: 1)
> Files read: 13

## 1. series.ts reimplements ratios.ts's six ratio formulas instead of importing them

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/metrics/series.ts:77-91`
- **Scenario**: `dailyValue()` hand-computes `pno`/`aov`/`cr`/`roas`/`ctr`/`cpc` per day with inline divide-guards that are formula-identical to `ratios.ts`'s named helpers (`src/lib/metrics/ratios.ts:11-29`) — e.g. `p.cost > 0 ? p.revenue / p.cost : 0` for `roas` is exactly `roas(p.revenue, p.cost)`. `series.ts` never imports `./ratios` at all.
- **Root cause**: `dailyValue` operates on a single `DailyPoint` rather than an accumulated `Totals`, so whoever wrote it (likely before or without revisiting the `ratios.ts` extraction) reached for inline arithmetic instead of calling the shared primitives with per-point fields.
- **Impact**: any future change to a ratio's definition (e.g. excluding a tax line from revenue, adding a floor) only needs to touch `ratios.ts` in theory, but the per-day values driving the trend chart and `significanceFor`'s two-sample test would silently keep the old formula — the exact "two implementations disagree" landmine `ratios.ts`'s own header comment (lines 1-5) says the module exists to prevent.
- **Fix sketch**: import `{ pno, aov, cr, roas, ctr, cpc }` from `./ratios` in `series.ts` and replace each `dailyValue` case body, e.g. `case "roas": return roas(p.revenue, p.cost);`. Behavior-preserving — the inline guards are arithmetically identical to the named ones.

## 2. Weekday de-seasonalization block copy-pasted between trends.ts and anomalies.ts

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/metrics/trends.ts:58-62`
- **Scenario**: `detectTrends` and `detectAnomalies` (`src/lib/metrics/anomalies.ts:51-54`) independently write the identical four lines to de-seasonalize a daily series by weekday weight:
  ```ts
  const weights = weekdayWeightsFor(daily, key);
  const adj = daily.map((p) => {
    const w = weights[dayOfWeek(p.date)] || 1;
    return p[key] / (w > 0 ? w : 1);
  });
  ```
- **Root cause**: `seasonality.ts` was extracted specifically "so pacing and anomalies depend on this rather than on each other" (`seasonality.ts:1-5`) and exports `weekdayWeightsFor`, but the *application* step — dividing each point by its weekday weight — was left as an inline copy in both callers instead of moving into `seasonality.ts` alongside the weights it consumes.
- **Impact**: this is the precise pattern `seasonality.ts`'s own doc comment was written to avoid. The copies are already drifting — only `anomalies.ts` carries a comment explaining the zero-guard — so a future change to the guard or the indexing has to be remembered in two files.
- **Fix sketch**: add `export function deseasonalize(daily: DailyPoint[], key: RawMetric, weights: number[]): number[]` to `seasonality.ts` containing the block above, then replace both call sites with `const adj = deseasonalize(daily, key, weights);`.

## 3. ratios.ts's canonical roas() is shadowed by an argument-order-reversed local roas() in campaigns/store.ts

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/metrics/ratios.ts:11`
- **Scenario**: `src/lib/campaigns/store.ts:602` defines its own `const roas = (cost: number, value: number) => (cost > 0 ? value / cost : 0)` and calls it as `roas(c.cost, valueOf(c))` (store.ts:618, 629, 639) — the same computation as `ratios.ts`'s `roas(value, cost) => safe(value, cost)`, but with the two parameters in the opposite order. `src/lib/campaigns/types.ts:6` sits in the same domain and correctly imports `roas` (plus `cpa, cpc, cr, ctr, pno`) from `@/lib/metrics/ratios`, so one campaigns file uses the shared source of truth and its sibling shadows it with a reversed-signature clone.
- **Root cause**: `store.ts`'s local helper predates `ratios.ts`, or was added without noticing `campaigns/types.ts` already imports the canonical version — nobody consolidated after `ratios.ts` was carved out as the shared primitive both the dashboard and campaigns domains were designed to use (per `ratios.ts:1-5`).
- **Impact**: both compute the same numbers today because each file's call sites match their own signature. The reversed argument order is the landmine: swapping `store.ts` to import `ratios.ts`'s `roas` without also swapping every call site's argument order would silently flip every ROAS on the campaigns growth-timeline to `cost/value`.
- **Fix sketch**: (fix lands in `campaigns/store.ts`, outside this context's file list, so flagged here because `ratios.ts` is the source of truth being bypassed) delete the local `roas` const and import `roas` from `@/lib/metrics/ratios`, swapping every call site to `roas(valueOf(c), c.cost)` (value first, cost second).

## 4. Four hand-rolled mean/variance blocks, silently split between sample and population variance

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/metrics/series.ts:93-102`
- **Scenario**: `series.ts`'s `meanVar()`, `trends.ts`'s noise-floor calc (`trends.ts:74-79`), `anomalies.ts`'s per-window baseline calc (`anomalies.ts:57-60`), and `seasonality.ts`'s `dailyRevenueSigma` (`seasonality.ts:14-18`) each independently reduce an array to `mean` then `Σ(x-mean)²`. `series.ts` and `trends.ts` divide by `(n-1)` (sample variance — `series.ts` explicitly comments this as a deliberate Bessel's correction), while `anomalies.ts` and `seasonality.ts` divide by `n` (population variance, uncommented).
- **Root cause**: each module solves its own local statistics problem (two-sample significance, weekly-trend noise floor, anomaly z-score, forecast sigma) without a shared primitive, so the same nine-line pattern was retyped four times with the bias-correction choice made ad hoc each time.
- **Impact**: no proven bug today — each usage is internally self-consistent — but the split is undocumented outside `series.ts`. A future "make these consistent" cleanup on `anomalies.ts` or `seasonality.ts` could silently change every anomaly z-score and pacing confidence band.
- **Fix sketch**: add one `variance(xs: number[], bessel = false)` helper (e.g. in `seasonality.ts`, which already hosts the shared day-of-week math) and point all four call sites at it, passing `bessel: true` for `series.ts`/`trends.ts` to preserve today's exact outputs.

## 5. channels.ts computes ratios via the raw safe() guard instead of the named pno/aov/cr/roas wrappers

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/metrics/channels.ts:40-43`
- **Scenario**: `channelRows()` writes `pno: safe(cost, revenue), aov: safe(revenue, conversions), cr: safe(conversions, visits), roas: safe(revenue, cost)` instead of calling `pno(cost, revenue)`, `aov(revenue, conversions)`, `cr(conversions, visits)`, `roas(revenue, cost)` — the exact named helpers `totals.ts` calls for the identical math one file over (`totals.ts:62-66`), from the same `./ratios` module `channels.ts` already imports `safe` from.
- **Root cause**: likely written without checking that `ratios.ts` exports named wrappers around `safe`, so the file reached for the lower-level primitive directly.
- **Impact**: purely a discoverability/consistency cost today, not a live bug — the named wrappers are literally `safe(...)` with a name (`ratios.ts:1-5`), so the values are identical either way. But it means grepping for callers of `pno(` misses this channel-row computation entirely.
- **Fix sketch**: in `channels.ts`, import `{ pno, aov, cr, roas }` alongside the existing `safe` import from `./ratios` and swap the four lines to the named calls with matching (non-reordered) arguments.
