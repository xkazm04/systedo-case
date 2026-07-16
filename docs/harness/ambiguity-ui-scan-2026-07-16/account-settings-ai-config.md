# Account, Settings & AI Model Configuration — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. Project delete never checks the response — failure still navigates away as if it succeeded
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unchecked-delete-response
- **File**: src/components/app/modules/ProjectSettings.tsx:118-127
- **Scenario**: User confirms "Delete project"; the API returns 403/409/500 (e.g. not owner, server error). `remove()` does `await fetch(...)` with no `res.ok` check, so any non-network failure falls through to `router.push("/app")` + `router.refresh()`.
- **Root cause**: Only the thrown-network path is handled (`catch { setSaving(false) }`); an HTTP error response resolves normally and is treated as success.
- **Impact**: User is bounced to /app believing the project is gone; it reappears in the workspace list with zero explanation. Inverse hazard of a destructive action: false confirmation of deletion. Also no error message is ever shown for this flow (the shared `error` state is unused here).
- **Fix sketch**: `if (!res.ok) { setError((await res.json().catch(()=>({}))).error ?? t("errorGeneric")); setSaving(false); return; }` before navigating; reuse the existing error banner.

## 2. Failed BYOM key save silently wipes the pasted key and collapses the input
- **Severity**: High
- **Lens**: ui
- **Category**: destructive-state-reset-on-error
- **File**: src/components/app/modules/ByomKeys.tsx:177-183
- **Scenario**: User pastes an API key and hits Connect; the server rejects it (invalid format, 4xx) or `call()` sets an error. `saveKey` then unconditionally runs `setKeyDraft(... "")` and `setShowKeyInput(... false)` — the draft is erased and the input hidden even though nothing was saved.
- **Root cause**: `call()` swallows failure into shared `error` state and resolves `void`; `saveKey` has no way to know the mutation failed, so its "success" cleanup always runs.
- **Impact**: The user sees a generic error banner at the top while the form that caused it disappears (replace-key case) or clears; they must re-find and re-paste the secret, and it's unclear whether the old key was replaced. For a credentials flow this is a serious trust/UX hazard.
- **Fix sketch**: Have `call()` return a success boolean (or the parsed json); in `saveKey`, only clear the draft and hide the input when it returns ok. Same pattern would let `removeKey`/`setActive` skip optimistic UI on failure.

## 3. "Request account deletion" confirms a GDPR request that is never recorded anywhere
- **Severity**: High
- **Lens**: ambiguity
- **Category**: false-affordance-no-op-confirm
- **File**: src/components/app/modules/AccountSecurity.tsx:171-179
- **Scenario**: User clicks "Request account deletion" → confirm button "Opravdu chci smazat účet" (styled as a destructive filled-red action with a Check icon). Clicking it only flips two local `useState` flags and reveals a mailto link. Nothing is sent to the server, no ticket/flag is created; a page refresh loses even the "requested" state.
- **Root cause**: The two-step confirm pattern (borrowed from real destructive flows like ProjectSettings' delete) is applied to what is actually just "reveal the support email" — the strongest-looking button on the page performs no action.
- **Impact**: Users reasonably believe their GDPR deletion request was filed the moment they press the red confirm button; if they never send the follow-up email, the request silently doesn't exist. That's a compliance-adjacent expectation gap, not just polish. The file's header comment says "this surface only *requests* it" — but it doesn't even request; it only instructs.
- **Fix sketch**: Either POST a deletion-request record (so support has a trail and the state survives refresh), or downgrade the affordance: replace the red confirm button with neutral "Show contact instructions" copy so the visual weight matches the actual effect, and state explicitly that nothing is filed until the email is sent.

## 4. Entitled users get a blank void when /api/byom is slow or fails — no loading or error state
- **Severity**: Medium
- **Lens**: ui
- **Category**: missing-loading-error-states
- **File**: src/components/app/modules/ByomKeys.tsx:116-133, 206 (same pattern: ByomMatrix.tsx:77-93, 120)
- **Scenario**: The GET `/api/byom` fetch errors, returns non-ok, or is just slow. Both components `return null` — a paying "Your-key" customer opens AI settings and the entire keys section plus operations matrix simply doesn't exist, with no spinner, retry, or message ("settings chrome — stay silent on failure").
- **Root cause**: A single `State | null` encodes loading, error, and not-yet-fetched identically; non-ok responses bail out before `setState` ever runs.
- **Impact**: Indistinguishable from "the feature was removed"; users can't tell entitlement lapse from outage, and there is layout shift when the section pops in late. "Stay silent" is defensible for decorative chrome, not for the page whose whole purpose is these controls.
- **Fix sketch**: Track `"loading" | "error" | State`; render a skeleton card while loading and a small inline retry message on failure. One shared loader (see finding 5) fixes both components at once.

## 5. ByomKeys and ByomMatrix duplicate the same fetch/config/error machinery — and diverge in how
- **Severity**: Medium
- **Lens**: ui
- **Category**: repeated-pattern-should-be-shared
- **File**: src/components/app/modules/ByomKeys.tsx:97-169 vs src/components/app/modules/ByomMatrix.tsx:67-108
- **Scenario**: Both components independently GET `/api/byom` on mount (two round-trips for one settings page), each with its own copy of `type State = { entitled; config }`, the `alive` cleanup dance, and a mutation wrapper that parses `{ error, config }` and patches state. ByomMatrix uses the shared `useAsyncAction` hook; ByomKeys hand-rolls `busy`/`error`/`notice` with string-keyed busy actions.
- **Root cause**: The matrix was extracted later and adopted `useAsyncAction`, but ByomKeys was never converged; there is no shared `useByomConfig()` source of truth.
- **Impact**: Double fetch means the two sections can disagree after a mutation (saving a key in ByomKeys does not refresh the matrix's `configured` vendor list until reload — the matrix keeps saying "connect a key above first" right after you connected one). Divergent error handling means future fixes (like finding 2 or 4) must be made twice and can drift.
- **Fix sketch**: Extract a `useByomConfig()` hook (or lift state to the parent settings page) providing `{ state, apply(url, opts), busy, error }` on top of `useAsyncAction`; both components consume it, giving one fetch, consistent busy/error semantics, and cross-section consistency after mutations.
