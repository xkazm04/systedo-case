# Campaigns / Ad Ops Control Plane

> Context #10 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 3, Low: 1)
> Files read: 21

## 1. The same busy/error fetch-action skeleton is hand-copied ~8 times

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/campaigns/ControlPlane.tsx:106-124`
- **Scenario**: `ControlPlane.tsx`'s `act()` (106-124), `AdsAccountPicker.tsx`'s `act()` (118-134), `BudgetMoves.tsx`'s `apply()` (120-146), `MicrositeCard.tsx`'s `publish()` (90-110) and `takeOffline()` (112-124), `ReportSettings.tsx`'s `save()` (91-119), `SharedReportsList.tsx`'s `revoke()` (69-81), and `CampaignsClient.tsx`'s `share()` (187-208) all reimplement the identical shape: `setBusy(x)` → `setError(null)` → `try { fetch → res.json() → if (!res.ok) setError(json?.error ?? fallback) } catch { setError(genericServerError) } finally { setBusy(reset) }`. `useCampaigns.ts`'s `sync()`, `analyze()` and `analyzeAll()` follow the same skeleton with per-key state layered on top.
- **Root cause**: Each component was authored independently against the same "call our API route, surface an error, track busy" convention with no shared primitive to reach for, so the boilerplate was retyped every time instead of factored out.
- **Impact**: A change to the convention (e.g. adding a retry affordance, a toast, or distinguishing network vs. 4xx errors) has to be made correctly in ~8 places. It already drifted once: see finding #2, where one of these copies never got its error strings translated to Czech — exactly the kind of divergence copy-pasted code invites.
- **Fix sketch**: Add `src/components/campaigns/useAsyncAction.ts` exporting a small hook (e.g. `useAsyncAction<K extends string | true>()` returning `{ busy, error, run }`, where `run(key, fetcher: () => Promise<Response>, { fallback, onSuccess })` centralizes the try/fetch/json/error/finally logic and supports both the single-boolean-busy call sites and the per-row-key ones). Migrate `ControlPlane.act`, `AdsAccountPicker.act`, `BudgetMoves.apply`, `MicrositeCard.publish`/`takeOffline`, `ReportSettings.save`, `SharedReportsList.revoke`, and `CampaignsClient.share` onto it. Leave `useCampaigns.ts`'s `sync`/`analyze`/`analyzeAll` as a follow-up — they carry extra per-key state-merging logic beyond the busy/error skeleton and are a bigger, separate lift.

## 2. Czech UI shows English error text in BudgetMoves

- **Severity**: Medium
- **Category**: cleanup
- **File**: `src/components/campaigns/BudgetMoves.tsx:46-47`
- **Scenario**: In the `T.cs` (Czech) translation block, `errorFailed: "Action failed."` and `errorServer: "Could not reach the server."` are left in English — verbatim copies of the `en` block's values two lines below (lines 83-84). Every sibling component in this context localizes the identical two keys correctly: `ControlPlane.tsx` uses `"Akce se nezdařila."`/`"Nepodařilo se spojit se serverem."`, as do `AdsAccountPicker.tsx` and (with `errorPublish`) `MicrositeCard.tsx`/`ReportSettings.tsx`. A user on the Czech locale who hits a failed budget-shift or pause apply (`/api/campaigns/apply` returns non-2xx, or the fetch throws) sees English text mid-Czech UI.
- **Root cause**: The `cs` block was almost certainly authored by copying the `en` block as a starting point; every other key was translated but these two were missed.
- **Impact**: Real, user-visible localization bug, though only surfaces on the apply/pause error path (not the happy path), so it's low-frequency but genuine — and matches the codebase's clear expectation (per constraint #4 and every sibling file) that `cs` strings are actual Czech.
- **Fix sketch**: In `BudgetMoves.tsx` lines 46-47, change `errorFailed`/`errorServer` to `"Akce se nezdařila."` / `"Nepodařilo se spojit se serverem."` — the exact strings already used by `ControlPlane.tsx` and `AdsAccountPicker.tsx` for the same keys, so this also incidentally removes a copy divergence.

## 3. `useCampaigns` fetches and threads a `series` field nothing ever reads

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/components/campaigns/useCampaigns.ts:60,75,117,161,265-287`
- **Scenario**: `State.series: DailyPoint[]` (line 60, commented "per-day portfolio totals for the trend chart") is initialized in `EMPTY` (75), repopulated from the API response in both `load()` (117: `series: json.series ?? []`) and `sync()` (161), and re-exported from the hook's return object (272: `series: state.series`). `useCampaigns()` has exactly one call site in the whole repo — `CampaignsClient.tsx:143` — and that destructure (lines 123-143) does not include `series` (it destructures `campaignSeries`, the per-campaign map, but never the portfolio-level `series`). A repo-wide grep for a standalone `series` identifier outside `useCampaigns.ts` and its declared type turns up nothing that consumes it.
- **Root cause**: Looks like a portfolio-level trend chart was planned (the comment says so explicitly) or was removed from `CampaignsClient` at some point, and the data-plumbing side was never cleaned up to match.
- **Impact**: Small but real waste — every `load()`/`sync()` response carries and re-parses an array that's immediately discarded, and it's one more field a future maintainer has to puzzle over ("is this used somewhere I'm missing?").
- **Fix sketch**: Remove `series` from `State`, `EMPTY`, `load()`'s and `sync()`'s state-building objects, and the returned object in `useCampaigns.ts`. Keep the `DailyPoint` type import (still used by `campaignSeries`). The API route that populates `series` server-side is outside this context's file list — flag it to whoever owns `/api/campaigns` as a possible follow-up trim, but that's a separate context's call.

