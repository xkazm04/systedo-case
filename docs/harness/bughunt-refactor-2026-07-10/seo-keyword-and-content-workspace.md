# SEO, Keyword & Content Workspace

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `draftCopy` writes the AI result through a stale `posts` snapshot — silently reverting (and re-persisting) any edit made while the model was thinking

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/ContentSchedule.tsx:99` (also `:109-137`)
- **Scenario**: `draftCopy(post)` is `async` and awaits `/api/social/draft` — an AI call that routinely takes several seconds (dev Claude 50–90s; see `AI_TIMEOUT_MS`). On resolution it calls `setBody(post.id, copy, true)`. `setBody` (line 99-103) rebuilds state with `const next = posts.map(...)` reading `posts` from the **render closure captured when `draftCopy` was invoked**, not a functional `setPosts(prev => …)`. During the await the user can freely `schedule()` an idea, publish/unschedule a calendar chip (`setStatus`), or edit another post's textarea (`setBody`) — each replaces `posts`. When the draft returns, `setBody` maps over the *old* array, so every interim change is discarded locally **and** `persist(next)` PUTs that stale whole-board snapshot to `/api/projects/{id}/state/content-schedule`, overwriting the server copy too.
- **Root cause**: The mutation helpers assume state is read at call time, but `draftCopy` defers its `setBody` across an async boundary; combined with the "PUT the entire board" persistence model, a stale in-memory array becomes the new source of truth on both client and server. `draftingId` only blocks a *second draft*, not concurrent scheduling/editing.
- **Impact**: Data loss — a scheduled/published post or a hand-typed edit made during an AI draft vanishes from the calendar and is erased from persisted project state on the next save. Non-deterministic and hard to reproduce for the user ("I scheduled it and it disappeared").
- **Fix sketch**: Make all four mutators functional and derive the persisted payload inside the updater: `setPosts(prev => { const next = prev.map(p => p.id===id ? {...p, body} : p); if (persistIt) persist(next); return next; })`. Apply the same `prev =>` pattern to `schedule`/`setStatus`/`setBody` so no handler ever reads the closure `posts`.

## 2. `setStatus` runs a `fetch` side-effect *inside* the `setStatuses` updater — double-fires in Strict Mode and on any render bail/replay

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/app/modules/OrganicChannels.tsx:186`
- **Scenario**: `setStatus` calls `setStatuses((prev) => { const next = …; persist({ statuses: next, … }); return next; })`. The updater passed to a `useState` setter must be pure — React may invoke it more than once for a single logical update (React 18/19 Strict Mode double-invokes updaters in dev; concurrent rendering can discard and replay a render). Because `persist()` issues a `POST /api/projects/{id}/organic-channels` from within the updater, each extra invocation fires an extra network write.
- **Root cause**: A side effect (durable persistence + an activity-feed-emitting write) is embedded in what must be a pure reducer, conflating "compute next state" with "commit to the server."
- **Impact**: Duplicate persistence POSTs (guaranteed in dev Strict Mode on every status toggle; possible in prod under concurrent scheduling), which can double-emit any server-side activity/audit event tied to that endpoint and doubles write load. Silent — nothing surfaces the extra call.
- **Fix sketch**: Compute `next` outside the setter and persist after: `const next = statusOf === 'not-started' ? … ; setStatuses(next); persist({ statuses: next, ...(source==='ai' ? { plan: channels } : {}) });` — or move `persist` into a `useEffect` keyed on `statuses`. Keep the updater pure.

