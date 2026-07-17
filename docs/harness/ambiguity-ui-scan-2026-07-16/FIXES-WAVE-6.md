# Fixes — Wave 6 (money-math & statistics integrity)

Branch: `vibeman/ambiguity-ui-2026-07-16`. Theme: pure-function calculations that
silently mispriced, misjudged significance, or corrupted imported values. Every fix
ships with node:test unit tests that prove the corrected math and (where relevant)
that the buggy behavior is gone.

## Commits

| # | Commit | Finding | Scope |
|---|--------|---------|-------|
| 1 | `7c95eb0` | inventory-warehouse-sync #1 | ERP mapper drops numeric JSON prices to 0 |
| 2 | `5652d56` | product-catalog #2 | Heureka DELIVERY_DATE>0 wrongly pauses sellable products |
| 3 | `be994af` | onboarding-integrations-growth #1 | rate card mixes subscriber populations |
| 4 | `647104b` | ai-workspace-pipeline #2 | A/B winner on raw ROAS, no sample floor |
| 5 | `e0e757e` | competitive-intelligence #1 | LP trust gate fails open on 0-CVR control |
| 6 | `649a827` | cost-model-profit #1 | hold-revenue doesn't hold revenue |
| 7 | `d9732d0` | catalog-inventory-ui #1 | revenue-goal ETA uses subscriber growth |

(Committed in the order 1→4→3→5→6→2 above by hash; table lists by finding.)

## Narratives

**#1 ERP numeric prices (`src/lib/inventory/erp.ts`).** The mapper's `str()` helper
returned `""` for any non-string cell, so a REST ERP emitting `priceVat: 349` (a JSON
number, not `"349"`) had every price collapse to `parseFeedPrice("") = 0` while the
sync still reported success. Added `numStr()` which coerces a finite number to its
string form before the shared price parser runs. Existing demo/CSV paths (string
prices) are unchanged.

**#2 Heureka dispatch delay (`src/lib/catalog/feed.ts`).** `DELIVERY_DATE` is a
dispatch-delay field (0 = in stock, N = days), but `parseHeureka` mapped only the
literal `"0"` to available, so every row with `DELIVERY_DATE > 0` became
`inStock=false` and `mergeCatalog` deactivated whole catalogs of shops that ship in
1–3 days. New `heurekaInStock()` treats a small integer delay (≤ `HEUREKA_MAX_DISPATCH_DAYS = 3`)
as in stock; a longer delay or a concrete future date still pauses (preserving the
existing "future date = out" behavior). Empty tag → `undefined` (no signal).

**#3 Rate-card population (`src/lib/audience/compute.ts`).** `rateCard()` computed
opens as `activeReach` (active subs only) × a blend weighted over ALL segment
subscribers — two populations, so inactive low-openers dragged the blend down and the
active discount was applied on top, double-counting them and systematically
UNDER-pricing slots. `opensPerSend` is now `Σ(segment subscribers × open rate)` over
one population; `blendedOpenRate` is its reporting view; `activeReach` is
informational only. On the sample this raises opens/send 5824 → 8737 (a real price
correction upward).

**#4 A/B winner floor (`src/lib/ai/experiment-types.ts`).** `hasPerformanceBasis`
flipped to real-ROAS the moment every variant had any spend, letting a 3-click/1-conv
variant (ROAS 20 by noise) beat a 2000-click variant. Added a per-variant volume floor
(`MIN_PERFORMANCE_CLICKS=100` OR `MIN_PERFORMANCE_CONVERSIONS=10`) every variant must
clear before ROAS decides, and `experimentBasis() → performance | insufficient-data |
predicted` so the UI can flag an immature verdict. Below the floor, `pickWinner` falls
back to predicted strength. Not an llm-gated file (verified against `HASHED_FILES`).

**#5 LP trust gate fails closed (`src/lib/lp-exp/compute.ts`).** `requiredSampleSize`
returns `Infinity` for a 0-CVR control, and `evaluate()` resolved that non-finite
branch to the PERMISSIVE value (`progress=1`, `hasEnoughData=true`), so a near-empty
running test was declared significant once a few challenger signups produced a large z.
Non-finite sizing now fails closed (`progress=0`, `hasEnoughData=false`). Also added an
empty-variants guard returning a safe fully-gated result instead of crashing on
`variants[0]!`.

