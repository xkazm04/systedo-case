# Inventory & Warehouse Sync

> Context #38 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 1, Medium: 2, Low: 1)
> Files read: 23

## 1. Inventory action-plan's guardrail policy has drifted from the ad-ops control-plane it claims to reuse

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/lib/inventory/action-plan.ts:60-98`
- **Scenario**: `buildActionPlan` computes `withinGuardrails` against a hand-rolled `INVENTORY_POLICY = { maxMoveAmountCzk: 50_000, maxMoves: 5 }` (line 62), and the module's own doc comment says: *"Reuse the ad-ops control-plane guardrail shape so the inventory plan is governed by the same policy as campaign moves."* But the actual canonical policy lives in `src/lib/campaigns/control-plane-types.ts:18` — `DEFAULT_POLICY = { maxMoveAmountCzk: 50_000, maxMoves: 3 }` — enforced there via `checkPolicy()` (lines 71-84), which blocks `approveChangeSet` unless a human explicitly overrides (`GuardrailError`, `control-plane.ts`). The CZK cap matches (50 000) but `maxMoves` doesn't: 5 here vs. 3 there. `InventoryBudgetActions.tsx` renders `plan.withinGuardrails` as a "V mezích pojistek" / "Mimo pojistky" (within/outside guardrails) badge the user sees *today*, and its own footnote promises a live apply "projde ad-ops control plane s pojistkami" (routes through the ad-ops control plane with guardrails) — i.e. the same 3-move cap. A 4- or 5-move plan is shown as "within guardrails" here but would be rejected (or need an override) by the real control plane.
- **Root cause**: The policy was copied as a literal instead of imported, and the copy was hand-tuned (5 vs 3) without updating the source of truth or the comment that promises parity.
- **Impact**: The badge a merchant relies on to decide whether a plan is safe to apply is computed against a laxer rule than the one that will actually gate the money movement — a two-implementations-disagree correctness landmine, exactly where the code's own comment says there should be one implementation. Today's apply path is simulated (no live spend moves yet per the component's header comment), so the immediate blast radius is a misleading UI badge, not a live money-safety bug — but it becomes a live bug the moment the "real apply" mentioned in both files' comments is wired up, unless this is fixed first.
- **Fix sketch**: In `action-plan.ts`, drop the local `INVENTORY_POLICY` literal and import `DEFAULT_POLICY`/`checkPolicy`/`ControlPolicy` from `src/lib/campaigns/control-plane-types.ts`. Replace the ad hoc `withinGuardrails` boolean with `checkPolicy(...).length === 0` (adapting the `amount`/`amountCzk` field-name mismatch between `campaigns.BudgetMove` and `inventory.BudgetMove`), so `InventoryActionPlan` is checked against the exact same `ControlPolicy` the campaigns control plane enforces. Optionally surface the returned violation strings instead of the current binary badge.
- **Build risk**: `action-plan.ts` is imported directly by the `"use client"` component `src/components/app/modules/InventoryBudgetActions.tsx`. Before importing from `campaigns/control-plane-types.ts`, verify that file's transitive imports (`./simulate` → `./types`) stay free of `server-only`/`node:*` — a quick read shows they currently are, but this must be re-checked at fix time since `tsc --noEmit` won't catch a violation, only `next build` will.

## 2. `warehouseSnapshot()` / `WarehouseSnapshot` are dead — every real call site already reimplements the shape by hand

- **Severity**: High
- **Category**: dead-code
- **File**: `src/lib/inventory/warehouse.ts:66-72,143-146`
- **Scenario**: The module's header comment presents `warehouseSnapshot` as the real-integration entry point ("`warehouseSnapshot` calls the provider API ... Here both return a deterministic demo snapshot"), and it's exported. A repo-wide grep for `warehouseSnapshot`/`WarehouseSnapshot` finds only its own definition and doc comment — zero importers anywhere in `src/`. The two pages that actually need `{connection, skuCount}` (`src/app/app/[projectId]/sklad-sezonnost/page.tsx:47` and `src/components/demo/DemoModule.tsx:239`) construct it inline as `<WarehouseSourceBar connection={connection} skuCount={products.length} />`, where `products` comes from `loadProductsFor`/`productsFor` (the project's real catalog) — not from `warehouseCatalog(now)`, which is the only source `warehouseSnapshot()` knows how to use. The function was superseded when call sites moved to the real per-project catalog instead of the canned demo catalog, and nobody deleted it.
- **Root cause**: An early "Direction 2" prototype helper was written to assemble the snapshot, then the two consumers evolved to source `products` from the actual project catalog rather than the generic `warehouseCatalog()`, making the helper's fixed signature unusable without a rewrite — so callers quietly stopped calling it instead of updating it.
- **Impact**: A future dev fixing "the real integration" (as the file's own comment invites) will likely reach for `warehouseSnapshot` assuming it's live, not realizing it's dead and the two real call sites hand-roll the equivalent object today — wasted investigation time, and a second place to forget to update if the snapshot shape changes.
- **Fix sketch**: Delete `warehouseSnapshot` (lines 143-146) and the `WarehouseSnapshot` interface (lines 66-72) from `src/lib/inventory/warehouse.ts`; update the header comment's reference to it. If a shared assembler is still wanted, change its signature to accept `products: Product[]` (instead of internally calling `warehouseCatalog(now)`) and have the two call sites use it — but plain deletion is the safe, zero-risk minimal fix since nothing imports it.

## 3. Provider registry is defined twice with independently-maintained id/label pairs

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/inventory/warehouse.ts:33-52`
- **Scenario**: `WAREHOUSE_PROVIDERS` (here) lists `baselinker`/`shipmonk`/`skladon`/`pohoda`/`money-s3`/`helios` with `label`, driving the connector picker in `WarehouseSourceBar.tsx`. The overlapping `SYNC_PROVIDERS` in `src/lib/inventory/providers.ts:43-53` redefines the same six ids with the same six labels (plus `demo`/`erp`/`erp-demo`, which have no `WAREHOUSE_PROVIDERS` counterpart), driving the real sync picker in `CatalogManagerModule.tsx` and the gating logic in `src/app/api/projects/[id]/warehouse/route.ts`. The labels happen to match today (e.g. both say `"Money S3"`, both say `"HELIOS"`), but they're two hand-maintained arrays with no shared source — nothing enforces they stay in sync.
- **Root cause**: `warehouse.ts` (Direction 2, connector-picker UI/prototype) and `providers.ts` (the real sync-execution registry with `needsToken`/`implemented` flags) were built for different call sites and each needed an id→label lookup, so each got its own array instead of sharing one.
- **Impact**: Renaming a provider (e.g. "Money S3" → "Money S3 Cloud") or adding a 7th real ERP requires remembering to update both files; a partial update silently shows a stale label in one of the two UIs with no compiler or test signal.
- **Fix sketch**: Extract a single `{ id, label }[]` (or a `Record<string, string>`) as the base provider catalog — e.g. in `providers.ts` since it already owns `SyncProviderMeta` — and have `WAREHOUSE_PROVIDERS` in `warehouse.ts` build its `WarehouseProviderMeta[]` by mapping over that base list and merging in the display-only fields (`kind`, `mark`, `blurb`, `blurbEn`) that only the connector picker needs.

