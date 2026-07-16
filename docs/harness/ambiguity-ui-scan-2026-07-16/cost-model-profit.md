# Cost Model & Profit Analytics — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 4 medium / 0 low)

## 1. "hold-revenue" reallocation strategy does not hold revenue
- **Severity**: High
- **Lens**: ambiguity
- **Category**: contract-behavior-mismatch
- **File**: src/lib/profit/compute.ts:104-127 (and src/lib/profit/types.ts:171-175)
- **Scenario**: A user picks the "hold-revenue" strategy in the budget-reallocation simulator expecting total revenue to be protected, as the `ReallocStrategy` doc promises: "protect total revenue — only drain a channel into a more profitable one when revenue (held via ROAS) does not fall."
- **Root cause**: The implementation only changes the sort key (ROAS-first instead of marginal-profit-first). The `marginalProfit <= 0` guard still zeroes every loss-making channel's spend in BOTH strategies, and greedy filling up to `cap` ignores whether projected total revenue drops. There is no revenue-floor constraint anywhere, and the plan carries no flag when `projectedRevenue < currentRevenue`. The inline comment even argues away the drop ("that revenue was unprofitable") — directly contradicting the type's contract.
- **Impact**: The two strategies produce near-identical plans whenever loss-makers exist; a user who explicitly asked to preserve revenue is shown a plan that can drain 20-30 % of revenue with no warning. This is presented as decision-support for real budget moves.
- **Fix sketch**: Either implement the constraint (fund loss-makers at the minimum spend needed to hold `projectedRevenue >= currentRevenue`, i.e. keep draining only while a higher-ROAS channel with cap headroom can replace the revenue), or honestly re-document the strategy as "prefer high-ROAS channels" and add a `revenueDelta`/warning field to `ReallocPlan` the UI must surface when revenue falls.

## 2. Infinity leaks out of break-even math into serialization and display
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: infinity-propagation
- **File**: src/lib/cost-model/compute.ts:86-88 (and src/lib/profit/core.ts:66-90)
- **Scenario**: `deriveBreakEven` is called with a reference window where `adCost === 0` but the model has overhead (organic-only period, tracking outage, or a fresh account), or any margin edge case reaching `breakEvenRoas(0)`.
- **Root cause**: `loadedBreakEvenRoas` returns `Infinity` when `adCost <= 0`, and the guard at compute.ts:87 then sets `loadedPno = Infinity` too — the code deliberately produces `Infinity` as a domain value, but nothing in the `BreakEven` contract says how callers must serialize or render it. `JSON.stringify(Infinity)` silently becomes `null`, so any API route returning `BreakEven` sends `loadedRoas: null` while the TypeScript type still claims `number`.
- **Impact**: Downstream surfaces either render "∞"/"Infinity"/"NaN %" to clients or trip on an unexpected `null` that the type system said couldn't exist. The gross variants (`breakEvenRoas`, `breakEvenPno`) have the same trait for `marginPct <= 0`, though `sanitizeCostModel` shields the report path.
- **Fix sketch**: In `deriveBreakEven`, treat a non-finite loaded value the same as "no overhead/fulfilment": omit `loadedRoas`/`loadedPno` (the interface already makes them optional). Document on `breakEvenRoas`/`breakEvenPno` that callers crossing a JSON boundary must map non-finite to `undefined`.

## 3. sanitizeCostModel: margin errors reject, overhead/per-order errors silently become 0
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-coercion
- **File**: src/lib/cost-model/compute.ts:92-104
- **Scenario**: A user (or a buggy client) submits `{ grossMarginPct: 0.4, monthlyOverhead: "45 000", perOrderCost: -80 }`. The thousands-separated string and the negative value are silently stored as `0`.
- **Root cause**: The validator uses two different failure policies in one function: an invalid margin returns `null` (whole save rejected), but invalid `monthlyOverhead`/`perOrderCost` are coerced to `0` with no signal to the caller. Nothing documents why the asymmetry exists. Boundary choices are also undocumented: `marginPct === 1` (100 % margin) is accepted, `marginPct === 0` is not.
- **Impact**: The user believes their overhead is saved; the report then shows a rosier "TRUE net profit" that quietly omits 45 000 Kč/month of overhead — the exact honesty problem the cost model exists to fix. Because `getCostModel` returns non-null, even the "zadejte marži" CTA disappears.
- **Fix sketch**: Make the policy uniform — return `null` (or a field-level error map) for any non-finite/negative input instead of coercing, and add one comment stating the accepted ranges including both boundaries. The API route can then 400 with a per-field message.

## 4. Two competing updatedAt timestamps in the persisted cost model
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: dual-source-of-truth
- **File**: src/lib/cost-model/store.local.ts:23-33 (mirrored in store.firestore.ts:24-26)
- **Scenario**: Any save. `saveCostModel` writes the store's own `new Date().toISOString()` into the `updated_at` column (Firestore: top-level `updatedAt` field) while the JSON blob carries whatever `model.updatedAt` the caller supplied — which the caller must synthesize itself, since `sanitizeCostModel` returns `Omit<CostModel, "updatedAt">`.
- **Root cause**: `CostModel.updatedAt` is part of the domain type, yet the stores also maintain a parallel write-time timestamp that `getCostModel` never reads. Nothing documents which one is authoritative, and nothing guarantees they agree (a caller replaying a stale payload, or forgetting to set the field, yields a blob timestamp that contradicts the row's).
- **Impact**: The "last edited" the report shows (blob value) can silently diverge from when the row was actually written; anyone querying the DB/Firestore by the column gets a different answer than the app displays. `updatedAt` can even be `undefined` at runtime despite the non-optional type if a caller passes the sanitized object straight through.
- **Fix sketch**: Make the store the single writer of the timestamp: have `saveCostModel` accept `Omit<CostModel, "updatedAt">`, stamp `updatedAt` itself, and write the same value into both the blob and the column (or drop the redundant column/field entirely).

## 5. Oldest trend bucket can be a partial window but is plotted as complete
- **Severity**: Medium
- **Lens**: ui
- **Category**: misleading-sparkline
- **File**: src/lib/profit/trend.ts:12-19, 74-92
- **Scenario**: A 30-day series bucketed weekly produces 4 full 7-day windows plus a leading 2-day stub; a 90-day series bucketed monthly starts mid-month. The stub bucket carries ~30 % (or less) of a full window's revenue/profit.
- **Root cause**: The `complete` flag was added only for the TRAILING partial calendar month (anchored to `anchorIsMonthEnd`). The leading bucket — the oldest fixed weekly window and the first partial calendar month — is never flagged, and the comment "the newest are always full, so they stay complete" documents only half the truth: fixed windows counted back from the anchor truncate at the series START.
- **Impact**: Every sparkline/trend chart opens with an artificial cliff — the first point looks like the business was near-zero and then "recovered", which misreads as dramatic growth. `trendDelta` is safe (it reads the last two buckets), but the plotted series and any min/max scaling are visually distorted on every render.
- **Fix sketch**: Flag the leading bucket `complete: false` when it holds fewer days than its window (weekly: `pts.length < 7`; monthly: first date not the 1st), and have the chart render incomplete buckets dimmed/dashed or drop them, matching the treatment the trailing partial month already gets.
