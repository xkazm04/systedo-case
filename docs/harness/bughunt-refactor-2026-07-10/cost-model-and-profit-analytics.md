# Cost Model & Profit Analytics

> Total: 5
> Critical: 0 · High: 2 · Medium: 1 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

_Note: prior code_refactor findings #1, #2, #3(partial), #5 were fixed since 2026-07-09 (`computeMarginRow` extracted, `contributionProfitable` added, doc corrected). Those are not restated. The `netProfitAfterCosts` extraction (prior #3) and blob-store factory (prior #4) remain undone but are excluded as already-reported._

## 1. Client report pairs TRUE net profit with the pre-COGS contribution delta — wrong change %

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/cost-model/compute.ts:23`
- **Scenario**: `PeriodProfit` (the return shape of `periodProfit`) exposes `netProfit`, `profitMargin`, `poas` but **no period-over-period delta**. The one consumer that renders a change badge, `src/app/app/[projectId]/mesicni-report/page.tsx:86-96`, therefore keeps `profitDelta = s.delta.profit` even inside the `if (costModel)` branch — where `profit` is now `pp.netProfit` (after COGS + fixed overhead + fulfilment). `s.delta.profit` is the delta of the **pre-COGS contribution** (revenue − ad cost). The two live on completely different bases: with margin ≈ 0.4 and a large fixed monthly overhead, net profit is a small residual, so an absolute swing that is +8 % on contribution is (say) +35 % on net profit. The report shows a net-profit koruna figure next to a percentage that describes a different metric. Concrete: prev contribution 500k → net 20k; cur contribution 550k (+10 %) → net 70k (+250 %); the client report prints "profit 70k, +10 %".
- **Root cause**: `periodProfit` was designed as a single-period calculator; the "true net profit" feature was bolted onto a snapshot pipeline whose only available delta is the contribution delta, and no net-profit delta was ever computed. The inline comment ("≈ delta of gross contribution, a good proxy") assumes the two deltas are close — they are not once overhead shrinks the denominator.
- **Impact**: Wrong, client-facing profit-change % in the white-label monthly report — the exact number a client scrutinises. Undermines trust in the "true profit" headline the whole cost model exists to sell.
- **Fix sketch**: Have `periodProfit` also accept the previous period's `{revenue, adCost, conversions, months}` (or expose a `prevNetProfit`) and return `netProfitDelta = (netProfit - prevNetProfit) / Math.abs(prevNetProfit)` guarded for a zero baseline; set `profitDelta = pp.netProfitDelta` in the `costModel` branch instead of reusing `s.delta.profit`.

## 2. Year-view profit trend's trailing partial calendar month makes trendDelta/sparkline show a fake collapse

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/profit/trend.ts:111`
- **Scenario**: For the 365-day period the granularity is `"month"` (`zisk/page.tsx:20`), so `profitTrend` buckets by `date.slice(0,7)` (`trend.ts:16`). A 365-day window ends on the anchor date **mid-month**, so the newest bucket is a *partial* calendar month (e.g. days 1–10) with ~1/3 the revenue/cost of the prior full month. `trendDelta(points, "netProfit")` and `trendDelta(points, "poas")` (`trend.ts:111-119`) compare the raw totals of the **last two buckets** — full month vs. partial month — with no length normalisation. Result: `netDelta`/`poasDelta` (rendered as change badges in `ProfitModule.tsx:478-479`) report a spurious ~-60 % net-profit and POAS crash on the 1st–10th of every month, and the sparkline's last point plunges. Unlike the weekly buckets (fixed 7-day windows counted back from the anchor, so the newest two are always full weeks), the calendar-month bucketing has no such protection. Also fires on the public `/dashboard` demo (`DemoModule.tsx:416`).
- **Root cause**: Weekly buckets are anchored fixed-width windows (partial bucket only at the *oldest* end, never compared), but monthly buckets fall back to raw `YYYY-MM` calendar keys, which put the partial bucket at the *newest* end — exactly where `trendDelta` looks.
- **Impact**: Recurring, user-visible false "profit down 60 %" alarm on the year view of an authenticated finance module and the public demo, for ~1/3 of every month.
- **Fix sketch**: Either drop the trailing partial-month bucket before `trendDelta` (compare only completed months), or normalise each monthly bucket to a per-day (or annualised) rate before delta/plot, or count months back from the anchor as fixed windows the way weeks are, so the newest two buckets are always comparable spans.

