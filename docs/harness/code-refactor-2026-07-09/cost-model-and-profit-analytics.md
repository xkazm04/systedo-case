# Cost Model & Profit Analytics

> Context #39 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 2, Medium: 1, Low: 1)
> Files read: 11

## 1. Overhead table's per-row color and the module's own unprofitable count disagree

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/lib/profit/overhead.ts:52-92`
- **Scenario**: `applyOverhead` defines "unprofitable after overhead" as `contributionProfit < r.cost` for its `summary.unprofitableCount` (line 89) — a channel only counts as profitable once its contribution profit covers its own ad spend. But `OverheadRow` never exposes that test as a field, so the consumer, `src/components/app/modules/ProfitModule.tsx:1012-1017`, improvises its own row-coloring check: `r.contributionProfit >= 0`. Those two thresholds diverge for any channel where `0 ≤ contributionProfit < cost` — e.g. `cost=1000, allocatedOverhead=200, fulfilmentCost=100, grossProfit=500 → contributionProfit=200`. That channel is counted in the red `unprofitableCount` footer (`200 < 1000`) while its own row in the table renders green (`200 ≥ 0`). The adjacent Contribution-POAS cell in the *same row* (`ProfitModule.tsx:1004-1009`, `r.contributionPoas >= 1`) uses the *correct* threshold (`contributionPoas = contributionProfit/cost ≥ 1 ⇔ contributionProfit ≥ cost`), so a user sees two cells in one row contradict each other plus the page's own summary count.
- **Root cause**: The "is this row unprofitable once overhead is loaded in" test only exists inline in the `summary.unprofitableCount` filter; it was never lifted to a per-row boolean the way `ProfitRow.profitable` does for the raw (pre-overhead) view, so the UI had to reinvent it and picked the wrong baseline (0 instead of `cost`).
- **Impact**: Users see a red aggregate "X unprofitable channels" footer while the flagged channel's own contribution-profit cell is styled green — a visible, provable contradiction on the Overhead panel that undermines trust in the whole margin tool.
- **Fix sketch**: Add `contributionProfitable: boolean` to `OverheadRow` in `src/lib/profit/types.ts` (mirroring `ProfitRow.profitable`), compute it in `applyOverhead` (`src/lib/profit/overhead.ts`) as `contributionProfit >= r.cost` right next to the existing `contributionProfit`/`contributionPoas` fields, and have `unprofitableCount` filter on it (`out.filter(r => !r.contributionProfitable).length`). Then update `ProfitModule.tsx`'s row-coloring (line ~1014) to use `r.contributionProfitable` instead of the ad-hoc `r.contributionProfit >= 0`.

## 2. The same grossProfit/netProfit/POAS/break-even row formula is implemented three times in `profit/`

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/profit/compute.ts:21-44`
- **Scenario**: `computeProfit`'s per-row map (`grossProfit = revenue*marginPct`, `netProfit = grossProfit - cost`, `poas = grossProfit/cost`, `breakEvenRoas = marginPct>0 ? 1/marginPct : Infinity`, `profitable = netProfit >= 0`) is re-typed almost verbatim in `applyOverhead` (`src/lib/profit/overhead.ts:31-35,65`) before it layers overhead/fulfilment on top, and again in `computeProductProfit` (`src/lib/profit/products.ts:56-77`) for the category rollup. The summary reduction (`revenue/cost/grossProfit/netProfit` totals via `.reduce`) is also copy-pasted identically between `compute.ts:46-49` and `products.ts:80-83`. `reallocateBudget` (`compute.ts:127`) inlines a fourth variant (`projectedRevenue*marginPct - suggestedSpend`). This is exactly the kind of drift risk finding #1 above is a live instance of: three copies means three places to remember to keep a formula (or its `profitable` definition) in sync.
- **Root cause**: Each module was written independently as "pure compute, no I/O" per its own header comment, but the shared arithmetic core was never factored out — only the domain-specific layer on top (overhead allocation, category revenue-share) differs.
- **Impact**: Any future change to the margin formula (e.g. how `profitable` is defined, as already diverged once — see finding #1 and #5) requires hunting down and editing 3-4 near-identical blocks; a fix applied to one is easy to forget in the others.
- **Fix sketch**: Extract a `computeMarginRow(revenue: number, cost: number, marginPct: number)` pure helper (new export in `src/lib/profit/compute.ts`, returning `{ grossProfit, netProfit, poas, breakEvenRoas, profitable }`) and have `computeProfit`, `applyOverhead`, and `computeProductProfit` call it for their shared fields, then layer their own additions (overhead/fulfilment fields; category revenue-share allocation) on the result instead of re-deriving them.

## 3. Cost-model's `periodProfit` and profit's `applyOverhead` independently reimplement "net profit after ad spend + overhead + fulfilment"

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/cost-model/compute.ts:36-49`
- **Scenario**: `periodProfit` computes `netProfit = grossProfit - adCost - overhead - fulfilment` in one line for the project-blended cost model. `applyOverhead` (`src/lib/profit/overhead.ts:32-50`) computes the per-channel equivalent — `contributionProfit = grossProfit - allocatedOverhead - fulfilmentCost`, with `cost` subtracted separately into the summary's `unprofitableCount` test — using different field names for the same concepts (`overhead` vs `allocatedOverhead`, `fulfilment` vs `fulfilmentCost`, and `profitMargin` has no counterpart at all on the channel side). Both are the same "fully-loaded net profit" formula at two different granularities (one project-blended figure vs one figure per channel), independently coded and independently named.
- **Root cause**: The A3 cost-model engine (report-level, persisted) and the #5 overhead-allocation engine (channel-level, live-editable) were built in separate features with separate vocabularies, and nothing forced them to share the underlying arithmetic.
- **Impact**: A bug fix or refinement to the overhead/fulfilment math (e.g. how proration or rounding works) has to be independently re-derived and re-verified in both files; the mismatched field names (`overhead`/`allocatedOverhead`, `fulfilment`/`fulfilmentCost`) make it harder to even recognize the two as the same computation during review.
- **Fix sketch**: Extract a shared pure function, e.g. `netProfitAfterCosts({ revenue, cost, marginPct, overheadForPeriod, perOrderCost, conversions })` returning `{ grossProfit, overhead, fulfilment, netProfit, poas }`, and have `periodProfit` (`cost-model/compute.ts`) call it directly for the blended figure, and `applyOverhead`'s row loop (`profit/overhead.ts`) call it per channel with `overheadForPeriod = allocatedOverhead` (already revenue-share-allocated) — aligning field names in the process.
- **Build risk**: `periodProfit` is currently only reached from server code (`mesicni-report/page.tsx`, `report/recap-context.ts`, the cost-model API route — none are `"use client"`), while `profit/compute.ts`'s family is imported directly by the client component `ProfitModule.tsx`. Both files are already framework-free today (no `node:*`/`server-only` imports), so sharing a pure formula module is safe, but keep the new shared module free of any DB/server import — `tsc --noEmit` will not catch a violation, only `next build` will.

## 4. Cost-model's per-project JSON-blob store duplicates the same pattern used in 8 other domains

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/cost-model/store.local.ts:1-37`
- **Scenario**: `store.local.ts` (SELECT/UPSERT/DELETE a JSON blob by `project_id` against a `cost_model` table) and `store.firestore.ts` (a Firestore doc holding the same JSON-string blob) are structurally identical to `src/lib/report-metrics/store.local.ts` / `store.firestore.ts` (confirmed by direct comparison — same `Row { data: string }` shape, same `INSERT ... ON CONFLICT (project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at` SQL, same try/catch JSON.parse). A repo-wide grep for the same UPSERT fragment turns up the identical pattern in 9 domains total: `twin`, `onboarding`, `organic-channels`, `competitors`, `cost-model`, `local-signals`, `report-metrics`, `project-state`, `catalog`. Constraint #2 excludes flagging local-vs-firestore *parity within one domain*, but this is cross-domain: the same backend-agnostic blob-store logic is copy-pasted nine times over.
- **Root cause**: Each new per-project persisted feature was scaffolded by copying the previous domain's `store.ts`/`store.local.ts`/`store.firestore.ts` trio rather than sharing a generic blob-store primitive.
- **Impact**: Low per-instance risk (the pattern is simple and has stayed consistent), but a genuine fix — e.g. adding a migration path, changing the conflict-resolution semantics, or fixing a `project_id` scoping bug — has to be applied 9 times by hand, and already has begun drifting in naming (`Row` vs `MetricsRow`).
- **Fix sketch**: Add a small generic factory, e.g. `src/lib/db/project-blob-store.ts` exporting `makeLocalBlobStore<T>(table: string)` and `makeFirestoreBlobStore<T>(collection: string)`, each returning `{ get, save, clear }`. Migrate `cost-model/store.local.ts` and `store.firestore.ts` to one-line factory calls as the first, self-contained proof; the same factory would let the other 8 domains collapse the same way as a separate follow-up (out of scope here).

## 5. `ProfitRow.profitable`'s doc comment states the old formula, contradicting all three call sites

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/profit/types.ts:28`
- **Scenario**: The JSDoc on `profitable` reads `/** roas ≥ breakEvenRoas */`, but every implementation that fills this field — `profit/compute.ts:42`, `profit/overhead.ts:64-65`, `profit/products.ts:75-76` — actually uses `netProfit >= 0`, each with its own inline comment explaining why (a zero-cost/organic channel would otherwise read as a false loss under the ROAS test). The type-level doc was never updated to match.
- **Root cause**: The formula changed after the type was authored (or the two were written out of sync); the override rationale only lives in the three call sites, not on the field it documents.
- **Impact**: Low — cosmetic, but a developer skimming `ProfitRow`'s shape (the more likely first stop than three separate compute files) gets the wrong mental model of what `profitable` means, and could "fix" a future implementation to match the stale doc instead of the intended `netProfit ≥ 0` rule.
- **Fix sketch**: Update the comment at `profit/types.ts:28` to `/** netProfit ≥ 0 — not roas ≥ breakEvenRoas, so a zero-cost channel isn't a false loss (see profit/compute.ts) */`.
