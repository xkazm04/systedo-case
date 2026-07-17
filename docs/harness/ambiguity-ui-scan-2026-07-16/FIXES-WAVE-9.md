# Fixes — Wave 9 (UI silent-failure tail)

Theme: **user actions that fail without telling the user, discard input, or crash on
edge data.** 9 High findings across account settings, AI tools, campaigns, project
lifecycle, alert API, and inventory sync. Branch `vibeman/ambiguity-ui-2026-07-16`.

## Commits

| # | Commit | Finding | Scope |
|---|--------|---------|-------|
| 1 | `dd33fdf` | account-settings-ai-config #1 | project delete unchecked response |
| 2 | `03a6dc0` | account-settings-ai-config #2 | BYOM key save wipes draft on failure |
| 3 | `25a95fb` | ai-content-marketing-tools #1 | CreativeStudio no timeout/abort/persist |
| 4 | `48ee7bc` | ai-content-marketing-tools #2 | optimistic deletes, no rollback (×3) |
| 5 | `87ae173` | campaigns-control-plane-ui #2 | staging change-set fails silently |
| 6 | `eb10f36` | project-lifecycle-ui #1 | create-project module matrix discarded |
| 7 | `f3aeac8` | project-lifecycle-ui #2 | onboarding dismiss / account-link unchecked |
| 8 | `5bd0413` | campaign-ops-api #2 | unknown alert action → bulk mark-all |
| 9 | `3f496d2` | inventory-warehouse-sync #2 | Baselinker page-cap silent truncation |

## Narratives

1. **Project delete (`ProjectSettings.tsx`)** — `remove()` awaited the DELETE with no
   `res.ok` check, so a 403/409/500 resolved normally and navigated to `/app` as if the
   project were gone (it reappears in the list, unexplained). Now a non-ok response sets
   a dedicated `deleteError` banner in the danger zone and aborts navigation.

2. **BYOM key save (`ByomKeys.tsx`)** — `saveKey` ran its success cleanup (clear the
   pasted key, collapse the input) unconditionally even when `call()` had failed. `call()`
   now resolves a success boolean; the draft is cleared only on a real success, so a
   rejected key stays for the user to retry.

3. **CreativeStudio lifecycle** — `generate()`/`makeVariations()` were bespoke fetch
   wrappers with no AbortController, no ceiling, no run-id guard, no persistence: a hung
   `/api/images` request spun forever, a slow first generate could clobber a newer one,
   and a refresh discarded quota-paid candidates. Wrapped both in the shared
   `AI_TIMEOUT_MS` ceiling (`beginRun()` = AbortController + timeout + monotonic run-id)
   with a timeout message, and persist the latest `ImageGenResult` to localStorage,
   rehydrated on mount.

4. **Optimistic deletes** — `AdExperiments`, `SavedKeywordLists`, `CreativeAttribution`
   each removed a row from state before the DELETE and swallowed failures with no `res.ok`
   check, so a failed delete left a ghost that the next reload resurrected. Extracted one
   shared `optimisticDelete(request, rollback, reload)` (rolls back the snapshot on throw
   or non-ok, always reconciles via reload) and wired all three. Unit-tested.

5. **Stage change-set (`CampaignsClient` / `CampaignTable`)** — `preparePackage`
   communicated failure only via a boolean nobody rendered, so a failed stage on a critical
   row flipped the button label back with zero feedback. It now parses and returns the
   server error; `CampaignTable` keeps per-row error state next to `preparingId` and renders
   it under the button.

6. **Create-project module matrix** — the assembled module set was posted nowhere;
   projects shipped with type defaults while the grid implied the selection mattered. Per-
   project module persistence is a larger follow-up, so the prototype is made honest: coral
   "proposed" toggles (never wired into the registry) are now read-only marks, and an inline
   note appears whenever the selection diverges from the type default.

7. **Onboarding dismiss + account-link** — both treated "fetch resolved" as success.
   `DismissOnboarding` reset `busy` only in the network-error catch, so an HTTP error left
   the button stuck disabled with no message; `UnmappedAccountsCallout.link` silently closed
   the picker and refreshed. Both now throw on `!res.ok`, reset busy in `finally`, and show
   an inline `role="alert"`.