## 4. `SKU_AD_CHANNELS` is a third hand-copied list of the same Czech marketplace channels

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/inventory/action-plan.ts:19-29`
- **Scenario**: `SKU_AD_CHANNELS` hardcodes `["Google Nákupy", "Sklik", "Zboží.cz", "Heureka", "Meta"]` (with a `cz` flag used for styling in `InventoryBudgetActions.tsx:216-227`). The first four names are byte-identical to two other hardcoded lists elsewhere in the codebase: `ESHOP_CHANNELS` in `src/lib/catalog/seeds.ts:21` and the inline `online` array in `src/lib/catalog/starter.ts:30`, both `["Google Nákupy", "Zboží.cz", "Heureka", "Sklik"]`. Three independent copies of "the Czech e-shop marketplace roster" now exist; `action-plan.ts`'s copy additionally requires per-channel `cz` metadata the other two don't carry.
- **Root cause**: Each module (catalog seeding, catalog starter, inventory action-plan) needed "the channel list" for a slightly different purpose (offering `channels: string[]` vs. a styled `AdChannel[]`) and each just inlined the Czech names rather than deriving from one place.
- **Impact**: Adding or renaming a marketplace (e.g. a future "Mall.cz") means touching three unrelated files across two modules to stay consistent; today they already agree only by coincidence, not by construction.
- **Fix sketch**: Promote a single `CZ_MARKETPLACE_CHANNELS = ["Google Nákupy", "Zboží.cz", "Heureka", "Sklik"]` constant to a small shared module both `catalog/*` and `inventory/action-plan.ts` can import (e.g. alongside `OfferingSource`/`OfferingNature` in `src/lib/catalog/offering.ts`, which `providers.ts` already imports from). In `action-plan.ts`, build `SKU_AD_CHANNELS` by mapping that shared array to `{ name, cz: true }` and appending the two channels the shared list doesn't cover (`"Google Nákupy"` already present with `cz: false`, plus `"Meta"` with `cz: false`).

## 5. Redundant double SKU coercion in `mapErpRows`

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/inventory/erp.ts:119`
- **Scenario**: `const sku = str(cell(mapping.sku)).trim() || String(cell(mapping.sku) ?? "").trim();` calls `cell(mapping.sku)` twice and computes two coercions of the same value. The left branch (`str(...)`, which only accepts an already-`string` value, else `""`) is a strict subset of the right branch (`String(v ?? "")`, which also stringifies numeric SKUs from a CSV/JSON export) — for every input where the left branch is truthy, the right branch would compute the exact same trimmed string. The left branch only exists to be discarded whenever `cell(mapping.sku)` is a number, which is precisely the case the right branch was added to handle.
- **Root cause**: A numeric-SKU fallback (`String(cell(...) ?? "")`) was appended with `||` instead of replacing the original `str(...)`-based expression, leaving the original half live but functionally inert.
- **Impact**: Purely a readability/maintenance nit — a future reader has to work out that the first half never changes the result, and every row pays for an extra `cell()` call and string alloc. No behavior risk either way.
- **Fix sketch**: Replace the line with `const sku = String(cell(mapping.sku) ?? "").trim();` — identical output for string, numeric, and missing SKU values, one `cell()` call instead of two.