## 4. `CampaignTable` hand-rolls the same localStorage read/write twice

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/campaigns/CampaignTable.tsx:205-262`
- **Scenario**: `loadSort()` (205-218) and `loadFilters()` (239-262) are two separate top-level functions with the same shape — `if (typeof window === "undefined") return DEFAULT`, `try { read localStorage key → JSON.parse → field-by-field validate/fall back } catch { /* corrupt or unavailable */ } return DEFAULT` — differing only in the key and the per-field validation rules. The persistence side has the same duplication: the sort-effect (372-378) and the filters-effect (381-390) are both `useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* non-fatal */ } }, [deps])`, differing only in key and payload shape.
- **Root cause**: Sort and filters were persisted independently as two separate storage slots (reasonable — different keys, different consumers), but the read-with-fallback and write-with-try/catch boilerplate around each wasn't factored into one helper.
- **Impact**: Low immediate risk, but any future change to the persistence contract (e.g. adding the schema-versioning pattern `usePersistedForm.ts` already uses for the AI-tools forms, or handling `QuotaExceededError` specially) has to be applied in four places in this one file instead of one.
- **Fix sketch**: Add a small local helper, e.g. `function loadJSON<T>(key: string, fallback: T, parse: (raw: unknown) => T | null): T` and `function saveJSON(key: string, value: unknown): void`, and rewrite `loadSort`/`loadFilters` as thin callers plus collapse the two persistence `useEffect`s to call `saveJSON`. Keep it local to `CampaignTable.tsx` — `usePersistedForm.ts` (`src/components/ai/usePersistedForm.ts`) is a different pattern (effect-based restore, causes a post-mount flash) that this file's synchronous `useState(loadSort)` initializer deliberately avoids, so reusing it here would change behavior, not just tidy it.

## 5. `Impact` and `SimCell` are the same "before → after" metric cell, styled twice

- **Severity**: Low
- **Category**: duplication
- **File**: `src/components/campaigns/BudgetMoves.tsx:370-392`
- **Scenario**: `BudgetMoves.tsx`'s local `Impact({ label, before, after, good })` (370-392) and `ControlPlane.tsx`'s local `SimCell({ label, before, after })` (257-268) both render a labeled "before vs. after" metric tile inside a `bg-surface` box, used for the exact same kind of data (ROAS/PNO/conversion-value before vs. after a proposed change). They differ only in visual treatment: `Impact` uses a strikethrough `before` plus a color-coded `after` (green when `good`); `SimCell` uses an arrow separator with no color coding.
- **Root cause**: `ControlPlane.tsx` (the governed control-plane simulation UI) was built after `BudgetMoves.tsx` (the deterministic quick-moves panel) and re-invented the same small presentational piece instead of reusing/extending it.
- **Impact**: Cosmetic — two ~15-line leaf components with no logic, low duplication cost, but it's an easy, low-risk consolidation with a small consistency upside (both surfaces would render "before → after" the same way).
- **Fix sketch**: Extract one shared component, e.g. `src/components/campaigns/MetricDelta.tsx`, taking `{ label, before, after, tone?: "positive" | "neutral" }` (or a `variant: "strike" | "arrow"` if the two visual treatments are worth keeping distinct), and have both `BudgetMoves.tsx` and `ControlPlane.tsx` import it instead of defining their own copy.
