# L1 Certification — Robert (e-shop owner) · "Is marketing profitable after costs?"

- **Cert level:** L1 (theoretical / surface model — reasoned over source only, no app run, no browser)
- **Character:** Robert — e-shop owner, profit-first, fractional-CFO bar
- **Journey:** `uat/journeys/is-marketing-profitable.md`
- **Date:** 2026-06-19
- **Entry surfaces read:** Profit `/zisk`, LTV `/ltv`, Audience `/publikum`, Inventory & seasonality `/sklad-sezonnost`

---

## (a) Surface model

### Profit `/zisk` — `ProfitModule` (the headline surface)
- **Route** `src/app/app/[projectId]/zisk/page.tsx:22-67`: loads a per-project dataset, builds channel rows per period (30/90/365 d), seeds default margins, precomputes a profit/POAS trend, passes `SAMPLE_PRODUCTS` + `defaults` to the module.
- **Profit is computed AFTER margin, not ROAS-as-profit.** `computeProfit` (`src/lib/profit/compute.ts:15-60`): `grossProfit = revenue × marginPct`; `netProfit = grossProfit − cost`; `poas = grossProfit/cost`; `breakEvenRoas = 1/margin`; a channel is `profitable` only if `roas ≥ 1/margin`. The summary surfaces `netProfit`, `poas`, `blendedMargin`, and `unprofitableCount` ("looks fine on ROAS, loses money after margin"). This is exactly Robert's distinction.
- **Cost INPUTS exist and are live-editable:**
  - **Per-channel gross margin** — numeric `<input>` per row, 0–100 %, recomputes live (`ProfitModule.tsx:429-441`, `setMargin` `:211-214`).
  - **Overhead model** — toggle + **fixed monthly overhead (Kč)** and **per-order fulfilment cost (Kč)** inputs (`ProfitModule.tsx:488-526`), feeding `applyOverhead` (`src/lib/profit/overhead.ts:17-90`) → a true **contribution-margin POAS** and an **overhead-adjusted break-even ROAS** (`loadedCost/(cost×margin)`, `overhead.ts:48-50`). This is contribution margin, not gross margin — senior-correct.
  - **Budget** override for the "Co kdyby" reallocation simulator (`ProfitModule.tsx:770-789`).
- **Margin scenarios** — save/load/compare named margin sets via per-project `localStorage` (`ProfitModule.tsx:198-244`), with a side-by-side net-profit/POAS/loss-count diff.
- **Reallocation solver** — `reallocateBudget` (`compute.ts:68-143`): marginal profit per koruna = `roas×margin − 1`; greedily funds the best earners, drains loss-makers, caps at 3× current spend; reports projected net-profit delta. Margin-aware throughout.
- **Product view** — `computeProductProfit` (`src/lib/profit/products.ts:12-65`) derives per-category margin from **COGS** (`marginPct = 1 − cogsPct`), allocates ad cost by revenue share, flags the lowest-POAS category. Categories are **hardcoded sample** (`src/lib/profit/sample.ts:31-37`: Elektronika 82 % COGS, etc.) and **not user-editable** (unlike channel margins).
- **State/flow:** server precomputes the channel mix + trend per period; client re-applies the live margin/overhead/budget models (`useMemo`). No write-back to any data store; margins/overhead are session/local only.
- **Underlying revenue & cost are sample-derived**, not Robert's books: `getProjectDataset` (`src/lib/project-data/dataset.ts:33-51`) scales a single shared `performance` series by a deterministic hash of the project id. The user cannot enter or connect real revenue/spend; only the *margin/overhead lens on top* is theirs. Code comments call this a "Live seam (Phase D)" (`dataset.ts:5-9`).

### LTV `/ltv` — `LtvModule` + `LtvProjectionPanel` + `LtvDiagnosisPanel`
- **Route** `src/app/app/[projectId]/ltv/page.tsx:11-23`: renders entirely from `SAMPLE_COHORTS` — **the route ignores `projectId` for data** (only used for the module guard).
- **Cohort math is correct and honest about modelling** (`src/lib/ltv/compute.ts`): CAC = spend/signups; retention extrapolated geometrically to a 12-mo horizon with a clamped tail ratio (`tailRatio` 0.8–0.98, `:68-72`); LTV = Σ survival×ARPU; payback month; LTV:CAC; **paid-only CAC excludes organic** (`:128-135`, `isPaidChannel`). The survival sparkline visually splits **observed vs. modelled** (dashed) (`LtvModule.tsx:94-134`), and the projection panel shows a **low/expected/high confidence band** plus an interactive horizon (12/24/36) and churn slider (`LtvProjectionPanel.tsx`). This is genuinely senior-grade cohort work.
- **BUT the data model is SaaS/app, not e-shop.** Cohorts are **signups + monthly ARPU + retention curves** (`src/lib/ltv/sample.ts:1-4,17-30`, header: "for a SaaS/app project"; module header `LtvModule.tsx:1` "for an app/SaaS project"). The footnote names the seam as "product analytics (Segment / PostHog / Stripe)" (`LtvModule.tsx:277-279`) — **not** orders/AOV/repeat-purchase-rate, which is how an e-shop's LTV is actually built.
- **No cost/price input.** The only interactivity is the horizon toggle and churn slider; Robert cannot enter his AOV, repeat rate, or CAC. CAC also feeds the LTV view but is **not reconciled with the spend Robert sees on `/zisk`** (different sample sources).
- **AI diagnosis** (`LtvDiagnosisPanel.tsx`) passes only already-computed real numbers to `/api/ai` (no invented values) and runs in a keyless demo mode.

