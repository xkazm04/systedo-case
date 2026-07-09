# Auth & BYOM entitlements

> Context #24 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 14

## 1. `guard.ts` reimplements the codebase's canonical, memoized `currentUserId` instead of importing it

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/byom/guard.ts:7-9`
- **Scenario**: `guard.ts` defines its own private `currentUserId()` — `(((await auth())?.user as { id?: string } | undefined)?.id) ?? null`. The exact same one-liner is hand-rolled independently in at least 27 other route files (`src/app/api/alerts/route.ts:9-11`, `src/app/api/microsite/route.ts:19-21`, `src/app/api/experiments/route.ts:20-21`, `src/app/api/keywords/lists/route.ts:19-21`, `src/app/api/campaigns/share/route.ts:17-18`, `src/app/api/campaigns/control-plane/route.ts:20-21`, `src/app/api/campaigns/report-config/route.ts:14-15`, `src/app/api/images/attribution/route.ts:23-24`, and 19 more). Meanwhile `src/lib/session.ts` already exports a `currentUserId` built for exactly this — wrapped in React's `cache()` so the id (and the underlying `auth()`/Firestore session read) is deduped once per request instead of re-fetched by every helper that wants it. `guard.ts` bypasses that memoization entirely.
- **Root cause**: `src/lib/session.ts`'s cache-wrapped accessor was added later (per its docstring, specifically to stop "each hitting the Firestore session store on the same navigation"); `guard.ts` and the 27 route files predate it or were never migrated.
- **Impact**: Every BYOM request does its own uncached `auth()` call instead of sharing the one `session.ts` already memoizes elsewhere in the same request. Beyond the perf cost, this is 28 copies of one-line security-relevant logic (how a user id is derived from a session) that must be kept in sync by hand — a future change to the session shape (e.g. a different id field, an impersonation flag) means touching 28 files instead of 1.
- **Fix sketch**: In `src/app/api/byom/guard.ts`, delete the local `currentUserId` (lines 7-9) and `import { currentUserId } from "@/lib/session";` instead; `requireUser()`'s body is unchanged since the signature matches exactly. (The other 27 call sites are outside this context's file list but are the same fix.)

## 2. The "test a vendor key and record the result" sequence is duplicated between `keys/route.ts` and `validate/route.ts` — and has already drifted

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/byom/keys/route.ts:37-43`
- **Scenario**: After storing a new key, `keys/route.ts` POST does `resolveByomKey` → `validateVendorKey(vendor, apiKey, model, fastModel)` → `markByomValidation` → `Response.json({ config, validation })`. `src/app/api/byom/validate/route.ts:18-28` ("test connection") does the identical `resolveByomKey` → `validateVendorKey` → `markByomValidation` → `Response.json({ config, validation })` sequence with the same four `validateVendorKey` arguments. The two copies have already diverged on the "no resolved key" edge case: `keys/route.ts` falls through to a synthetic `{ ok: false, error: "Uložený klíč se nepodařilo načíst." }` and still calls `markByomValidation` + returns 200; `validate/route.ts` short-circuits with a 400 and never calls `markByomValidation`. That may be intentional (different call context), but nothing documents the divergence — the next person to touch one copy has no signal the other exists.
- **Root cause**: "store a key" and "re-test a key" were built as two independent routes without factoring out the shared resolve→validate→record step.
- **Impact**: A future change to the validation flow (e.g. add telemetry, change the failure message, add a retry) is easy to apply to one route and forget the other, silently reintroducing the inconsistency that already exists in the null-resolved branch.
- **Fix sketch**: Add a helper (e.g. `testAndRecordByomKey(userId, vendor)`) to `src/lib/llm/keys/store.ts` that does `resolveByomKey` → `validateVendorKey` → `markByomValidation` and returns `{ validation }` (or `null` if unresolved, so each call site keeps its own "no key" handling — `validate/route.ts` returning its 400, `keys/route.ts` keeping its post-write fallback). Call it from both routes; each still owns its own `Response.json({ config, ... })` wrapping.

