# WP W1-F — Response-curve reallocation: marginal POAS replaces constant-ROAS budget math
card #19 · L · gate: contract (pure math; the Zisk what-if and pacing numbers change when a curve fits) · wave 1

## Goal
`reallocateBudget` allocates by MARGINAL profit along a fitted diminishing-returns response curve per
channel (revenue = a·spend^b, b∈(0,1]) instead of assuming constant ROAS with a 3× cap, and the pacing
"implied extra daily spend" uses the account curve's marginal ROAS at today's spend rather than the
trailing average. Acceptance: with no curve supplied (or an unfit one) every existing output is
byte-identical (`test-unit/profit.test.mjs`, `metrics-pacing-runrate.test.mjs` unmodified and green);
with a fitted curve, a saturating channel receives LESS than the linear plan would give it (pinned), and
the panel discloses per channel whether the curve was fitted or fell back to linear.

## Non-goals
- No edit to `src/lib/campaigns/simulate.ts` / `budget-moves.ts` / control plane (W2-E plugs the curve into
  `simulateBudgetShift` next wave — you only expose a pure function it can call).
- No per-CAMPAIGN curves this wave: the profit engine is per-CHANNEL (`ProfitRow`, `profit/types.ts:12-30`) and
  its reachable history is `PerformanceData.daily` + `channelDaily` (account level, per-platform share). Say so
  honestly in the UI (`basis: "channel" | "account-scaled"`).
- No new store, no migration, no LLM, no route changes.

## Seams
- `src/lib/profit/compute.ts:81-197` `reallocateBudget(rows, opts)`; linear marginal at `:100`, cap `:91,:101`,
  projection `:158`. `ReallocOptions` `profit/types.ts:181-189`, `ReallocChannel` `:192-207`, `ReallocPlan` `:209-224`.
- Sole caller `src/components/app/modules/profit/useProfitState.ts:249-252`; rows from `computeProfit` `:204`.
- `src/lib/metrics/pacing.ts:147-152` (`recentRoas` → `impliedExtraDailySpend`), `monthlyPacing` `:89-95`,
  callers `metrics/snapshot.ts:134`, `dashboard/DashboardClient.tsx:89`.
- History: `PerformanceData.daily: DailyPoint[]` (date, visits, cost, conversions, revenue) and `channelDaily`
  (per-day per-platform share; `src/data/performance.json:119`, `report-metrics/blend.ts:213-222`); the Zisk page
  builds channel rows at `src/app/app/[projectId]/zisk/page.tsx:58-63` from `data.channels` + `totalsOf(daily)`.
- Existing math helpers: `src/lib/metrics/config.ts` (`WINDOWS`), `seasonality.ts` (`dailyRevenueSigma`),
  `ratios.ts` (`safe`). No regression helper exists — `funnel.ts:56-66` uses `Math.log` for decomposition only.
- UI: `src/components/app/modules/ProfitReallocationPanel.tsx` (224 LOC — you must EXTRACT to stay ≤200 net):
  strings `:16,:38` (`whatIfDesc`), `:32,:54` (`reallocationFooter` "strop 3×"), `:30,:52` (`colProfitPerUnit`
  → the marginal POAS column). `ProfitModule.tsx:135-143` mount. `dashboard/GoalPacing.tsx` (365 LOC) renders
  `impliedExtraDailySpend` — add ONE footnote line ("podle křivky odezvy" / "podle průměrného ROAS"), nothing else.
- Fixtures: `test-unit/profit.test.mjs:7,42,91` helpers; sample dataset `src/lib/project-data/dataset.ts`
  (`getProjectDataset`, deterministic) for a curve-fit fixture; `src/data/performance.json` daily series.