8. **Alert action whitelist (`/api/alerts`)** — the dispatch matched only
   `"acknowledge"`; a typo, a newer client's action, or a malformed/absent body fell through
   to `markAlertsRead(tenant, undefined)` — the mark-EVERYTHING-read bulk path. Added a pure
   `planAlertAction` whitelist (`acknowledge`/`read` need id, `readAll`, else 400) and
   switched `AlertsInbox.markAllRead` to `action:"readAll"`. Unit-tested.

9. **Baselinker truncation (`baselinker.ts` / `sync.ts`)** — a >20k-SKU catalog stopped
   at the page cap and returned a partial list with no signal; the sync stamped a healthy
   "synced N min ago" while capped SKUs kept stale stock/price. `collectBaselinkerPages` now
   returns `{ products, truncated }`; the flag threads through `resolveProviderProducts` →
   `SyncResult` with a localized `warning`. A truncated apply still stamps `lastSyncAt` but
   records the warning as a non-fatal note (`failCount` stays 0), and the sync route returns
   `{ truncated, warning }`. Tests updated + truncation-detection cases added.

## Verification

- `npx tsc --noEmit`: **clean** (0 errors) before every commit + at end.
- `npm run test:unit`: **1647 / 1647 pass** (baseline 1636 + 11 new: 4 optimistic-delete,
  5 alert-actions, +2 net baselinker truncation). 0 failures, 0 regressions.
- Pre-commit hook (eslint --fix + tsc + LLM contract gate) passed on all 9 commits.

## New tests

- `test-unit/optimistic-delete.test.mjs` — ok / non-ok / throw / async-reload branches.
- `test-unit/alert-actions.test.mjs` — whitelist, missing-id 422, unknown/absent → 400.
- `test-unit/catalog-sync.test.mjs` — extended `collectBaselinkerPages` cases for the
  `{ products, truncated }` shape + truncation detection.
- `test-unit/catalog-cron-sync.test.mjs` — updated to the `resolveProviderProducts`
  `{ products, truncated }` return.

## Behavior changes needing sign-off

- **`/api/alerts` now requires an explicit `action`.** Bodies with no action (including a
  bare `{id}` or an empty/unreadable body) return **400** instead of marking alerts read.
  The only in-app caller, `AlertsInbox.markAllRead`, was updated to send `action:"readAll"`;
  any external/automation client that relied on the old body-less "mark all" or `{id}`-only
  "mark one" behavior must be updated. A `"read"` action (mark one) is now supported but
  currently unused in-app.
- **Baselinker connection health after a truncated sync.** A successful-but-truncated sync
  now writes the truncation warning to the connection's `lastError`/`lastErrorAt` (with
  `failCount` still 0 and `lastSyncAt` stamped). If any UI treats *any* `lastError` presence
  as "failing/red", a truncated-but-otherwise-fine connection will read as degraded — that
  is intentional (it is not fully healthy) but worth confirming against the badge styling.
- **Create-project coral "proposed" modules are no longer toggleable.** They render as
  read-only `+` marks. This is honest (they never persisted) but removes an affordance;
  the real fix is per-project module persistence (deferred).

## Patterns

- **`!res.ok` is not caught by `try/catch`.** The dominant bug shape this wave: a resolved
  fetch with an HTTP error status takes the success path. Findings 1, 2, 7 are all this.
- **Optimistic mutation needs a snapshot + rollback**, not an empty `catch`. One shared
  helper removed three byte-similar copies (finding 4).
- **Boolean-only failure signaling gets dropped.** Findings 2 and 5 both had a handler
  returning `false`/`void` that no caller rendered — return the *reason* and surface it.
- **A `switch`/`if` whose implicit default is the destructive path is a footgun** (finding
  8): whitelist explicitly, reject the rest.
- **Silent truncation/capping must set an observable flag** threaded to the result, not just
  a code comment acknowledging the cap (finding 9).