## 3. The vendor-validity guard clause is copy-pasted across all four mutating BYOM routes

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/api/byom/route.ts:34-37`
- **Scenario**: `if (!isByomVendor(vendor)) return Response.json({ error: "Neznámý poskytovatel.", code: "invalid" }, { status: 400 })` (or the equivalent via a locally-defined `bad()`) is repeated verbatim in `src/app/api/byom/route.ts:35-37`, `src/app/api/byom/keys/route.ts:53-55`, `src/app/api/byom/matrix/route.ts:15-17,36`, and `src/app/api/byom/validate/route.ts:14-16` — four files, same string, same status code, same shape. `guard.ts`'s own docstring says it exists to be "a helper the sibling routes import" for exactly this kind of shared gate, but this particular check never made it there.
- **Root cause**: Each route was written independently and inlined the check rather than adding it to the shared `guard.ts`.
- **Impact**: Low risk today (the four copies are still identical), but it's the same maintenance trap as finding 1 at smaller scale — the error copy or status code can only be changed correctly by touching four files, and a fifth future BYOM route is likely to copy-paste a fifth inline copy rather than discover the pattern.
- **Fix sketch**: Add `export function requireByomVendor(vendor: unknown): ByomVendor | Response` to `src/app/api/byom/guard.ts`, returning the vendor or the standard 400. Replace the four inline checks (including matrix/route.ts's local `bad()` usage at line 36) with a call to it.

## 4. `DEV_AUTH`'s default identity is duplicated between `auth.ts` and the local-mode user store

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/auth.ts:27-28`
- **Scenario**: `DEV_SESSION`'s fallback name/email — `process.env.DEV_AUTH_USER_NAME || "Dev Tester"` and `process.env.DEV_AUTH_USER_EMAIL || "dev@local.test"` — are re-declared with the same literals in `src/lib/users/local.ts:41-42` (`ensureLocalUser`'s `info?.name ?? process.env.DEV_AUTH_USER_NAME ?? "Dev Tester"` / `... ?? "dev@local.test"`). `local.ts`'s own comment claims parity: "filling name/email from the DEV_AUTH_* env — the same identity DEV_SESSION uses" — but nothing enforces that; it's two hand-copied string literals.
- **Root cause**: `local.ts` needs the same dev identity to seed a matching sqlite row, and re-derived it from the env vars instead of importing the already-computed value.
- **Impact**: Low — both are dev-only paths — but if either default string is edited without the other, the sqlite user's `name`/`email` silently stops matching the session's, breaking the documented invariant with no test to catch it.
- **Fix sketch**: Extract the two fallback literals into a small dependency-free module (e.g. `src/lib/dev-auth-identity.ts` exporting `DEV_AUTH_DEFAULT_NAME`/`DEV_AUTH_DEFAULT_EMAIL`, or a `devAuthIdentityDefaults()` function) and import it from both `src/auth.ts` and `src/lib/users/local.ts`. Avoid having `local.ts` import `src/auth.ts` directly for this — `auth.ts` pulls in `@auth/firebase-adapter`/`firebase-admin`, which `local.ts`'s `LOCAL_DB`-only sqlite path currently has no dependency on.

## 5. `signIn` is exported from `src/auth.ts` but never imported anywhere

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/auth.ts:56`
- **Scenario**: `export const signIn = nextAuth.signIn;` (the server-action sign-in from Auth.js). A repo-wide grep for `from "@/auth"` imports shows every consumer that needs `signIn` uses `next-auth/react`'s client-side `signIn` instead (`AuthButton.tsx`, `SocialClient.tsx`, `AppSignInGate.tsx`, `AdsAccountPicker.tsx`) — a different function from a different module. The one place that does import from `@/auth` alongside `DEV_AUTH` (`src/app/app/[projectId]/ucet/page.tsx:7`) imports only `{ DEV_AUTH, signOut }`, not `signIn`. No barrel or re-export references it either.
- **Root cause**: Likely added for symmetry with `signOut` (which *is* used server-side in `ucet/page.tsx` for the "sign out everywhere" flow) but the server-action `signIn` never got a caller — all sign-in entry points are client-side buttons.
- **Impact**: Trivial today; a reader scanning `auth.ts`'s exports for what's actually load-bearing has to separately verify this one isn't used.
- **Fix sketch**: Delete `export const signIn = nextAuth.signIn;` at `src/auth.ts:56`. If a server-action sign-in is wanted later, re-add it then.
