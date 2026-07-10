# Campaign performance & ads operations modules

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Spotřeba reads live LLM spend from a GLOBAL 1000-row cap applied before the per-project filter — silent under-report and live/sample flapping

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/app/[projectId]/spotreba/page.tsx:15`
- **Scenario**: The page calls `liveSpendForProject(project.id)` (`src/lib/spend/live.ts:14`), which runs `listLlmTelemetrySince(sinceIso, 1000)` against the shared `llmTelemetry` collection. That query is `where at>=since` + `orderBy at desc` + `limit(1000)` with **no `projectId` scope** — it returns the newest 1000 telemetry rows *across all tenants and all projects*. Only afterwards does `telemetryToSpend(telemetry, projectId, nowMs)` (`src/lib/spend/aggregate.ts:17`) filter to `e.projectId === projectId` in memory. On any deployment where more than 1000 LLM calls land in the 60-day window platform-wide, a given project's rows are pushed past the cap: (a) if some survive, `isLive` is true but the spend numbers are silently understated by whatever fraction was truncated; (b) if none survive, `isLive=false` and the page shows the seeded `spendForProject` sample instead. Because the surviving set depends on *other tenants'* activity, the same project flips between live and sample data across reloads.
- **Root cause**: The cap and ordering are applied at the datastore query before the per-project predicate; the query treats a global collection as if it were project-scoped. Compare `src/lib/activity/live.ts:16`, which correctly reads `listActivity(tenant, 50)` under a per-tenant key.
- **Impact**: Wrong money numbers on the user's "what does AI cost me" view, with no error and no indication the data is partial; non-deterministic live/sample flapping.
- **Fix sketch**: Scope the read by project — add `.where("projectId","==",projectId)` in a dedicated `listLlmTelemetryForProject(projectId, sinceIso)` (needs a `projectId + at` composite index), or paginate `at desc` until the project's rows in the window are exhausted rather than truncating globally at 1000.

## 2. Aktivita's live feed key includes the connected Ads `customerId` — activity history orphans whenever an account is connected or switched

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/app/app/[projectId]/aktivita/page.tsx:18`
- **Scenario**: `liveActivityForProject(userId, project.id)` resolves the read tenant via `resolveTenant(userId, projectId)` (`src/lib/campaigns/connector.ts:150`) → `buildTenantKey(userId, projectId, connection?.customerId)` (`:138`), which appends the connected account id: `u_{userId}_proj_{projectId}_{customerId}` when connected, `u_{userId}_proj_{projectId}` when not. Activity is *written* through the same `resolveTenant` at each mutation seam, so the tenant key is a function of connection state at write time. Sequence: user performs module/AI actions while no Ads account is connected → rows written under `u_X_proj_Y`. User later connects (or switches) a Google Ads account → subsequent reads resolve `u_X_proj_Y_123` → all previously-written activity under the old key becomes invisible in the feed. Switching the selected account again fragments it further. The feed silently loses history it never deleted.
- **Root cause**: Activity is account-*agnostic* (module actions, AI actions), but it inherits the campaign data's account-scoped tenant key, which was designed so live Ads data "read and sync paths agree." Keying cross-module activity by `customerId` is the wrong scope.
- **Impact**: User-visible loss of the audit timeline on every Ads-account connect/switch; the "Vše/All" window silently shows a truncated, connection-dependent slice of true history.
- **Fix sketch**: Read/write activity under a `customerId`-independent key (per-user-per-project: `u_{userId}_proj_{projectId}`) — pass a flag to `buildTenantKey`/`resolveTenant` to omit `customerId` for account-agnostic domains (activity, patterns), reserving the account suffix for Ads-sourced campaign/series/snapshot data only.

