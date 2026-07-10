# Catalog, Inventory, Audience & Distribution

> Total: 5
> Critical: 0 · High: 1 · Medium: 1 · Low: 3
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

_Note on the prior report: findings #1 (clipboard-fallback duplication in DistributionModule) and #3 (dead `valueProtected`/`totalShifted`/`policy` on `InventoryActionPlan`) have since been fixed — DistributionModule now uses `useCopyFeedback`, and `InventoryActionPlan` is trimmed to `{ actions, withinGuardrails }`. Prior #2 (channel-name drift) and #4/#5 (sparkline/type dedup) still stand but are NOT restated here._

## 1. Manually-added catalog rows get a remount-unstable id, so a re-opened Katalog collides ids and edits/removes two rows at once

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/CatalogManagerModule.tsx:430`
- **Scenario**: `add()` mints a new offering id from an in-memory counter: `const n = ++nextId.current` (line 428) → `id: ` `${projectId}:new-${n}` (line 430), where `nextId = useRef(0)` (line 240) resets to 0 on every mount. The validator preserves the client id verbatim (`src/lib/catalog/validate.ts:53`: `id: str(raw.id, 128) || …fallback`), so a saved row keeps `p1:new-1`. Repro (authed / `persistable`): (1) Add a product → id `p1:new-1`; (2) fill it in, click Save (persists that id); (3) reload the page (or navigate away and back) — `offerings` now contains `p1:new-1`, `nextId` is back to 0; (4) click Add → `n=1` → id `p1:new-1` again. Two rows now share one id. `update(id, …)` maps by `o.id === id` (line 421) and `remove(id)` filters by `o.id !== id` (line 424), so editing or deleting either row hits BOTH; the grouped `.map` keys (`key={o.id}`) also collide, corrupting React's reconciliation.
- **Root cause**: uniqueness is derived from a counter whose lifetime (per mount) is shorter than the id's lifetime (persisted), and nothing seeds the counter from existing ids.
- **Impact**: silent state corruption on a routine flow (add → save → return → add) — a user edits/deletes a product and a *different* product changes with it; data can be lost on the next Save.
- **Fix sketch**: make the id collision-resistant instead of counter-based — `crypto.randomUUID()` (e.g. `id: ` `${projectId}:new-${crypto.randomUUID()}`), or seed `nextId` from the current max `new-N` across `offerings` on mount. Do not depend on the mount-local counter for a value that persists.

## 2. Warehouse connect / feed-import / sync failures render nothing when the error has no `error` string (silent failure)

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/modules/CatalogManagerModule.tsx:818`
- **Scenario**: The failure banner is gated on a *specific* error string existing: `{importInfo?.error !== undefined && importState === "error" && ( … {t("importFailed")} … )}` (line 818). But two failure paths set `importState = "error"` with `error` left `undefined`: `connect()`'s network catch — `setImportInfo({ error: undefined })` (line 360) — and `submitImport()`'s network catch — `setImportInfo({ error: undefined })` (line 405); a non-OK response whose JSON lacks an `error` field (`setImportInfo({ error: j?.error })`, lines 356/394) also yields `undefined`. In all these cases `importInfo?.error !== undefined` is false, so even the generic "Import failed" / "Uložení selhalo"-style message is suppressed. Repro: with the network offline, open the import panel, click **Connect** (or **Import**/**Sync**) → `connBusy`/`importState` flip back and the UI shows nothing at all; the user believes nothing happened.
- **Root cause**: the presence of a *detail* string is conflated with the presence of a *failure* — the generic error message is coupled to `importInfo.error` being non-undefined instead of to `importState === "error"`.
- **Impact**: a real authed user connecting a Baselinker/ERP warehouse (or importing a feed) gets zero feedback on the most common failure (network drop / errorless 5xx), and may retry blindly or assume success.
- **Fix sketch**: gate the banner on `importState === "error"` alone and render `t("importFailed")` unconditionally, appending `: ${importInfo.error}` only when a detail exists — i.e. drop the `importInfo?.error !== undefined &&` guard on line 818.

## 3. Audience revenue-goal ETA projects revenue by the *subscriber* growth rate and labels it as revenue's own growth

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/AudienceModule.tsx:244`
- **Scenario**: `goalProgress(funnel, s, goals, subGrowth)` (line 244) passes one growth fraction — `subGrowth = subTrend?.momGrowth ?? 0` (line 243), the *subscriber* MoM growth — to `goalProgress`, which applies it to BOTH goal lines. For the revenue line, `goalProgress` computes `etaMonths = ln(target/current)/ln(1+subGrowth)` (`src/lib/audience/compute.ts:313`) and the UI then renders `t("goalEta", { …, growth: fmt.fmtSignedPct(subGrowth) })` (line 567) under the "Monthly revenue" goal. So the revenue goal claims "est. N months at +X% growth" where X is the subscriber growth, and the ETA compounds revenue at a rate that has nothing to do with revenue. If subscribers grow 8%/mo while revenue is flat, the revenue goal still shows a finite, optimistic ETA "at +8%".
- **Root cause**: a single `subGrowth` is reused for two independent metrics; there is no revenue MoM series, so subscriber growth is silently substituted and then displayed as the revenue growth rate.
- **Impact**: a misleading (success-theater) revenue ETA/growth figure on the goal tracker; illustrative-data module, so low blast radius, but the number is presented as fact.
- **Fix sketch**: pass a per-line growth rate into `goalProgress` (subscriber growth for the subscriber line; a revenue-derived growth — e.g. from a monthly-revenue series or `rpm × active` trend — for the revenue line), or suppress the revenue ETA/growth label when no revenue growth signal exists rather than borrowing the subscriber rate.

## 4. Branding logo placeholder hardcodes a Czech string, leaking "— nahraný soubor —" into the English UI

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/BrandingModule.tsx:185`
- **Scenario**: After an uploaded logo (a `data:` URL), the URL text field is disabled and its placeholder is `logo.startsWith("data:") ? "— nahraný soubor —" : t("logoPlaceholder")` (line 185). The `"— nahraný soubor —"` literal is not routed through `t()` and has no `en` entry in the `T` dictionary (lines 13–34, which localizes every other string). Repro: switch the app to English, open Branding, upload a logo file → the disabled field shows Czech "— nahraný soubor —" in an otherwise-English screen.
- **Root cause**: a user-visible string was inlined instead of added to the `T.cs`/`T.en` catalogs like every sibling label in the file.
- **Impact**: cosmetic i18n leak (Czech text in the EN locale), minor but user-visible and inconsistent with the module's own translation contract.
- **Fix sketch**: add `uploadedFile: "— uploaded file —"` / `"— nahraný soubor —"` to `T.en`/`T.cs` and use `t("uploadedFile")` on line 185.

## 5. Catalog asset-group "Copy all" silently no-ops when the clipboard is unavailable

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/modules/CatalogModule.tsx:146`
- **Scenario**: `ExportActions.copyAll` (lines 141–149) awaits `navigator.clipboard.writeText(...)` and sets the "Copied" tick only on success; the `catch { /* clipboard unavailable */ }` (line 146) swallows every failure with no user feedback and no fallback. In an insecure context (`http://`, some embedded webviews) or when the Clipboard API is blocked, `navigator.clipboard` is undefined / rejects, so clicking **Copy all** does nothing and shows nothing — no tick, no error, no `execCommand` fallback. Notably the rest of the codebase (DistributionModule, per prior report #1's fix) now routes copy through the shared `useCopyFeedback` hook; this hand-rolled path was left behind.
- **Root cause**: the copy path assumes `navigator.clipboard` always resolves and treats any rejection as a no-op instead of surfacing it or falling back.
- **Impact**: on the authed Katalog / Google Ads asset export, users in an insecure/restricted context click "Copy all" and get nothing, with no signal that it failed — they may paste stale clipboard content into Google Ads Editor.
- **Fix sketch**: route this button through the shared `useCopyFeedback` hook (already used by DistributionModule) which owns the fallback + feedback, or at minimum surface a failure state (e.g. a "Copy failed" label) in the `catch` instead of swallowing it.