## 3. Lp-variant "Retry" is wired to `reset()`, so it clears the panel to idle instead of re-running the request

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/modules/LpVariantIdeasPanel.tsx:147` (and `:149`)
- **Scenario**: On error/timeout the panel renders `<TimeoutState onRetry={reset} />` / `<ToolError onRetry={reset} … />`. `reset()` (useAiTool.ts:267-283) aborts, sets `status:"idle"`, and drops `lastPayloadRef`/`canRefine` — it does **not** re-issue the call. So clicking the "Zkusit znovu"/"Retry" button after a timeout just dumps the user back to the idle hint text; nothing regenerates. Every sibling tool in this context wires retry to a real re-run (`ClusterBuilder onRetry={build}`, `OrganicChannels onRetry={runTailor}`, `CompareSeoTable`'s row `onClick={onGenerate}`).
- **Root cause**: The panel builds its request lazily inside the button `onClick` (needs `selected` + a localized `controlDescription`), so there was no standalone re-run function to hand to the error states; `reset` was passed as a stand-in.
- **Impact**: A user who hits a transient timeout/500 clicks Retry and it appears to do nothing useful (silently returns to idle), making the tool feel broken exactly when it needs to recover. The retry affordance is a lie.
- **Fix sketch**: Extract the `onClick` body into a `runSuggest()` callback (`if (status!=="loading" && selected) run(buildRequest(selected, t("controlDescription", …), project?.id))`) and pass `onRetry={runSuggest}` to both `TimeoutState` and `ToolError`.

## 4. `deriveCompareQueries` doesn't de-dup, so a saved list with a repeated comparison keyword yields duplicate React keys and a shared per-row AI slot

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/CompareSeoTable.tsx:815` (with `:346`)
- **Scenario**: When a user picks a saved keyword list, `sourceQueries` comes from `deriveCompareQueries(selectedList.keywords)` (compute.ts:149-164), which pushes one `CompareQuery` per matching keyword with **no de-duplication**. Saved lists are real user data assembled from multiple searches, so the same phrase (e.g. "salesforce vs hubspot") can appear twice. `scoreQueries` preserves both, then the table renders `rows.map(r => <QueryRow key={r.query} … />)` (line 815) — duplicate `key` — and each row calls `useAiTool(\`comparison-outline:${r.query}\`)` (line 346), so both rows share the same localStorage result slot (`systedo.ai.result.comparison-outline:<query>`).
- **Root cause**: Row identity and the per-row AI-history storage key both assume `query` is unique across the scored set, an invariant the sample data happens to satisfy but the real saved-list seam does not enforce.
- **Impact**: React key collision (dropped/duplicated warnings, mis-associated row state on re-render) and cross-row bleed — generating or restoring a scaffold on one duplicate row surfaces on the other, since they read/write the same history slot. Only triggers on real lists with repeated comparison terms, so it slips past the sample-data happy path.
- **Fix sketch**: De-dup in `deriveCompareQueries` (skip a keyword whose normalized `query` is already emitted, e.g. a `Set<string>` guard) so downstream `key`/`useAiTool` ids stay unique; optionally also index the React key with the row position as a defensive tiebreak.

## 5. The "load this project's saved keyword lists" fetch is copy-pasted across five components with no shared hook

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/app/modules/CompareSeoTable.tsx:668-681`
- **Scenario**: The same client-side GET of `/api/keywords/lists?projectId=…` — fetch, `r.ok ? r.json() : { lists: [] }`, coerce `Array.isArray(d?.lists)`/`j.lists ?? []`, swallow errors, cancel on unmount — is re-implemented independently in five files: `CompareSeoTable.tsx:668-681`, `ClusterBuilder.tsx:82-95`, `ContentEngine.tsx:223-231`, plus `components/ai/SavedKeywordLists.tsx` and `components/ai/KeywordResearch.tsx` (verified via repo-wide grep for `/api/keywords/lists`). Each hand-rolls the cancel flag / auth-gating slightly differently (ClusterBuilder gates on `useSession`, others don't). This is a *distinct* duplication from the prior report's finding #2, which covered the sessionStorage **BriefSeed write-and-navigate** handoff, not list loading.
- **Root cause**: No shared data hook for the saved-keyword-lists endpoint, so every module that needs the lists re-derives the same fetch+parse+cleanup boilerplate.
- **Impact**: Five call sites to keep in sync if the endpoint shape, query param, caching, or the "empty for anonymous demo" contract changes; the inconsistent auth-gating (only ClusterBuilder waits for `authenticated`) is exactly the kind of drift shared duplication hides.
- **Fix sketch**: Add `useKeywordLists(projectId?: string): { lists: KeywordList[]; loaded: boolean }` (a `"use client"` hook, e.g. in `src/lib/keywords/`) encapsulating the fetch, abort-on-unmount, and `lists ?? []` coercion; replace the five inline effects with it.
