# Feature Scout — Sklad & sezónnost (`/app/[projectId]/sklad-sezonnost`)

> Module: src/components/app/modules/InventorySeasonModule.tsx
> Project type: eshop
> Total: 5 ideas

## 1. Per-SKU budget change-set: auto-shift spend off near-stockout SKUs into in-stock winners
- **Category**: functionality
- **Impact**: 9
- **Effort**: 6
- **Risk**: 5
- **Gap today**: The module ends with a single static `NextSteps` link to `kampane` ("Pozastavit reklamu u docházejících SKU") — InventorySeasonModule.tsx:126. It diagnoses `status === "pause"` SKUs (compute.ts:50) but produces only a text `action` string (compute.ts:51-56); it never produces an executable budget move. Meanwhile a full audited control plane already exists (control-plane.ts `createChangeSet` → `simulateBudgetShift` → `approveChangeSet`/`revertChangeSet`, budget-moves.ts `recommendBudgetMoves`) but is fed only by ROAS, never by stock.
- **Proposal**: Add a stock-aware change-set producer mirroring `recommendBudgetMoves`: donors = `pause`/`low` SKUs (cut a `shiftFraction` of their spend), recipients = `ok` SKUs in the same category, ranked by velocity. Render a "Navrhnout přesun rozpočtu" panel below the table that lists proposed moves with projected CZK impact, holds for approval, and applies through the existing `applyBudgetShift` mutation path (reuse the change-set ledger + one-click revert).
- **User value**: Turns "this SKU runs out in 5 days" from a note the marketer has to act on manually into one approve-click that stops burning ad spend on a product that can't ship and redirects it to one that can.
- **Fit**: Directly realizes the registry blurb ("pause near-out-of-stock SKUs", "budget pacing"); reuses the eshop control-plane wholesale instead of leaving the link as decoration.

## 2. Restock-date-aware ramp: pause now, auto-schedule resume when stock returns
- **Category**: feature
- **Impact**: 8
- **Effort**: 5
- **Risk**: 4
- **Gap today**: `Product` (catalog/sample.ts:6-20) has only `stock` and `dailyVelocity` — no `restockDate`/incoming-PO field. `stockRows` (compute.ts:46-60) can say "pause" but has no concept of when a SKU comes back, so a paused SKU stays dark indefinitely with no resume signal. The `action` strings are one-directional (only ever "pozastavit/snížit/jet naplno").
- **Proposal**: Add an optional `restockDate` (and `incomingQty`) to `Product`. In `stockRows`, when `daysOfCover` crosses into `pause` but a restock falls within the horizon, emit a fourth status `resuming` with an action like "Pauza do {date} → obnovit rozpočet {restockDate−lead}". Add a "Naplánované obnovení" column/badge and a small timeline strip showing each paused SKU's expected back-in-stock date.
- **User value**: Prevents the classic mistake of leaving a campaign paused for weeks after stock already arrived — the marketer sees exactly when each SKU re-activates and can pre-schedule the ramp.
- **Fit**: Extends the existing pause logic into a full pause→resume lifecycle; restock dates are a natural field of the "real product feed" seam the file already calls out (sample.ts:3-4).

## 3. Seasonality-scaled budget plan: blend the season index with stock into a 12-month pacing table
- **Category**: functionality
- **Impact**: 8
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Seasonality and stock are computed and rendered as two completely independent blocks (InventorySeasonModule.tsx:40-74 vs 76-124). The seasonality output is consumed only as a colored bar chart plus one sentence about next month (`lead`, lines 29-34) — the `index` is never multiplied into any budget number. There is no forward pacing plan.
- **Proposal**: Add `seasonalBudgetPlan(baselineMonthlyBudget, season)` that produces a 12-row plan: `plannedBudget[m] = baseline × season[m].index`, with the peak month highlighted and the delta vs a flat split shown. Render it as a "Plán rozpočtu podle sezóny" table/chart under the seasonality card, and cap each upcoming month's planned budget by aggregate days-of-cover so you don't plan a peak-month surge for categories that will be out of stock.
- **User value**: Converts the abstract "index 1.3×" into "v listopadu naplánuj 34 000 Kč místo 26 000 Kč" — an actionable, stock-checked budget calendar instead of a chart to interpret.
- **Fit**: Uses both data sources the module already loads (`season` + `stock`) together; matches the blurb's core promise of "pacing rozpočtu podle sezónnosti a skladu".

## 4. Days-of-cover trend & stockout-risk alerts wired into the Overview command center
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 4
- **Risk**: 2
- **Gap today**: `daysOfCover` is a single point-in-time snapshot (compute.ts:49) with no trend or ETA — the table shows "5 dní" but not "−2 dní/týden, vyprodáno 23. 6.". The aggregate hub only surfaces SKUs already at `status === "pause"` (aggregate.ts:50-54); SKUs trending toward stockout but not yet under 7 days are invisible until it's too late.
- **Proposal**: Add a projected-stockout date (`stockoutAt = now + daysOfCover`) and a velocity-trend arrow per row, plus an "at-risk soon" tier in `eshopRecs` (e.g. `daysOfCover < 14` and accelerating) so the Overview flags SKUs *before* they hit hard pause. Show a compact "Vyprodáno za" date column and a risk count Pill in the header.
- **User value**: Gives lead time to reorder or pre-pause instead of reacting after a SKU is already a week from empty; the Overview becomes an early-warning board, not a post-mortem.
- **Fit**: Strengthens the recommendation producer this module already feeds (aggregate.ts:49-64) and deepens the days-of-cover concept the table is built around.

## 5. Margin-weighted pacing: protect profitable SKUs, deprioritize low-margin stock
- **Category**: feature
- **Impact**: 6
- **Effort**: 4
- **Risk**: 3
- **Gap today**: Pacing decisions ignore profitability entirely — `stockRows` ranks and statuses SKUs purely by `daysOfCover` (compute.ts:49-59), so a high-margin hero SKU and a near-break-even accessory get identical "pause" treatment. `Product` has `price` (sample.ts:11) but no cost/margin, and a `computeProfit`/`defaultMargins` model already exists in the profit module (referenced in aggregate.ts:11,42).
- **Proposal**: Add per-SKU/per-category margin (reuse the profit module's margin model) and compute `coverValue = daysOfCover × margin × dailyVelocity`. Sort and color the table by margin-at-risk, and bias the change-set from idea #1 to protect spend on high-margin in-stock SKUs first. Add a "Marže" column and a "value at risk" total.
- **User value**: Stops the marketer from cutting ad spend on the most profitable item just because it shares a low days-of-cover with a cheap accessory — pacing optimizes for profit, not just unit availability.
- **Fit**: Aligns the inventory module with the eshop project's existing profit lens (`zisk` module), making "budget pacing" margin-aware rather than unit-blind.