## Data contract
```ts
// src/lib/metrics/response-curve.ts — pure, framework-free
export interface ResponseCurve {
  a: number; b: number;                 // revenue(spend) = a * spend^b ; b in [0.2, 1]
  fitted: boolean;                      // false → linear fallback (b = 1, a = roas), never used to reallocate
  n: number; r2: number;                // observations used, fit quality (log-log)
  spendMin: number; spendMax: number;   // observed range — extrapolation beyond 1.5× spendMax is clamped
  basis: "channel" | "account-scaled";
}
export const CURVE_MIN_POINTS = 14;    // daily points with spend > 0
export const CURVE_MIN_R2 = 0.3;
export const CURVE_B_RANGE: readonly [number, number] = [0.2, 1];
export function fitResponseCurve(points: Array<{ spend: number; revenue: number }>, basis: ResponseCurve["basis"]): ResponseCurve;
export function revenueAt(c: ResponseCurve, spend: number): number;
export function marginalRoas(c: ResponseCurve, spend: number): number;          // a·b·spend^(b−1), clamped range
export function marginalPoas(c: ResponseCurve, spend: number, marginPct: number): number; // marginalRoas·margin − 1
export function channelCurves(daily: DailyPoint[], channels: ChannelShare[], channelDaily?: ChannelDailyShare[]): Record<string, ResponseCurve>;
//  with channelDaily: per-channel daily spend/revenue = day × that channel's share → basis "channel";
//  without: account curve scaled by static share → basis "account-scaled".

// src/lib/profit/types.ts (additive)
export interface ReallocOptions { …existing…; curves?: Record<string, ResponseCurve> }
export interface ReallocChannel { …existing…; marginalPoasAtSuggested?: number; curve?: Pick<ResponseCurve,"fitted"|"b"|"r2"|"basis"> }
```
Algorithm (when `curves[channel].fitted`): greedy hill-climb in `STEP = max(1, totalBudget/400)` increments —
each step goes to the channel with the highest `marginalPoas(curve, current, margin)` while > 0, spend clamped
to `[0, max(cap, 1.5 × spendMax)]`; `projectedRevenue = revenueAt(curve, suggested)`. Channels without a fitted
curve keep today's linear term and cap exactly (mixing is allowed; the panel labels each). `maxSpendMultiple`
still applies to linear channels. With `curves` absent or all `fitted:false` the code path is the EXISTING loop
(do not "unify" the two — byte-identity is the acceptance).
Pacing: `monthlyPacing(daily, goal, revenueWeights?, curve?: ResponseCurve)` — when `curve?.fitted`,
`impliedExtraDailySpend = extra spend s.t. revenueAt(cur+s) − revenueAt(cur) ≥ required − recent` (solve by
bisection, ≤ 3× current daily spend), else the existing formula; expose `impliedBasis: "curve" | "average"` on
`MonthlyPacing` (additive optional).

## Invariants
- Pure math, no I/O; deterministic; NaN/∞-safe (`safe()`); a channel with all-zero spend → `fitted:false`.
- Byte-identity pins: `profit.test.mjs`, `metrics-pacing-runrate.test.mjs`, `metrics-time-edges.test.mjs`,
  `metrics-attainment-history.test.mjs` unmodified and green; `campaigns-*` untouched.
- Honest labels: the panel never says "křivka" for an `account-scaled` basis without the qualifier.

## UI
- `ProfitReallocationPanel.tsx`: extract the table into `profit/ReallocationTable.tsx`; column `colProfitPerUnit`
  shows `marginalPoasAtSuggested` when present (else today's value); per-row `Pill` "křivka · b=0.62" /
  "lineárně" with `title` explaining; footer string becomes basis-aware (two variants); `whatIfDesc` rewritten
  (cs/en) to "marginal profit along the response curve where data allows". `useProfitState.ts` computes
  `channelCurves` (memoised) and passes `curves`; `zisk/page.tsx` passes `channelDaily` through
  (it already has `data`). `GoalPacing.tsx` footnote line; `DashboardClient.tsx:89` passes the account curve.

## Build steps
1. `response-curve.ts` + `test-unit/metrics-response-curve.test.mjs` (≥14: exact fit on synthetic a·s^b data,
   b clamp, <14 points → unfit, r² gate, monotone revenueAt, marginal decreasing for b<1, account-scaled basis,
   NaN safety).
2. `reallocateBudget` curve branch + `test-unit/profit-response-curve.test.mjs` (≥8: saturating channel gets less
   than linear; budget conservation; no negative; mixed fitted/linear; `curves:{}` byte-identical to no-curves via
   `deepStrictEqual` against the existing call).
3. Pacing extension + `test-unit/metrics-pacing-curve.test.mjs` (≥4).
4. UI + hook threading; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/metrics/response-curve.ts src/lib/metrics/pacing.ts src/lib/profit src/components/app/modules/ProfitReallocationPanel.tsx src/components/app/modules/profit src/components/dashboard/GoalPacing.tsx src/components/dashboard/DashboardClient.tsx "src/app/app/[projectId]/zisk"` ·
`npm run test:unit` (`profit*`, `metrics-*` green).

## Acceptance
- ≥26 new assertions; `profit.test.mjs` + `metrics-pacing-runrate.test.mjs` `git diff --stat` = 0 lines.
- `ProfitReallocationPanel.tsx` ≤ 200 LOC after extraction.

## Hotspot requests
- None. `context-map.json` new files (Director). Doc-sync: if `docs/` describes the Zisk what-if as
  "holds ROAS constant" (grep `ROAS konstant|holds ROAS`), update that sentence — you may edit docs.

## Rollback
Revert; nothing persisted.
