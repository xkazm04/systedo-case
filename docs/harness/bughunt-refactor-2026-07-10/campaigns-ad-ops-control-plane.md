# Campaigns / Ad Ops Control Plane

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `AdsAccountPicker` re-fetches `/api/campaigns/accounts` in an unbounded loop

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/campaigns/AdsAccountPicker.tsx:90`
- **Scenario**: `load` is `useCallback(async () => { … setError(t("errorServer")) … }, [t])` (dep array `[t]`, line 90) and the mount effect is `useEffect(() => { if (status === "authenticated") void load(); }, [status, load])` (lines 92-96). `useT` (`src/lib/i18n/client.ts:22-26`) returns a **brand-new closure on every render** (it is not memoized). So every render produces a new `t` → a new `load` → the effect's `load` dependency changes → the effect re-runs → `load()` fires again. `load()` itself calls `setLoading`/`setData`/`setError` (and `setData(json)` always stores a fresh object, so React never bails out), which forces another render, which mints another `t`/`load`, which re-runs the effect… For any authenticated visitor to `/kampane` this becomes a continuous fetch storm against `/api/campaigns/accounts` — the endpoint that, when a developer token is configured, calls Google's `listAccessibleCustomers`.
- **Root cause**: A per-render, non-referentially-stable value (`t`) was placed in a `useCallback` dependency array that in turn feeds a `useEffect` dependency array. Every sibling loader in this context (`AlertsInbox`, `ActivityFeed`, `MicrositeCard`, `ReportSettings`, `ControlPlane`, `SharedReportsList`) keys its `load` on `[pid]` and reads no translations inside `load`; this file is the lone exception because its `catch` block calls `t("errorServer")`.
- **Impact**: Runaway network/CPU churn, a permanently flickering loading spinner, and — with live Google Ads connected — rapid exhaustion of the Google Ads API quota / self-inflicted rate-limiting.
- **Fix sketch**: Drop `t` from `load`'s deps (`}, [])` or `}, [pid])`) and capture the error string outside the callback, e.g. read `t("errorServer")` into a `useMemo`/const, or hoist the message resolution into the `catch` via a ref. Matches the stable `[pid]` pattern the other five loaders already use.

## 2. `normalizeReport` guards `result` but not `meta`/`createdAt`, so a partial payload still crashes `ReportView`

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/campaigns/ReportView.tsx:220`
- **Scenario**: `useCampaigns.normalizeReport` (`useCampaigns.ts:18-35`) exists specifically because "a partial/trimmed payload … would otherwise crash ReportView." It coerces every `result.*` field but **spreads `meta` and `createdAt` through untouched** (`return { ...rep, result: {…} }`). `ReportView` then dereferences `report.meta.prompt` (line 220, inside `!clientSafe`) and passes `report.meta` / `report.createdAt` to `ResultMeta` (line 110). If `/api/campaigns/analyze` returns a trimmed object lacking `meta` (exactly the partial-payload case the normalizer was written to defend against), `report.meta.prompt` throws `Cannot read properties of undefined` during render, taking down the whole campaign table via the error boundary.
- **Root cause**: The defensive normalizer's contract ("make this safe for ReportView") is incomplete — it hardened the arrays ReportView maps over but not the object fields ReportView dereferences.
- **Impact**: A single malformed/streamed-then-truncated analyze response crashes the entire campaigns view instead of the one report card.
- **Fix sketch**: In `normalizeReport`, also normalize `meta` (default `{ prompt: "", model: "", … }` per `AiMeta`) and `createdAt` (default `""`/now), OR guard the reads in `ReportView` (`report.meta?.prompt`, skip `ResultMeta`/`PromptDisclosure` when `meta` is absent).