**#6 hold-revenue actually holds revenue (`src/lib/profit/compute.ts`, `types.ts`).**
The strategy drained loss-makers identically to max-profit and merely reordered by
ROAS, so whenever a profitable channel's cap left budget unused, total revenue fell
with no signal. Added a recovery pass: after the profit-first fill, hold-revenue
deploys leftover budget into the highest-ROAS channels with headroom (incl. loss-makers)
up to the minimum spend needed to hold `currentRevenue`. New `ReallocPlan.revenueHeld`
reports success/failure so the UI can warn. Implements the constraint AND surfaces the
warning (both options from the fix sketch).

**#7 Revenue-goal ETA (`src/lib/audience/compute.ts`, `AudienceModule.tsx`).**
`goalProgress` took a single growth rate applied to both goals, and the card rendered
"at +X%" with the subscriber rate under BOTH goals — a fabricated revenue timeline
whenever the two diverge. `goalProgress` now takes a per-line `revenueGrowth` and each
`GoalLine` records the `growthRate` its ETA assumed. `AudienceModule` derives revenue
growth from RPM history (revenue ≈ subscribers × RPM, so growth compounds both drivers)
and passes `null` when there's no RPM signal, so the revenue row shows "no ETA" rather
than borrowing the subscriber rate. `revenueGrowth` defaults to `subscriberGrowth` for
backward compatibility.

## Verification

- `npx tsc --noEmit`: **0 errors** (run before every commit).
- `npm run test:unit`: **1610 / 1610 pass, 0 fail** (baseline 1595 + 15 new tests).
- The known `tenant-docs-local-store` shared-state flake fired on one intermediate run
  and passed 9/9 in isolation and on the clean full re-run — confirmed pre-existing,
  not caused by these changes.
- `llm:gate:check`: **clean** — the pre-commit hook ran it on every commit; all 20 tool
  contracts match their golden snapshots. No gated files were touched (`experiment-types.ts`
  is not in `HASHED_FILES`).

## New tests (15)

- `catalog-erp.test.mjs`: numeric JSON price cells import at real value (+1)
- `catalog-feed.test.mjs`: Heureka short dispatch delay stays in stock (+1)
- `audience-revenue-mix.test.mjs`: one-population opens/price; per-line revenue growth;
  null revenue growth → no ETA (+3)
- `ai-experiment-winner.test.mjs`: new file — tiny-sample not crowned; floor by clicks or
  conversions; basis states (+5)
- `lp-exp.test.mjs`: 0-CVR control fails closed; empty-variants safe result (+2)
- `profit.test.mjs`: max-profit can drop revenue (revenueHeld=false); hold-revenue holds
  revenue minimally; hold-revenue reports false when budget can't hold (+3)

## Behavior changes needing sign-off

1. **hold-revenue now funds loss-makers.** The strategy will deploy leftover budget into
   unprofitable channels to hold revenue, trading some profit for the revenue the user
   asked to keep. This is the intended contract but a visible behavior change vs the old
   (identical-to-max-profit) output. `ReallocPlan.revenueHeld` is exposed but **not yet
   surfaced in `ProfitReallocationPanel`** — a small UI badge/warning is a suggested
   follow-up (deferred to avoid i18n key churn across locales in this wave).
2. **Sponsorship prices go UP.** The rate-card fix raises `opensPerSend`/`priceFloor/Mid/Ceil`
   (sample: opens 5824 → 8737, ~+50%). Sellers were under-charging; confirm the new basis
   (opens across all segment subscribers) matches the intended pricing model.
3. **Heureka cutoff = 3 days.** Products dispatching in >3 days are still paused. Confirm 3
   is the right threshold for the shops in scope (`HEUREKA_MAX_DISPATCH_DAYS`).
4. **A/B "winner" may revert to predicted strength** on immature tests instead of showing a
   ROAS-based winner. `experimentBasis` is exposed for the UI to label "insufficient data";
   wiring that label into `AdExperiments.tsx` is a suggested follow-up.

## Patterns

- **Fail closed on non-finite sizing.** `Infinity`/`NaN` from a degenerate statistical
  input must resolve to the conservative branch, never the permissive one (findings #5, and
  the same doctrine informs #4's floor).
- **One population per ratio.** A rate × a count must use the same denominator population
  (#3); mixing "all subscribers" open rate with "active" reach silently double-counts.
- **Coerce before parse.** JSON delivers numbers where a string parser expects strings; a
  `typeof === "string" ? v : ""` helper silently zeroes real data (#1).
- **Thread per-series inputs, don't share one.** A single growth/rate applied to two
  different series fabricates one of them (#7); expose the assumed input on the result so
  the UI can't mislabel it.
- **Tests must prove the OLD value is gone**, not just that the new one is right (every
  test above asserts the pre-fix wrong value would have failed).
