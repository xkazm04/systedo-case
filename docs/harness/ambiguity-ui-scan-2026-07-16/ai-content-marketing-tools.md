# AI Content & Marketing Tools — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. CreativeStudio hand-rolls the AI request lifecycle — no timeout, no abort, no persistence
- **Severity**: High
- **Lens**: ui
- **Category**: missing-timeout-inconsistent-lifecycle
- **File**: src/components/ai/CreativeStudio.tsx:361-396 (also 239-285, 626-631)
- **Scenario**: User clicks "Vygenerovat vizuál"; the /api/images request hangs (proxy stall, Leonardo backend wedge). Every other tool in the tab strip aborts at AI_TIMEOUT_MS and shows TimeoutState with retry; CreativeStudio spins forever with a disabled submit button and no way out except a full page reload. Separately, a refresh discards the generated candidates the user just paid image quota for — every text tool persists results via useAiTool history, this one persists nothing.
- **Root cause**: `generate()` / `makeVariations()` are bespoke fetch wrappers instead of the shared `useAiTool` lifecycle: no AbortController, no hard ceiling, no run-id staleness guard (a slow first generate can resolve after a second one and clobber it), no localStorage slot, and a plain pulsing-text loader instead of the shared `LoadingTimer` ring.
- **Impact**: Permanent stuck-loading dead end on a hung request; late-response state clobbering; lost quota-costing results on refresh; visibly inconsistent loading UX between the "Vizuály" tab and all five sibling tools.
- **Fix sketch**: Wrap the image call in the same ceiling pattern (`AbortController` + `setTimeout(abort, AI_TIMEOUT_MS)` + run-id ref) and render `LoadingTimer`/`TimeoutState`; or extend `useAiTool` with a configurable endpoint so images inherit history, timeout, and the typed error envelope for free (the 429 upgradeUrl handling is already duplicated here).

## 2. Optimistic deletes with no rollback and no res.ok check (three copies)
- **Severity**: High
- **Lens**: ambiguity
- **Category**: optimistic-delete-no-rollback
- **File**: src/components/ai/AdExperiments.tsx:123-135 (same shape: SavedKeywordLists.tsx:110-122, CreativeAttribution.tsx:135-147)
- **Scenario**: User deletes an A/B test that holds hand-entered performance metrics while offline or when the API 401s/500s. The row vanishes instantly; the DELETE fails; `catch { /* ignore */ }` swallows it and the reconciling `load()` never runs (it sits after the fetch inside the same try). The UI now lies until the next reload, when the "deleted" test resurrects — or, in the success path with a non-ok response, the code never checks `res.ok` at all.
- **Root cause**: Optimistic removal from state before the request, error path deliberately ignored, and success/failure conflated (no `res.ok` branch, `load()` unreachable on throw). Copy-pasted three times across the module.
- **Impact**: Ghost UI state; users believe destructive actions succeeded when they didn't; an A/B test's measured performance can appear destroyed or resurrected unpredictably. No confirmation guard either, and one mis-click on the always-visible × discards real campaign data.
- **Fix sketch**: Keep the optimistic remove but snapshot the previous list and restore it when `!res.ok || fetch throws` (plus a small toast); move `await load()` to a finally. Extract one `useOptimisticDelete(url, body)` helper since the three components are byte-similar. Consider a confirm step when the experiment has non-empty metrics.

