# Finance: LTV, Profit, Spend & Client Reporting

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `ProfitModule` reads localStorage inside `useState` lazy initializers → SSR/hydration mismatch for any user with saved data

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/app/modules/ProfitModule.tsx:448`
- **Scenario**: `ProfitModule` is a `"use client"` component, so Next.js server-renders it to HTML on first load. Two pieces of state are seeded straight from localStorage in lazy `useState` initializers: `useState<Record<string, RealOverride>>(() => loadReal(projectId))` (line 448) and `useState<MarginScenario[]>(() => loadScenarios(projectId))` (line 534). `loadReal`/`loadScenarios` return `{}`/`[]` on the server (`typeof window === "undefined"` guard, lines 300 & 371), but on the client the initializer runs against real localStorage. For any user who has saved a margin scenario or entered a real-numbers override, the **first client render differs from the server HTML**: the server emitted zero scenario pills / an empty override input, the client's first render emits N pills and a pre-filled revenue/spend field. React 19 detects the mismatch, logs a hydration error, and discards the server-rendered subtree.
- **Root cause**: the wrong assumption that a lazy `useState` initializer is a safe place to read a browser-only store in an SSR'd client component. The codebase's own `useAiTool` documents the correct pattern in a long comment (`src/components/ai/useAiTool.ts:115-149`): "Hydrating from localStorage after mount … in an effect (rather than a lazy useState initializer) is what keeps the server render and the first client render identical." `ProfitModule` violates exactly that rule for both stores.
- **Impact**: console hydration errors on every profit-page load for returning users; React tears down and re-renders the SSR'd markup (visible flash of the scenario strip / override field), and in strict setups a hydration error can blank the module. Silent for demo/first-time users, which is why it survives casual testing.
- **Fix sketch**: initialize both to the empty default (`useState<…>({})` / `useState<…>([])`) and hydrate in a `useEffect(() => { setRealByPeriod(loadReal(projectId)); setScenarios(loadScenarios(projectId)); }, [projectId])`, mirroring the effect-restore already used in `useAiTool`. The existing persist-on-change `useEffect`s (lines 538-554) then keep writing through unchanged.

## 2. `CompetitorEditor` uses the array index as React key on a list it re-indexes inside `onChange` → editing a middle row corrupts an adjacent one

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/CompetitorEditor.tsx:64`
- **Scenario**: `names` renders one `<input key={i}>` per entry (line 136). `setAt` (lines 59-68) filters blanks out of the middle of the array on every keystroke: `next.filter((n, idx) => n.trim() || idx === next.length - 1)`. Reproduction with `names = ["Alpha","Beta",""]`: focus the first input and clear it to remove "Alpha". `setAt(0,"")` builds `["","Beta",""]`; the filter drops index 0 (blank, not last) → `["Beta",""]`. Because the key is the array index, React keeps the DOM node at position 0 and just swaps its value — the field the user was editing (and still has the caret in) now displays **"Beta"**. Continuing to type overwrites Beta's name.
- **Root cause**: index-as-key on a list whose indices shift during the same event that edits it; the "collapse blanks" filter reorders entries out from under the controlled inputs.
- **Impact**: silent data corruption of the competitor set that feeds the AI recap's "vs. the market" grounding — a user trying to delete one rival can rename a different one. Recoverable but confusing, and the wrong names propagate into the saved competitor list on Save.
- **Fix sketch**: give each row a stable id (generate `{ id, name }` objects, key on `id`), OR stop reindexing during edit — keep blanks in place while typing and only compact on blur/save (`names.map((n)=> n.trim()).filter(Boolean)` already runs in `save()`, so the live filter is redundant).

