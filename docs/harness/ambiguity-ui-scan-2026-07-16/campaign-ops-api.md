# Campaign ops & tenant utility/research — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

Scope note: `src/app/api/campaigns/apply/route.ts` from the context's file list does not exist in the repo (apply lives inside `control-plane` as `action:"approve"`). All 14 remaining files were read.

## 1. Connecting a Google Ads account never verifies the user can actually access it
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unverified-account-connect
- **File**: src/app/api/campaigns/accounts/route.ts:63-74
- **Scenario**: POST accepts any `customerId` (digits after `replace(/\D/g,"")`) and any `customerName`, calls `addAccount` and makes it the **active** account — with no check that the id appears in `listAccessibleCustomers(token)` (which GET carefully computes). A typo'd id, a stale id pasted from elsewhere, or a hand-crafted request connects a phantom account.
- **Root cause**: The route silently assumes the client only ever posts ids it just received from GET — an undocumented trust boundary. The GET handler even builds the authoritative accessible-ids list, but POST never consults it. `customerName` is also stored uncapped (contrast: report-config caps `brandName` at 60, `name` at 80).
- **Impact**: Because `resolveTenant`/`resolveCampaignContext` key the tenant on the active `customerId` (connector.ts:432, 476-477), activating a phantom account flips the user's tenant key: every sync/eval/alert surface suddenly points at an empty tenant and existing data "disappears" until they switch back. Live syncs against the phantom id fail with opaque connector errors. An attacker-supplied unbounded `customerName` is persisted and echoed into the account-switcher UI.
- **Fix sketch**: In POST, when `adsConfigured()`, require the id to be in `listAccessibleCustomers(token)` (422 otherwise) and derive the name server-side via `getAccountName`; always `slice(0, 80)` the client-supplied name as a fallback.

## 2. Unknown alert actions silently fall through to bulk "mark all read"
- **Severity**: High
- **Lens**: ambiguity
- **Category**: destructive-default-fallthrough
- **File**: src/app/api/alerts/route.ts:45-52
- **Scenario**: POST dispatches on `action`: only `"acknowledge"` is matched; **anything else** — a typo (`"acknowlege"`), a future action string from a newer client, a malformed JSON body (parse error is swallowed, leaving `id`/`action` undefined) — drops to `markAlertsRead(tenant, id)`, and with no `id` that is the mark-EVERYTHING-read path (batched Firestore writes across the whole tenant, alerts.ts:132-147).
- **Root cause**: The implicit default of the action switch is the most destructive operation in the route, and the JSON-parse `catch` comment ("no body → mark all read") bakes that in as intended behavior for *any* unreadable body too.
- **Impact**: A single version-skewed or buggy client call irreversibly wipes the unread state of the alert inbox — the tenant's primary "what needs my attention" signal (unread count drives the inbox badge). There is no undo and no audit entry.
- **Fix sketch**: Whitelist actions explicitly: `"acknowledge"`, `"read"` (with id), `"readAll"`; return 400 for anything unrecognized. Keep body-less POST → 400 rather than mark-all.

## 3. Semantic pattern search burns the paid daily quota even when the call was free or failed
- **Severity**: High
- **Lens**: ambiguity
- **Category**: quota-charged-before-work
- **File**: src/app/api/patterns/search/route.ts:42-67
- **Scenario**: A signed-in user's `aiEval` daily unit is consumed (line 43) *before* `searchPatterns` runs. The route's own doc header says search "substring-matches when embeddings are unavailable" — that degraded path costs nothing, yet still bills a unit. Likewise a thrown search (502, line 65-68) has no `refund`.
- **Root cause**: This route predates / bypasses the metering discipline the eval routes converged on: analyze routes charge only on a real cache-miss generation and refund on degrade ("a keyless fallback no longer bills as a real evaluation", analyze/route.ts:194-198), and the sync route refunds on failure (campaigns/route.ts:163-171). Search charges unconditionally, up front, with no refund seam. `durableGuard` also reserves `spendUnits: 1` on the global ceiling with the same no-refund gap.
- **Impact**: Users on a keyless/degraded deployment silently exhaust their shared `aiEval` budget (the same pool campaign evaluations draw from) on free substring searches; transient failures eat quota for nothing. Invisible, hard-to-support "why am I out of evaluations?" tickets.
- **Fix sketch**: Have `searchPatterns` report whether the embedding path actually ran (it already returns `semantic: boolean`); charge `consume` after the call only when `semantic === true`, or charge up front and `refund` on `!semantic` / throw — mirroring the sync route's pattern.

## 4. Blank white-label client fields silently resurrect the "Mionelo" demo identity in real client reports
- **Severity**: Medium
- **Lens**: ui
- **Category**: demo-default-leakage
- **File**: src/app/api/campaigns/report-config/route.ts:21-29
- **Scenario**: An agency edits its report config and clears the client name/domain/business-line (e.g. mid-rebrand, or just deleting a wrong value to retype later) and saves. `parseClientProfile` replaces every empty field with `DEFAULT_CLIENT_PROFILE` — the seeded **Mionelo demo client** — with no warning or response flag.
- **Root cause**: "Blank submit restores the seeded demo" (line 19-20 comment) is a sensible rule for the anonymous sample tenant, but the same rule is applied to real signed-in tenants whose config "drives the branded report page and the daily report cron" (file header). An out-of-range `pnoGoal` is likewise silently coerced to the demo goal instead of 422-ing like `accentColor` does.
- **Impact**: A real customer's white-labeled, client-facing scheduled report can quietly ship branded for the wrong (demo) company, with evaluations graded against the demo's PNO target. The mixed validation contract (accentColor → 422, pnoGoal/name → silent substitution) also makes the API surprising to build UI against.
- **Fix sketch**: Apply demo defaults only for the sample tenant; for real tenants reject empty required fields and out-of-range `pnoGoal` with 422 (same style as the accentColor check), or return the sanitized profile with a `defaultsApplied: [...]` field the form can surface.

## 5. Expired Google authorization locks users out of managing accounts that need no token
- **Severity**: Medium
- **Lens**: ui
- **Category**: inconsistent-degraded-response
- **File**: src/app/api/campaigns/accounts/route.ts:43-46
- **Scenario**: GET with a valid session but a missing/expired Google access token returns a bare 403 `{error}` — omitting `connected` and `active`. Yet the two sibling degraded paths (ads-not-configured, line 40; listAccessibleCustomers failure, line 56-59) deliberately include `connected`/`active` precisely so "the UI can manage / switch them" (line 37-38 comment).
- **Root cause**: The token check sits after `listConnectedAccounts` already loaded the connected list, but the 403 branch forgets to pass it through — an inconsistency between three parallel degraded responses of the same endpoint.
- **Impact**: The most common degraded state (OAuth token expiry) is the only one where the account switcher goes empty: users can't see, switch, or disconnect accounts even though PATCH/DELETE require no Google token at all. The UI reads as "your accounts are gone" instead of "re-authorize to browse new ones."
- **Fix sketch**: Return `{ error, configured: true, accounts: [], connected, active: activeCustomerId }` with the 403 (mirroring the 502 branch), so the client renders the connected list plus a re-login prompt.
