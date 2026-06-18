# Feature Scout — Zisk (`/app/[projectId]/zisk`)

> Module: src/components/app/modules/ProfitModule.tsx
> Project type: eshop
> Total: 5 ideas

## 1. Target-POAS budget reallocation simulator
- **Category**: functionality
- **Impact**: 9
- **Effort**: 6
- **Risk**: 4
- **Gap today**: The module diagnoses the problem (`unprofitableCount`, the alert at ProfitModule.tsx:112-122, and the lone NextStep "Přesunout rozpočet" at :191) but never quantifies the fix — it tells you to move budget without saying *how much* or *what the profit gain would be*.
- **Proposal**: Add a "Co kdyby" panel below the table. The user sets a total ad budget (defaulting to current `summary.cost`) and a strategy ("maximalizovat zisk" / "udržet obrat"). A pure solver in `@/lib/profit/compute` reallocates spend toward channels with the highest marginal POAS (capped so no channel exceeds a sane multiple of today's spend, holding each channel's revenue/cost elasticity at its current ROAS), then renders projected net profit vs. today with per-channel +/− spend deltas. Wire the result into the NextSteps hint ("přesunout 40 tis. Kč z Heureky do Sklik → +X Kč zisku").
- **User value**: Turns a passive warning into an actionable, numbers-backed plan — the difference between "you're losing money" and "do exactly this to gain 180 tis. Kč/měsíc".
- **Fit**: Directly extends the module's POAS-over-ROAS thesis and its existing Kampaně cross-link; reuses `ProfitRow` math, no new data source needed.

## 2. SKU / product-category margin breakdown
- **Category**: feature
- **Impact**: 8
- **Effort**: 7
- **Risk**: 5
- **Gap today**: Margins are modeled per *channel* only (`ChannelMargin` in types.ts:6-10, `DEFAULT_CHANNEL_MARGINS` in sample.ts:7-15). A blended channel margin hides the reality that a single channel sells both high-margin and loss-leader products; the sample.ts header itself flags this as the "real-integration seam" (per product/category COGS).
- **Proposal**: Add a second tab/view "Podle produktů". Introduce a `data.products` shape (category, revenueShare, cost-of-goods → margin) in the dataset, compute a product-level `ProfitRow` variant, and surface the lowest-POAS product categories with a "tyto produkty táhnou marži dolů" callout. Keep channel view as default; products view answers *what* is unprofitable, not just *where*.
- **User value**: E-shop owners think in products, not channels — this exposes the loss-leader SKUs that channel-level POAS averages away.
- **Fit**: Natural deepening of the margin model for the eshop type; the codebase already anticipates it (sample.ts comment about Merchant Center / ERP COGS per product).

## 3. Profit & POAS trend over time
- **Category**: feature
- **Impact**: 7
- **Effort**: 4
- **Risk**: 2
- **Gap today**: Every number is a single-period snapshot (`computeProfit` over `totalsOf(daily.slice(-days))` in zisk/page.tsx:21-26). There is no sense of whether net profit / POAS / blended margin are improving or eroding — the rest of the app has period-over-period deltas (`channelRowsCompared`, `rel`) but Zisk shows none.
- **Proposal**: Server-bucket the `daily` series into weekly/monthly windows, run `computeProfit` per bucket with the current margin model, and render a compact sparkline/area chart of net profit + POAS above the table, plus a period-over-period delta pill on each summary card (reusing the `rel` helper and `fmtSignedPct`). Margin edits re-drive the trend live, same as the table.
- **User value**: Answers "is my ad profit getting better or worse?" — the single most natural question a snapshot can't answer.
- **Fit**: `daily` data and the delta/format helpers already exist; this is pure presentation over data already loaded server-side.

## 4. Margin scenarios — save, name & compare
- **Category**: user_benefit
- **Impact**: 6
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Margins live in ephemeral `useState` (ProfitModule.tsx:27); the only persistence affordance is "Obnovit výchozí marže" (:64). Any what-if margin set (e.g. "po renegociaci s dodavatelem", "vánoční slevy") is lost on refresh and can't be compared side-by-side.
- **Proposal**: Let the user save the current margin set as a named scenario (persisted to JSON-in-repo / localStorage per project, matching the app's storage style), list saved scenarios in a dropdown, and offer a "Porovnat" mode that shows two scenarios' net profit / POAS / unprofitable-count side by side with deltas.
- **User value**: Supports real planning conversations ("what happens to ad profit if we squeeze 4 pts of margin on shopping channels?") without re-typing margins each session.
- **Fit**: Builds directly on the existing editable-margin + reset interaction; aligns with the JSON-in-repo persistence pattern used elsewhere.

## 5. Fixed-cost / overhead allocation toggle (true contribution margin)
- **Category**: functionality
- **Impact**: 6
- **Effort**: 4
- **Risk**: 4
- **Gap today**: Net profit = `revenue × margin − adSpend` (compute.ts:16-17) counts *only* ad spend. It ignores agency fees, platform/tooling costs, fulfillment and shipping — so "Čistý zisk z reklamy" overstates the money actually kept, and break-even ROAS (`1/margin`, compute.ts:19) is optimistic.
- **Proposal**: Add an optional "Zahrnout režijní náklady" input group: monthly fixed overhead + a per-order fulfillment cost. Allocate overhead across channels by revenue share and subtract per-order costs (using `conversions` already on `ChannelRow`), producing a true contribution-margin POAS and an adjusted break-even ROAS. Show both raw and overhead-adjusted figures so the user sees the gap.
- **User value**: Stops the dangerous illusion that an ad-profitable channel is *business*-profitable; gives the real ROAS floor to brief the campaign team.
- **Fit**: Sharpens the module's core POAS-vs-ROAS argument with one more cost layer; uses fields already on `ChannelRow` (conversions, revenueShare), minimal new surface.
