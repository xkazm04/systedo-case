# Campaign performance & ads operations modules

> Context #32 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 3, Low: 0)
> Files read: 20

## 1. Hoist the "illustrative sample data" gutter note into `ModulePage`

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/app/[projectId]/vykon/page.tsx:17-19`
- **Scenario**: The identical 3-line block `<div className="mb-5"><SampleDataNote /></div>` is hand-copied unconditionally at `zisk/page.tsx:67-69`, `ltv/page.tsx:19-21` and `kvalita-leadu/page.tsx:14-16`, and conditionally (`{!isLive && (...)}`) at `spotreba/page.tsx:22-26` and `aktivita/page.tsx:25-29` — 6 of this context's 10 pages. Repo-wide the same block appears in 10 more pages outside this context (`schranka`, `lokalni`, `produktova-kreativa`, `recenze`, `obsah-plan`, `srovnani-seo`, `publikum`, `experimenty-lp`, `distribuce`, and others). `src/components/demo/DemoModule.tsx:122-131` even has its own private `noted(children)` helper that wraps this exact pattern for the public demo mirror, but it is local to that file — none of the 16 real `page.tsx` call sites use anything like it.
- **Root cause**: `ModulePage` (`src/components/app/ModulePage.tsx`), the shared frame every one of these routes renders into, has no slot for this recurring banner, so each page author re-derives the wrapper `div` by hand.
- **Impact**: 16 independent copies of one styling decision (`mb-5` spacing, when to show it); a future tweak (spacing, wording trigger, always-vs-conditional) needs coordinated edits across 16 files, and it's easy to miss the two conditional (`!isLive`) variants specifically since they're structurally different from the other 14.
- **Fix sketch**: Add an optional slot to `ModulePage` (e.g. `sampleNote?: React.ReactNode`) that renders the `mb-5` wrapper once, above `children`, when passed. Migrate the 6 in-context call sites (and opportunistically the other 10) to pass it instead of inlining the div; retire `DemoModule.tsx`'s private `noted()` helper in favor of the same prop.
- **Build risk**: none — `ModulePage` and every call site listed are server components (no `"use client"`).

## 2. `CostModelView`/`CostModel` narrowing duplicated three ways — one copy already drifted

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/app/[projectId]/zisk/page.tsx:77-81`
- **Scenario**: The exact 3-field pick `{ grossMarginPct: costModel.grossMarginPct, monthlyOverhead: costModel.monthlyOverhead, perOrderCost: costModel.perOrderCost }` is re-typed verbatim in `src/app/app/[projectId]/mesicni-report/page.tsx:143`. On the receiving end, `src/components/app/modules/ProfitModule.tsx:431` re-declares the same 3-field shape as an unnamed inline object type — even though that exact shape already exists as a named, exported interface, `CostModelView` (`src/components/app/modules/CostModelEditor.tsx:11-15`), which `MonthlyReport.tsx:81` already imports and reuses correctly.
- **Root cause**: `getCostModel()` (`src/lib/cost-model/store.ts`) returns the 4-field `CostModel` (adds `updatedAt`); each client module only needs 3 of them, and nobody generalized the "narrow it" step — the report page independently discovered and reused `CostModelView`, the profit page didn't.
- **Impact**: this is not hypothetical drift, it's proven — `ProfitModule.tsx` already diverged from the pattern `MonthlyReport.tsx` uses one file over. If `CostModel` gains a field, one of the two page-level picks (`zisk/page.tsx` or `mesicni-report/page.tsx`) can be forgotten silently — no compiler error, just a report/module quietly showing a different cost model than its sibling.
- **Fix sketch**: Add a pure `toCostModelSummary(m: CostModel | null): CostModelView | null` mapper (import `CostModelView` from `CostModelEditor.tsx`, or promote that interface into `src/lib/cost-model/types.ts` next to `CostModel`). Call it from both `zisk/page.tsx` and `mesicni-report/page.tsx`; change `ProfitModule.tsx:431`'s prop type from the inline literal to `CostModelView | null`.
- **Build risk**: `src/lib/cost-model/types.ts` currently has zero imports, which is why the "use client" `ProfitModule.tsx`/`MonthlyReport.tsx` can safely import a type from it. Keep the new mapper in `types.ts` (or another import-free file) — do not add it to `store.ts`/`store.local.ts`/`store.firestore.ts`, which pull `node:sqlite`/Firestore per the dual-store dispatcher pattern; a client import of those would break `next build` without tripping `tsc`.