## 3. reallocateBudget "hold-revenue" strategy still drains channels, so projected revenue can fall below current

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/profit/compute.ts:118`
- **Scenario**: `reallocateBudget` documents `hold-revenue` as "protect total revenue — only drain a channel into a more profitable one when revenue does not fall." But the funding guard at line 118 is strategy-independent: `if (marginalProfit <= 0 || cap <= 0 || remaining <= 0) { set 0 }`. `marginalProfit = roas × marginPct − 1`, so a channel with strong ROAS but thin margin (e.g. roas 4, margin 0.15 → 0.6−1 = −0.4) is drained to 0 spend **even under `hold-revenue`**, discarding all of its (real, wanted) revenue. Since `projectedRevenue = Σ suggestedSpend × roas`, the plan's `projectedRevenue` then drops below `currentRevenue` while the UI badge says the strategy holds revenue — a direct contradiction between the mode label and the numbers.
- **Root cause**: The strategy only changes the *sort order* (`trend`… line 106-110: ROAS-desc vs marginalProfit-desc); the drain rule was never made strategy-aware, so `hold-revenue` shares `max-profit`'s "never fund a margin-loss channel" rule that necessarily sheds revenue.
- **Impact**: The "hold revenue" simulator can recommend a plan that shrinks revenue, misleading a user who explicitly chose the revenue-protecting mode.
- **Fix sketch**: In `hold-revenue`, replace the `marginalProfit <= 0` drain with "keep each currently-revenue-bearing channel funded at ≥ its current spend (floor `suggestedSpend` at `row.cost`), only reallocating *headroom* above current spend to higher-marginal-profit channels", or assert `projectedRevenue >= currentRevenue` and fall back if violated.

## 4. Two different period→months derivations: overhead in the Zisk panel (365/30≈12.17) disagrees with the report (12)

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/cost-model/compute.ts:11`
- **Scenario**: `PERIOD_MONTHS` (the canonical period→months map, in scope) maps the year to `12`, and the monthly report scales overhead with `PERIOD_MONTHS[p]` (`mesicni-report/page.tsx:89`). But the interactive Zisk overhead panel derives months inline as `Number(period) / 30` (`ProfitModule.tsx:489`), which for the 365-day key yields `12.166…`. `applyOverhead` then scales `monthlyOverhead × 12.17` (`overhead.ts:28`) while the report uses `× 12`. The same saved cost model therefore produces ~1.4 % more overhead — and a lower contribution profit — in the Zisk panel than in the report it claims to be "one profit source of truth" with (`zisk/page.tsx:36-37`). The `(rowsByPeriod[period]?.length ?? 0) > 0` guard in that expression is also misleading: `.length` is the channel count (always > 0), not a day count.
- **Root cause**: `PERIOD_MONTHS` (keyed by `AnalysisPeriod` "30d"/"90d"/"12m") was not reused by the Zisk panel, which keys periods by day-count strings ("30"/"90"/"365") and reinvented the conversion with a naive `/30`.
- **Impact**: Small but real: the annual overhead-adjusted profit shown in the live panel never exactly matches the report generated from the same model, quietly eroding the "single source of truth" guarantee.
- **Fix sketch**: Export a `monthsForDays(days)` (or a "365"→12 map) alongside `PERIOD_MONTHS` and have `ProfitModule` call it instead of `Number(period)/30`, so both engines round the year to the same whole-month figure.

## 5. Margin-lookup Map (`marginByChannel` + FALLBACK_MARGIN) rebuilt identically in three profit functions

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/profit/compute.ts:44`
- **Scenario**: `const marginByChannel = new Map(margins.map((m) => [m.channel, m.marginPct]))` followed by a `.get(channel) ?? FALLBACK_MARGIN` lookup is copy-pasted verbatim in `computeProfit` (`compute.ts:44,47`), `applyOverhead` (`overhead.ts:23,32`) and `retargetTrend` (`trend.ts:86,93`). This is distinct from the prior 2026-07-09 report's finding #2 (which factored out the per-row *arithmetic* into `computeMarginRow` and called out the *summary reduction*, but never the channel→margin lookup seam) — verified against that report in full. Three call sites means three places to keep the fallback semantics aligned.
- **Root cause**: `computeMarginRow` centralised the formula but each caller still resolves `marginPct` per channel on its own.
- **Impact**: Minor; a change to fallback behaviour (e.g. per-channel-type defaults) must be edited in three spots. Low risk, low value — included only because it is genuinely new vs the prior scan.
- **Fix sketch**: Add `resolveMargins(rows, margins): (channel: string) => number` (or a `marginLookup(margins)` returning the closure) in `profit/sample.ts` next to `FALLBACK_MARGIN`/`defaultMargins`, and have the three functions call it instead of rebuilding the Map inline.