## 3. `ProfitModule.applyToReport` never calls `router.refresh()` → the "sync to report" strip contradicts its own "Saved ✓"

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/modules/ProfitModule.tsx:515`
- **Scenario**: `applyToReport` POSTs the blended margin + overhead to `/api/projects/${projectId}/cost-model` and, on success, only sets `setApplyState("done")` (line 527). It does **not** `router.refresh()`. The `costModel` prop therefore stays at its server value (`null` for a first-time save), so immediately after a successful save the status strip still renders the gray `reportSyncInactive` copy ("Use this margin & overhead in the monthly report so it computes true profit after costs"), the button still reads "Use in report" (not "Update report", line 682), and the overhead `useState` seed (lines 483-488, keyed off `costModel`) is never re-derived — all while the transient green "Saved to report ✓" is shown next to them.
- **Root cause**: the mutation succeeds server-side but the component doesn't invalidate the RSC data it derives its "synced?" UI from. The sibling `CostModelEditor` does this correctly — it calls `router.refresh()` after its own POST to the same endpoint (`CostModelEditor.tsx:79`).
- **Impact**: success theater / contradictory state — the module tells the user both "saved" and "not yet synced" at once, and a follow-up edit re-seeds overhead from stale `null` defaults (120 000 / 60) instead of the values just saved. Self-corrects only on a full reload.
- **Fix sketch**: `router.refresh()` after `res.ok` in `applyToReport` (add `useRouter` as `CostModelEditor` already does), so `costModel` re-fetches and the strip/button/overhead-seed reflect the saved model.

## 4. `budgetOverride` leaks across period switches → the reallocation simulator projects a budget from the wrong period

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/ProfitModule.tsx:504`
- **Scenario**: `budget = budgetOverride ?? summary.cost` (line 505) and `budgetOverride` is plain state (line 504) that is **not** reset when `period` changes (`setPeriod`, line 616). Reproduction: on the 90-day view, type a manual total budget of 800 000 into the "What if" simulator, then switch to the 30-day view. `budgetOverride` is still 800 000, but the 30-day channel rows total a much smaller spend, so `reallocateBudget` runs the 30-day mix against the 90-day budget (capped at 3× each channel's today spend) and the "Projected net profit" / per-channel proposal are computed against a budget that belongs to a different period.
- **Root cause**: a per-period control (`budgetOverride`) held as period-independent state; `period` is not in a reset path for it (unlike the derived `real`/`summary` values that recompute from `period`).
- **Impact**: a misleading reallocation proposal and profit-delta after a period switch until the user notices the "Current" reset chip (which does appear, line 1221) and clicks it. No persisted/money-moving effect — the plan is advisory.
- **Fix sketch**: reset `budgetOverride` to `null` when `period` changes (either `onClick={() => { setPeriod(p); setBudgetOverride(null); }}` or a `useEffect(() => setBudgetOverride(null), [period])`), so the simulator always defaults to the selected period's actual cost.

## 5. The cost-model status strip + POST is duplicated between `CostModelEditor` and `ProfitModule` (new — prior report flagged only the prop TYPE)

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/app/modules/ProfitModule.tsx:659`
- **Scenario**: two components render the same "cost-model synced?" strip and POST the same shape to the same endpoint. `CostModelEditor.tsx:100-102` builds an active/inactive strip whose active copy is `"Profit after costs · margin {m} · overhead {o}/mo · {f}/order"`; `ProfitModule.tsx:659-685` builds a visually identical strip whose active copy is `"The monthly report computes profit from these (margin {m} · overhead {o}/mo · {f}/order)."` — the same `margin {m} · overhead {o}/mo · {f}/order` fragment, the same `bg-positive-soft/bg-canvas` toggle, and both `fetch("/api/projects/${projectId}/cost-model", { method: "POST", body: JSON.stringify({ grossMarginPct, monthlyOverhead, perOrderCost }) })` (ProfitModule lines 518-526, CostModelEditor lines 67-74). The 2026-07-09 report's finding #4 covered only the duplicated `CostModelView` **type**, explicitly ("No other change needed — the object shape is already identical"); the strip UI + POST duplication is not in that report.
- **Root cause**: `ProfitModule` grew its own "apply to report" affordance in parallel with `CostModelEditor` instead of reusing a shared cost-model-write helper/strip, so the endpoint contract and the status-copy fragment are now maintained in two places.
- **Impact**: low — but a change to the cost-model POST body or the "margin · overhead · per-order" message must be made twice, and (see finding #3) the two copies have already drifted in behavior (`CostModelEditor` refreshes after POST, `ProfitModule` does not).
- **Fix sketch**: extract a `postCostModel(projectId, { grossMarginPct, monthlyOverhead, perOrderCost })` helper (e.g. `src/lib/cost-model/client.ts`) that both call, and factor the shared active/inactive strip copy into one place; wire `ProfitModule`'s `applyToReport` through it (which also naturally fixes #3's missing refresh).