## 3. `BudgetMoves` success/confirm state keyed by campaign-id pairs is never reset across re-syncs

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/campaigns/BudgetMoves.tsx:221`
- **Scenario**: `done` is keyed `shift:${m.fromId}:${m.toId}` / `pause:${m.fromId}` and set on success (line 138); the row renders a green "Shift applied" instead of any action button whenever `done[shiftKey] ?? done[pauseKey]` is truthy (lines 221-229). After a successful apply, `apply` calls `onApplied?.()` → `CampaignsClient` runs `sync(period)` → `campaigns` change → `recommendBudgetMoves(...)` (deterministic) is recomputed. If the shift didn't fully fix the source (very common — one budget nudge rarely flips a laggard), the **same `from→to` pair is re-recommended with the same ids**, but `done` still holds that key, so the fresh, still-valid recommendation shows the stale "applied" badge and offers no button. The user cannot act on it. `done`/`confirming`/`error` are never invalidated when the `moves` array is rebuilt.
- **Root cause**: Success state is keyed on domain ids that legitimately recur across renders, with no invalidation tied to the underlying data changing.
- **Impact**: A genuinely actionable budget move becomes permanently un-clickable after any prior apply that re-surfaces the same pair — the panel's core action silently dies.
- **Fix sketch**: Reset the per-action state when the input identity changes, e.g. `useEffect(() => { setDone({}); setConfirming(null); setError(null); }, [campaigns])`, or key `done` by a signature that includes the move's amount so a new recommendation gets a fresh key.

## 4. `AlertsInbox.markAllRead` reports success on an HTTP error

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/campaigns/AlertsInbox.tsx:60`
- **Scenario**: `markAllRead` (lines 60-72) does `await fetch("/api/alerts", { method: "POST", … })` with **no `res.ok` check**, then unconditionally `setAlerts(read:true)` + `setUnread(0)`. `fetch` only rejects on a network failure, so a 401 (expired session), 403, or 500 resolves normally and the UI clears the unread badge and marks every alert read even though the server persisted nothing. On the next `refreshKey` reload (`load()` after a sync) the alerts snap back to unread, but in the meantime the operator believes newly-critical-campaign alerts were acknowledged when they weren't.
- **Root cause**: Conflating "the fetch promise resolved" with "the server accepted the write" — only the `try/catch` network path is treated as failure.
- **Impact**: Truth-in-labeling failure on an accountability surface: dismissed-but-not-persisted critical alerts; operator may skip campaigns they think they've triaged.
- **Fix sketch**: `const res = await fetch(...); if (!res.ok) return;` before the optimistic update (or revert `alerts`/`unread` on non-ok), mirroring the `res.ok` guard the sibling `load()` already uses at line 45.

## 5. The auth-gated `load()` fetch-effect skeleton is hand-copied across six chrome components

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/campaigns/AlertsInbox.tsx:42`
- **Scenario**: `AlertsInbox` (42-58), `ActivityFeed` (74-88), `MicrositeCard` (69-88), `ReportSettings` (69-82), `ControlPlane` (88-104) and `SharedReportsList` (52-67) each reimplement the identical **GET-on-auth** skeleton: `const load = useCallback(async () => { try { const res = await fetch(pid ? \`…?projectId=${encodeURIComponent(pid)}\` : "…"); if (!res.ok) return; const json = await res.json(); setX(json.y ?? default); } catch { /* non-critical */ } }, [pid])` paired with `useEffect(() => { if (status === "authenticated") void load(); }, [status, load, …])` (plus the `eslint-disable react-hooks/set-state-in-effect` line). This is distinct from the 2026-07-09 report's finding #1 (which factored the *mutation* busy/error `run` skeleton into `useAsyncAction` — already implemented, and deliberately scoped to write actions); the read-side auth-gated loader was not covered there.
- **Root cause**: No shared primitive for "fetch a per-project resource once the session resolves, degrade silently for anonymous," so each chrome widget retyped it.
- **Impact**: Six near-identical copies; a change to the convention (e.g. AbortController cleanup, an error surface, the `pid` query-param builder, or fixing the `[t]`-in-deps trap that finding #1 above shows is easy to hit) must be applied six times.
- **Fix sketch**: Add `src/components/campaigns/useAuthedResource.ts` (or `useProjectResource`) exporting `useAuthedResource<T>(path: string, opts?)` that owns the `pid`-aware URL, the `status === "authenticated"` gate, the `res.ok`/JSON/catch flow and returns `{ data, reload }`. Migrate the six loaders; keep `useCampaigns` (richer multi-field state) separate.
