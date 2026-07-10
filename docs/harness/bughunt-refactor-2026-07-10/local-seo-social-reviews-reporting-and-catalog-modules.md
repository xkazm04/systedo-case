# Local SEO, social, reviews, reporting & catalog modules

> Total: 5
> Critical: 0 · High: 0 · Medium: 2 · Low: 3
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Catalog/store reads have no recovery on 6 of 7 pages — only `twin` degrades

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/app/[projectId]/schranka/page.tsx:18`
- **Scenario**: In prod the catalog is Firestore-backed: `loadServicesFor` / `loadProjectCatalog` → `listOfferings(userId, projectId)` (`src/lib/catalog/load.ts:21`) can reject on any transient store error. `twin/page.tsx:17` guards this exact call with `loadProjectCatalog(project).catch(() => [])`. Every sibling in this context does not: `schranka` (`loadServicesFor` inside `Promise.all`, line 18-23), `recenze` (`loadServicesFor`, line 17), `mapa` (`loadServicesFor`, line 15), `lokalni` (`loadServicesFor`, line 20), `srovnani-seo` (`loadPlansFor`, line 25), `katalog` (`loadProjectCatalog`, line 20). A single Firestore hiccup 500s those whole module pages (error boundary) while the Twin page renders fine — same dependency, opposite resilience.
- **Root cause**: The graceful-degradation decision was made per-page by whoever wrote each one, not centralized; only the Twin author remembered the catalog read can throw. Nothing enforces the "catalog is best-effort, fall back to seed" contract the loader itself already honors for the *missing* (null) case but not the *throwing* case.
- **Impact**: Correlated multi-module outage on any Firestore blip — the user loses Reviews, Inbox, Local, Map, SEO-compare and Catalog at once, but Twin stays up, which looks arbitrary and makes the fault hard to diagnose. `recenze` compounds it with a second unguarded store read (`getProjectState`, line 22).
- **Fix sketch**: Make the store read fail-soft at the source: wrap the `listOfferings` call in `loadProjectCatalog` (load.ts:21) in `try/catch` returning `getProjectCatalog(project, now)` (the seed) on error, so every page degrades to the seed catalog identically and the per-page `.catch` in Twin becomes redundant rather than load-bearing.

## 2. Monthly report anchors stock "now" + seasonality on the live dataset; Sklad module uses the base dataset — the two disagree

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/app/app/[projectId]/mesicni-report/page.tsx:38`
- **Scenario**: The report's inventory summary derives `now` from `resolveReportDataset(project).data` (line 24-25 → line 38: `dataset.daily.at(-1)?.date`), which returns the project's **live synced Ads series** when one exists. It then computes `stock = stockRows(products, now)` and `atRiskCount` (line 41-42) and `season = monthlySeasonality(dataset.daily)` (line 43). But the actual **Sklad & sezónnost** page computes the identical stock/season from `getProjectDataset(project)` — the static 750-day base series (`sklad-sezonnost/page.tsx:18,24`). Once a project syncs live data (a) the report's stockout classification/`atRiskCount` are anchored to a *different* reference date than the Sklad module shows for the same SKUs, and (b) if the live series spans < 12 months, `season[now.getUTCMonth()]` returns index `0` for any month with no live rows (`monthlySeasonality` fills absent months with `index: 0`, compute.ts:30), so the report's `seasonIndex` renders a nonsensical `0×` seasonal factor.
- **Root cause**: Two surfaces that are meant to show one inventory reality pull from two different "now"/dataset seams — the report from the live-capable `resolveReportDataset`, the Sklad module from the always-sample `getProjectDataset`. The page-header comment even claims tiles are "grounded on THIS project's dataset (getProjectDataset)", which no longer matches the code.
- **Impact**: Client-facing monthly report can state a different at-risk SKU count / stockout dates than the Sklad module, and a `0×` seasonal index on any partially-synced project — a credibility hit on the sales-facing recap.
- **Fix sketch**: Derive the inventory block's `now` and `season` from `getProjectDataset(project)` (the same spine Sklad uses) rather than the resolved live dataset, or route both surfaces through one shared `datasetNow(...)` + inventory helper; guard the season lookup with `seasonNow?.index > 0 ? … : 1` so an absent month falls back to a neutral 1× instead of 0×.