## 3. Aktivita filters (window / severity) run client-side over a server cap of 50 rows — "All" and rare-severity filters silently under-report

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/app/[projectId]/aktivita/page.tsx:18`
- **Scenario**: The page passes exactly the 50 newest live rows (`listActivity(tenant, 50)`, `src/lib/activity/live.ts:16`) to `ActivityModule`, which then filters entirely in memory: `filterActivity(events, filter)` over a `useState` filter defaulting to `windowDays: 30` and offering a `windowDays: 0` ("Vše/All") option and per-severity toggles (`src/components/app/modules/ActivityModule.tsx:82,85,105-108`). There is no refetch on filter change. So on a busy project whose 50 newest events all fall inside the last few days, selecting "All" or "30 days" can never surface more than 50 rows, and filtering to a rare severity (e.g. `error`) hides any error older than the 50th newest event — the counts and CSV export then present an incomplete picture as if complete.
- **Root cause**: A fixed server-side row cap is combined with client-side window/severity filtering, so the filter operates on a pre-truncated set rather than querying for the requested window.
- **Impact**: Misleading activity/audit views and CSV exports (missing older errors, understated "All"); a user auditing incidents can wrongly conclude "no errors in this period."
- **Fix sketch**: Fetch by the requested window server-side (raise/parameterize the cap from the active filter, or query `where at>=windowStart` per selection) instead of a blanket newest-50; at minimum surface a "showing 50 most recent" truncation marker so the "All" window isn't presented as exhaustive.

## 4. Kanály crashes the whole page if the catalog load rejects, where its sibling channel page degrades gracefully

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/app/[projectId]/kanaly/page.tsx:23`
- **Scenario**: `Promise.all([loadProjectCatalog(project), getCompetitors(project.id).catch(() => null)])` guards the competitor read with `.catch` but leaves `loadProjectCatalog` (`src/lib/catalog/load.ts:17`, which awaits `listOfferings` → Firestore/sqlite) unguarded. Any store error rejects the whole `Promise.all` and 500s the route. The functionally-parallel twin page `src/app/app/[projectId]/sprava-kanalu/page.tsx:16` wraps the identical call as `loadProjectCatalog(project).catch(() => [])` and stays up. The grounding block below (`categories`, `keywords`) is already written to tolerate an empty catalog, so the crash is gratuitous — the page could render the seeded channel plan ungrounded.
- **Root cause**: Inconsistent defensive posture around the same store call across sibling module pages; the page treats a degradable enrichment input (catalog grounding) as a hard dependency.
- **Impact**: A transient catalog-store hiccup takes down the Kanály module entirely instead of falling back to the seeded plan, while every other module that reads the catalog (sprava-kanalu) survives.
- **Fix sketch**: Mirror the sprava-kanalu pattern — `loadProjectCatalog(project).catch(() => [])` (and drop the competitor `.catch(()=>null)` into the same normalized-degradation shape) so grounding is best-effort while the channel plan always renders.

## 5. Zisk re-derives the same per-period map builder twice inline

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/app/app/[projectId]/zisk/page.tsx:42`
- **Scenario**: `rowsByPeriod` (`:42-47`) and `trendByPeriod` (`:51-62`) both open with the identical scaffold `Object.fromEntries(Object.entries(PERIOD_DAYS).map(([key, days]) => [key, <compute(days)>]))`, differing only in the per-period computation. This is a genuinely new local duplication not raised in the 2026-07-09 code_refactor report (which flagged the `PERIOD_DAYS`/`TREND_GRANULARITY` *values* being mirrored into `DemoModule.tsx`, finding #5 — a different concern from the map-building boilerplate here).
- **Root cause**: No small helper encodes "build a `Record<periodKey, T>` by mapping each period's day-count", so each of the two per-period products re-derives the `Object.fromEntries(Object.entries(...).map(...))` shape by hand.
- **Impact**: Minor; a change to the period set or key handling (e.g. adding a period, or the `?? "week"` granularity default at `:58`) must be kept consistent across two hand-written comprehensions in the same function.
- **Fix sketch**: Add a local `mapPeriods<T>(fn: (days: number, key: string) => T): Record<string, T>` over `PERIOD_DAYS` and call it for both `rowsByPeriod` and `trendByPeriod`. Pure, server-component-safe, no new imports.