### Audience `/publikum` — `AudienceModule`
- **Route** `src/app/app/[projectId]/publikum/page.tsx:18-34`: 100 % `SAMPLE_*` (funnel, segments, revenue, subscriber history, RPM, goals) — `projectId` used only for the guard.
- Revenue/segment/RPM rollups (`src/lib/audience/compute.ts`) with a CPM rate-card band (`AudienceModule.tsx:26`). Descriptive, read-only; **no cost/margin lens** here, so for Robert this is the weakest "which customers to double down on" surface — it's audience/revenue, not profit-per-segment. Segment value is revenue, not margin.

### Inventory & seasonality `/sklad-sezonnost` — `InventorySeasonModule`
- **Route** `src/app/app/[projectId]/sklad-sezonnost/page.tsx:15-50`: seasonality from the project's daily series (`monthlySeasonality`), but **stock from `SAMPLE_PRODUCTS`** (`src/lib/catalog/sample.ts`).
- **Logic is real and actionable** (`src/lib/inventory/compute.ts`): days-of-cover = stock/velocity; status ok/low/pause/**resuming** (restock-aware, `:118-152`); deterministic projected stockout date; a **seasonality-scaled 12-mo budget plan capped by aggregate days-of-cover** ("don't overspend into thin air", `seasonalBudgetPlan:197-236`); **margin-weighted value-at-risk** and a per-SKU **budget change-set** proposal (`budgetChangeSet:276-310`). This is inventory-literate and ties stock to ad budget — what Robert wants.
- **Two integrity gaps:**
  1. **Read-only, hardcoded stock** — no input for stock/velocity/restock; all from `catalog/sample.ts`. Robert cannot point it at his SKUs.
  2. **Margins are a SEPARATE hardcoded table** (`CATEGORY_MARGIN`, `inventory/compute.ts:68-77`: Kočárky 0.22, Autosedačky 0.28 …) — a **different product universe** than the profit module's categories (Elektronika/Domácnost/Móda, `profit/sample.ts`). The two "profit" surfaces do not share a margin source, so the margins won't reconcile.

### Cross-surface reconciliation (Robert's trust test)
- The four surfaces draw from **three unrelated sample universes**: channel/COGS categories (`profit/sample.ts`), SaaS cohorts (`ltv/sample.ts`), baby-gear SKUs (`catalog/sample.ts`). Spend on `/zisk` ≠ CAC spend on `/ltv` ≠ ad-spend estimate on `/sklad`. **Nothing reconciles to one P&L.** None of the four surfaces shows an explicit "sample/demo data" banner to the user (contrast `DistributionModule.tsx:85`, `LocalReviews.tsx:161` which do) — the "seam" notes are developer comments + technical footnotes, not an honesty banner Robert would read as "these aren't your numbers."

---

## (b) L1 findings

```json
[
  {
    "id": "L1-ROB-01",
    "cert_level": "L1",
    "type": "strength",
    "dimension": "trust / value",
    "severity": "info",
    "title": "Profit is computed after margin + overhead, not ROAS-as-profit — and costs are user-editable",
    "expected": "Profit after real costs (COGS/overhead), honest where margin is thin; a way to enter real costs.",
    "got": "Per-channel net profit = revenue×margin − spend; POAS and break-even ROAS (1/margin); a contribution-margin view from user-entered monthly overhead + per-order fulfilment; 'looks fine on ROAS, loses after margin' callout. Margins, overhead and budget are all live inputs.",
    "evidence": "src/lib/profit/compute.ts:21-39; src/lib/profit/overhead.ts:30-50; src/components/app/modules/ProfitModule.tsx:429-441,488-526,389-399",
    "code_check": "computeProfit derives netProfit/poas/breakEvenRoas from a per-channel marginPct; applyOverhead loads fixed+per-order cost to a contributionPoas; ProfitModule exposes margin/overhead/budget inputs that recompute live.",
    "suggested_acceptance": "Given the Profit module, when Robert lowers a channel's margin below its break-even, then that channel flips to a loss and the unprofitable-count + reallocation update live."
  },
  {
    "id": "L1-ROB-02",
    "cert_level": "L1",
    "type": "gap",
    "dimension": "trust / data-integrity",
    "severity": "major",
    "title": "Underlying revenue/spend is sample data with no way to enter or connect real numbers, and no honest 'sample data' banner",
    "expected": "More trustworthy than his weekly spreadsheet; honest about what's real.",
    "got": "Revenue/cost come from one shared performance series scaled by a hash of the project id; the user can only adjust the margin lens, not the books. The four Robert surfaces show no 'ukázková data' banner (unlike Distribution/Local). 'Seam' notes are dev comments/footnotes, not user-facing disclosure.",
    "evidence": "src/lib/project-data/dataset.ts:16-51; src/app/app/[projectId]/ltv/page.tsx:11-23; src/app/app/[projectId]/publikum/page.tsx:18-34; (contrast) src/components/app/modules/DistributionModule.tsx:85, LocalReviews.tsx:161",
    "code_check": "getProjectDataset scales performance.daily by projectScale(seed01(id)); zisk/sklad use it, ltv/publikum are pure SAMPLE_*; no module renders a sample-data banner.",
    "suggested_acceptance": "Given any of /zisk /ltv /publikum /sklad with no connected source, then a visible banner states the figures are sample data and offers a connect/import path, and the user can override the base revenue/spend (not just margin)."
  },
  {
    "id": "L1-ROB-03",
    "cert_level": "L1",
    "type": "mismatch",
    "dimension": "senior-quality / fit",
    "severity": "major",
    "title": "LTV is a SaaS/subscription model (signups · ARPU · retention), not an e-shop model (orders · AOV · repeat-rate)",
    "expected": "A cohort/LTV view that tells an e-shop owner which CUSTOMERS to double down on, in e-commerce terms.",
    "got": "Cohorts are paid signups with monthly ARPU and a retention survival curve; seam is named 'product analytics (Segment/PostHog/Stripe)'. The math is correct but for a subscription business; an e-shop's LTV is repeat purchases × AOV × margin, which is absent.",
    "evidence": "src/lib/ltv/sample.ts:1-4,17-30; src/components/app/modules/LtvModule.tsx:1,277-279",
    "code_check": "Cohort = {signups, spend, arpu, retention[]}; withMetrics extrapolates monthly retention; no order/AOV/repeat-purchase fields anywhere in the LTV lib.",
    "suggested_acceptance": "Given the LTV module for an eshop project, then cohorts are expressed in orders/AOV/repeat-purchase-rate with contribution margin, and CAC reconciles with the spend shown on /zisk."
  },
  {
    "id": "L1-ROB-04",
    "cert_level": "L1",
    "type": "gap",
    "dimension": "trust / consistency",
    "severity": "major",
    "title": "Margin is defined in three unreconciled places across three product universes",
    "expected": "Margin-aware analysis that reconciles to one P&L (fractional-CFO bar).",
    "got": "Profit uses editable per-channel margins + a separate hardcoded COGS-by-category table (Elektronika/Domácnost…); Inventory uses its own hardcoded CATEGORY_MARGIN (Kočárky/Autosedačky…); LTV uses ARPU with no margin. The numbers cannot be made to agree.",
    "evidence": "src/lib/profit/sample.ts:7-37; src/lib/inventory/compute.ts:68-85; src/lib/ltv/sample.ts:17-30",
    "code_check": "DEFAULT_CHANNEL_MARGINS + SAMPLE_PRODUCTS (profit) vs CATEGORY_MARGIN (inventory) are disjoint maps; no shared margin source; product categories differ between the two modules.",
    "suggested_acceptance": "Given a single project, then all profit-bearing surfaces draw margin/COGS from one source so a category's margin is identical on /zisk and /sklad."
  },
  {
    "id": "L1-ROB-05",
    "cert_level": "L1",
    "type": "gap",
    "dimension": "actionability / inputs",
    "severity": "minor",
    "title": "Inventory and product-category COGS are read-only; Robert can't enter his stock or category margins",
    "expected": "Inventory/seasonality guidance he can act on for HIS buying; honest margins he sets.",
    "got": "Stock/velocity/restock come from catalog/sample.ts with no input; product-category COGS on /zisk is fixed sample (only channel margin is editable). The logic (days-of-cover, stockout date, seasonal cap, value-at-risk, change-set) is strong but runs on canned SKUs.",
    "evidence": "src/lib/catalog/sample.ts:28-92; src/app/app/[projectId]/sklad-sezonnost/page.tsx:27; src/lib/profit/products.ts:18-23",
    "code_check": "stockRows(SAMPLE_PRODUCTS,...); InventorySeasonModule is a server component with no inputs; computeProductProfit reads cogsPct from the fixed SAMPLE_PRODUCTS, with no per-category margin input in the UI.",
    "suggested_acceptance": "Given the Inventory module, then Robert can edit/import stock, velocity, restock and per-category margin, and the cover/stockout/value-at-risk/change-set recompute."
  },
  {
    "id": "L1-ROB-06",
    "cert_level": "L1",
    "type": "gap",
    "dimension": "fit / profit-per-customer",
    "severity": "minor",
    "title": "Audience values segments by revenue, not by margin/profit",
    "expected": "Which customers/products to double down on — in profit terms.",
    "got": "Audience funnel/segments/revenue are descriptive revenue views with no cost or margin overlay, so 'double down' on /publikum is a vanity-revenue read, exactly the trap Robert distrusts.",
    "evidence": "src/app/app/[projectId]/publikum/page.tsx:22-32; src/components/app/modules/AudienceModule.tsx:1-24",
    "code_check": "AudienceModule consumes SAMPLE_SEGMENTS/SAMPLE_REVENUE via audience/compute; no margin or contribution field on a segment.",
    "suggested_acceptance": "Given the Audience module, then each segment shows contribution margin (not just revenue) so the highest-profit segment is identifiable."
  }
]
```

---

## (c) L1 verdict

**`L1-pass`** — conditional.

The headline question — *"Is marketing profitable after real costs, not ROAS?"* — is answered well and is the standout of the build. The Profit module computes net profit and POAS after a **user-editable** margin, adds a **contribution-margin** view from real overhead + per-order inputs, names break-even ROAS, and explicitly surfaces "looks fine on ROAS, loses after margin." Inventory ties stock cover to ad budget and seasonality with margin-weighted value-at-risk; LTV cohort math is rigorous and honest about its modelled tail. That clears Robert's "profit after costs" and "inventory actionable" criteria at the design level.

It passes rather than fails because the failures are about **data provenance and fit**, not broken economics: Robert can't enter/connect his real revenue, spend, stock, AOV or category margins (only the margin *lens*); the LTV model is **SaaS-shaped, not e-shop**; margin lives in three unreconciled tables across three product universes; and there's no honest "this is sample data" banner on these four surfaces. For a fractional-CFO bar these are major reservations — hence conditional. An L2 run on connected real data is needed before this is "more trustworthy than his spreadsheet."

---

## (d) Character feedback — in Robert's voice

> Right, finally a marketing tool that doesn't wave ROAS in my face and call it profit. The Zisk screen gets it: I drop a channel's margin, it tells me the break-even ROAS, and three "winners" turn red because after cost of goods they're losing me money. I can punch in my monthly overhead and a per-order fulfilment cost and it gives me a contribution POAS — that's the number my accountant and I actually argue about. The reallocation "what-if" and the save-a-scenario bit? That's genuinely faster than my Sunday-night spreadsheet. Good.
>
> But here's where I get suspicious. Whose numbers are these? Nowhere does it say "this is sample data," yet I can't type in my own revenue or my real ad spend — I can only colour in the margins on top of figures the app made up from my project name. That's a lens on fiction. My spreadsheet is ugly, but it's *mine*.
>
> The LTV page is clever and completely wrong for me. Signups, ARPU, retention curves, "connect Stripe/PostHog" — that's a subscription SaaS, not an e-shop. I don't have subscribers; I have customers who buy a pushchair and maybe come back for a car seat. Show me repeat-purchase rate, average order value, contribution per cohort. As built, it can't tell me which *customers* to double down on in terms I trade in.
>
> And the margins don't reconcile. Zisk thinks I sell Electronics and Fashion; the Sklad page thinks I sell prams and baby monitors — with a totally different margin table. If two screens in the same tool can't agree what my margin is, I can't trust either to set next month's budget. The inventory logic itself is sharp — days of cover, a stockout date, capping the seasonal budget when I haven't got stock to sell, value-at-risk weighted by margin — that's exactly my thinking. I just can't point it at my actual warehouse.
>
> Audience is the weakest: it ranks customers by revenue. Revenue's vanity. Tell me which segment makes me money after costs.
>
> Verdict: the bones of a fractional CFO are here, and the profit screen alone might pull me off my spreadsheet for the channel question. But until I can feed it my real books, it speaks e-shop instead of SaaS on LTV, and its margins reconcile to one P&L — I keep the spreadsheet open in the next tab.