## 3. AI status is one frozen snapshot per page load — and an HTTP error freezes it to "nothing"
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: stale-module-cache
- **File**: src/components/ai/useAiStatus.ts:15-30
- **Scenario**: (a) The preflight says "Zbývá 3 generování dnes"; the user runs four generations across tabs — the banner still says 3, then the 5th request 429s with no warning, contradicting the whole point of preflight. (b) /api/ai/status returns a transient 500 on first mount: the `.then` stores `cached = null` but `inflight` stays a resolved promise (only the network-error `catch` resets it), so no later mount ever retries — preflight, budget hints, and per-tool `expectedMs` pacing are silently gone for the page's lifetime.
- **Root cause**: Module-level cache with no invalidation hook: `cached` is written unconditionally from the response, the retry path only covers `fetch` rejection, and nothing busts the cache after a successful/failed generation even though `useAiTool` knows exactly when budget was spent.
- **Impact**: Misleading remaining-budget copy, missed exhausted/demo warnings, and a self-inflicted permanent loss of the telemetry-paced loading ring after one bad response.
- **Fix sketch**: In `fetchAiStatus`, reset `inflight = null` when `!res.ok` (mirror the catch); export an `invalidateAiStatus()` that clears `cached`, called from `useAiTool.run()` on completion (or decrement `remaining` locally). A `savedAt` timestamp + short TTL (~60s) would cover both with less plumbing.

## 4. NODE_ENV stands in for "which AI provider" in the timeout constants
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: env-as-provider-proxy
- **File**: src/components/ai/useAiTool.ts:49-55
- **Scenario**: The client ceiling is 60s in production because "production (Gemini) answers in a few seconds", and `CLAUDE_TIMEOUT_MS + 30_000` in dev because dev means Claude CLI. But the provider is chosen by which API keys are configured, not by NODE_ENV. Deploy production with the Claude-backed provider (or Gemini has a slow day on the heavy article-draft mode) and the client aborts at 60s while the server returns a real result — the exact silent brief→draft breakage the comment describes having fixed once already, reintroduced on the other side of the same assumption.
- **Root cause**: An undocumented environment↔provider coupling baked into `AI_TIMEOUT_MS` and the `AI_TIMER_TARGET_MS` pacing constants (18s vs 50s), decided at build time when the truth is a runtime server config the client already fetches (`/api/ai/status` exposes providers and per-mode latency).
- **Impact**: Hard-to-diagnose "timed out but the server billed a successful generation" failures on any prod/provider combination the constants didn't anticipate; wasted quota per abort.
- **Fix sketch**: Derive the ceiling from the status payload when available (e.g. `max(60s, 2 × latency[mode])`, falling back to the current constants), or have the server include its own per-call cap in the status response so bumping a server timeout moves every client with it — the mechanism the comment wants, but keyed to the provider rather than NODE_ENV.

## 5. AdGenerator's in-place edits are the only unpersisted, silently-discardable state
- **Severity**: Medium
- **Lens**: ui
- **Category**: volatile-manual-edits
- **File**: src/components/ai/AdGenerator.tsx:503-519
- **Scenario**: The panel invites polishing generated headlines in place ("Texty lze upravovat přímo v řádcích…"). The user trims three over-limit headlines, then refreshes — or clicks a history chip, or hits "Vygenerovat inzeráty" again. The `useEffect` reseeding `edited` from `generated` (and the fresh run) throws the manual work away with no warning. Meanwhile the form draft AND the raw generation are both carefully persisted; the one artifact the user actually crafted by hand is the only thing that isn't.
- **Root cause**: `edited` lives in transient component state outside both persistence layers (`systedo.ai.form.*`, `systedo.ai.result.*`), and no interaction guard checks `dirty` before a regenerate/restore replaces it. The "Vrátit vygenerované" undo exists, but there is no inverse ("keep my edits") and no confirm.
- **Impact**: Real lost work at the highest-value moment of the tool (post-generation polish), inconsistent with the module's own everything-survives-a-refresh promise; users learn to distrust in-place editing and export prematurely.
- **Fix sketch**: Persist `edited` alongside the active history entry (e.g. an `edited` field on the newest slot, or a `systedo.ai.result.ads.edited` sibling keyed by `savedAt`) and rehydrate it in the reseed effect; when `dirty` and the user triggers generate/restore, ask once ("Máte neuložené úpravy — přepsat?") or auto-snapshot the edited version as its own history chip.