## 3. AI review-reply gets a different, order-unstable business descriptor depending on which page drafts it

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/app/[projectId]/recenze/page.tsx:30`
- **Scenario**: Both the Review Inbox (`recenze`) and the Local Dominance panel (`lokalni`) feed a `businessType` into the same `local-review-reply` LLM operation, derived from the same `loadServicesFor(project)` result — but derived differently. `recenze` passes `businessType={services[0]?.category}` (line 30): the raw category of whichever service happens to be first in catalog order. `lokalni` passes `[...new Set(services.map((s) => s.category).filter(Boolean))].slice(0, 2).join(" a ").toLowerCase()` (lines 26-30): the first two distinct categories, joined and lowercased. So the LLM is told the business is e.g. `"Instalatérství"` from one screen and `"instalatérství a topení"` from the other — and `recenze`'s value flips whenever the user reorders the catalog, since `services[0]` is position-dependent with no sort.
- **Root cause**: The "what does this business do" descriptor was hand-derived inline on each page instead of via one shared helper, so the two pages diverged and `recenze` was given the fragile single-index form.
- **Impact**: Inconsistent AI reply grounding for the same project/review across two entry points, and non-deterministic replies from `recenze` after a catalog reorder. Low blast radius (cosmetic tone of a draft), but it undermines the "replies match THIS business" guarantee the code comments advertise.
- **Fix sketch**: Extract `businessTypeFromServices(services): string | undefined` (the `lokalni` 2-distinct-category form) into `src/lib/local/catalog.ts` and call it from both pages so the descriptor is identical and order-stable.

## 4. Aggregate days-of-cover uses the upper-middle element, not the median — biases the budget cap high

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/app/[projectId]/sklad-sezonnost/page.tsx:36`
- **Scenario**: `const aggregateDaysOfCover = covers.length > 0 ? covers[Math.floor(covers.length / 2)]! : Infinity;` (covers is the ascending-sorted list of finite per-SKU covers). For any even count this picks the *higher* of the two middle values, not their average — e.g. covers `[6, 40]` yields `40`, not `23`. That value feeds `seasonalBudgetPlan(..., { daysOfCover: aggregateDaysOfCover })`, where `sustainableMonths = Math.floor(cover / 30)` (compute.ts:200) decides how many upcoming months keep the full seasonal uplift before being capped to the flat budget. (This is a correctness claim about the arithmetic; the 2026-07-09 refactor report flagged the same line only as a copy-paste duplication, not for the even-count bias.)
- **Root cause**: `covers[Math.floor(n/2)]` is a common "median" shorthand that is only correct for odd-length arrays; for small catalogs (2–4 SKUs) the upper-bias is material.
- **Impact**: On a catalog with an even SKU count and a wide cover spread, aggregate cover is overstated → `sustainableMonths` too high → the plan caps *fewer* upcoming months → it recommends spending the full seasonal ad-budget uplift into stock that can't sustain it — exactly the overspend the capping rule exists to prevent. Small, but it's a money-adjacent recommendation.
- **Fix sketch**: Compute a true median — for even lengths average the two central elements: `const mid = covers.length >> 1; const median = covers.length % 2 ? covers[mid]! : (covers[mid - 1]! + covers[mid]!) / 2;` — and, if this aggregate is extracted per prior finding #2, do it inside that shared `aggregateDaysOfCover` helper.

## 5. Three ad-hoc "distinct catalog attribute" derivations inlined across the pages

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/app/app/[projectId]/lokalni/page.tsx:27`
- **Scenario**: The `[...new Set(services.map((s) => s.<attr>).filter(Boolean))].slice(0, N)` idiom is retyped with per-page variations: `lokalni/page.tsx:27` (`.category`, slice 2), `schranka/page.tsx:32` (`.name`, slice 12), and a degenerate single-index variant in `recenze/page.tsx:30` (`services[0]?.category`). All three exist to answer "what distinct things does this catalog offer" for AI grounding, but no shared helper owns the shape. This is not in the 2026-07-09 report (whose only reviews/catalog structural finding was the `reviewsForProject` name collision).
- **Root cause**: The distinct-attribute projection was written fresh at each call site as the catalog-grounding feature was added module-by-module.
- **Impact**: Low — pure cleanup. But the drift already produced the inconsistency in finding #3; consolidating removes the class of bug, not just this instance.
- **Fix sketch**: Add `distinctServiceCategories(services, limit?)` and `distinctServiceNames(services, limit?)` to `src/lib/catalog/resolve.ts` (or `local/catalog.ts`) and call them from the three pages; finding #3's `businessTypeFromServices` can build on the categories helper.