## 3. Live-or-sample fallback block duplicated between Aktivita and Spotřeba

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/aktivita/page.tsx:19-29`
- **Scenario**: `spotreba/page.tsx:16-26` runs the identical shape: await a `liveXForProject(...)` server-only lookup, compute `isLive = live.length > 0`, ternary into the render data against the sample fallback, then conditionally render the `SampleDataNote` gutter with `{!isLive && (...)}` before passing `isLive` down to the client module.
- **Root cause**: `liveSpendForProject` (`src/lib/spend/live.ts`) and `liveActivityForProject` (`src/lib/activity/live.ts`) are both built to the same documented convention — "returns `[]` … which the page treats as fall back to the seed" — but no shared page-level helper encodes that convention, so each page re-derives it by hand.
- **Impact**: small blast radius today (2 sites, ~6 lines each, character-for-character identical), but it's exactly the kind of pattern a third live-data module would triple; any tweak to the fallback rule (e.g. a minimum live-row threshold before trusting "live") needs to land in both places or they silently diverge.
- **Fix sketch**: Add a small generic helper, e.g. `resolveLiveOrSample<T>(live: T[], sample: T[]): { entries: T[]; isLive: boolean }`, in a new `src/lib/live/resolve.ts`; use it in both `aktivita/page.tsx` and `spotreba/page.tsx`. Pairs naturally with Finding 1's `sampleNote` prop so the `{!isLive && <SampleDataNote/>}` half collapses too.
- **Build risk**: none — plain synchronous helper; both call sites are already server components.

## 4. Kampaně's translation block hand-mirrored into `DemoModule.tsx`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/kampane/page.tsx:10-17`
- **Scenario**: This exact `T` object — both the `cs.desc` and `en.desc` strings, including the `{focus}` placeholder — is redefined as `KAMPANE_T` in `src/components/demo/DemoModule.tsx:105-112`, byte-for-byte identical.
- **Root cause**: `DemoModule.tsx`'s header comment explains it "mirrors each authed module page's data-prep… kept in one file so the 22 real module pages… stay untouched" — a deliberate choice to keep the public demo dispatcher self-contained, but it went as far as hand-copying the translation strings instead of importing them.
- **Impact**: the Kampaně module description now has two independently-editable sources. A copy change to one (wording fix, updated `{focus}` sentence) silently leaves the public demo page showing the old text, with no compiler signal that they've diverged.
- **Fix sketch**: Export `T` from `kampane/page.tsx` (or hoist it into a small shared copy module, e.g. `src/lib/i18n/copy/kampane.ts`) and have `DemoModule.tsx` import it in place of its local `KAMPANE_T`.
- **Build risk**: none — both files are server components with no client boundary involved.

## 5. Profit period/granularity maps hand-mirrored into `DemoModule.tsx`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/zisk/page.tsx:16-22`
- **Scenario**: Both `PERIOD_DAYS` (`{"30":30,"90":90,"365":365}`) and `TREND_GRANULARITY` (`{"30":"week","90":"week","365":"month"}`) are redefined verbatim as module-level consts in `src/components/demo/DemoModule.tsx:96-101`, whose own comment — "Profit / inventory period windows (mirrors the authed zisk + sklad pages)" — acknowledges the mirroring.
- **Root cause**: same as Finding 4: `DemoModule.tsx` intentionally stays self-contained rather than importing from the 22 real pages, but copies the literal values instead of the source of truth.
- **Impact**: the period/granularity mapping has two sources of truth; adding a period option or changing which periods bucket weekly vs monthly requires editing both files, and the demo copy is the one nobody will remember to update when the real page changes.
- **Fix sketch**: Export `PERIOD_DAYS`/`TREND_GRANULARITY` from `zisk/page.tsx` (or move them into `src/lib/profit/trend.ts`, next to `ProfitTrendPoint`/`TrendGranularity`), and have `DemoModule.tsx` import them instead of keeping its own copies.
- **Build risk**: none — both files are server components with no client boundary involved.
