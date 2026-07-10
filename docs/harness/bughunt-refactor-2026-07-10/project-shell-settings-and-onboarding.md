# Project shell, settings & onboarding

> Total: 5
> Critical: 0 · High: 0 · Medium: 3 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Invalid/reserved `projectId` in the route makes Firestore `.doc()` throw → 500 instead of the guard's promised 404

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/app/[projectId]/layout.tsx:44`
- **Scenario**: `ProjectGate` passes the raw `[projectId]` route param straight into `getProject(userId, projectId)` (line 44), which calls `firestore.collection("users").doc(userId).collection("projects").doc(projectId)` (`store.firestore.ts:48`). The firebase-admin Firestore SDK **validates document paths** and throws on invalid ones: a reserved id matching `__.*__` (e.g. navigate to `/app/__proto__` — a perfectly routable segment, no encoding needed), an id containing a slash (`/app/a%2Fb`), an empty/over-1500-byte id, etc. The result is an unhandled exception, not a `null`. The module pages hit the same path via `requireProjectModule` (e.g. `nastaveni/page.tsx:15`, `page.tsx:13`).
- **Root cause**: the guard/layout assume every `projectId` is a syntactically valid Firestore document id and treat "not found" and "invalid" as the same case — but `getProject` returns `null` only for *valid-but-absent* ids; *invalid* ids throw before the existence check. The intended contract ("404 if the project doesn't exist / isn't theirs", per the guard's own doc comment) is silently broken for malformed input.
- **Impact**: an authenticated user (or a crawler/scanner) hitting `/app/__proto__` or any malformed id gets a 500 (escalated to the root error page — see finding #2) plus a logged exception polluting error tracking, instead of a clean `notFound()`. Firestore backend only; the local sqlite `getProject` returns `null` and is unaffected, so this is a production-path bug.
- **Fix sketch**: sanitize/guard before the store call — either validate `projectId` against Firestore's id rules (non-empty, no `/`, not `__.*__`, ≤1500 bytes) and `notFound()` on failure, or wrap `getProject` so a thrown path-validation error resolves to `null`. Cleanest is a small `isValidDocId(projectId)` check in `requireProjectModule`/`ProjectGate` returning `notFound()`.

## 2. Shell-layout I/O throws escape the module `error.tsx`, destroying the app shell the comment promises to keep

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/app/[projectId]/layout.tsx:44-48`
- **Scenario**: `ProjectGate` awaits `getProject` and `listProjects` (Firestore reads) inside the layout. `[projectId]/error.tsx` is nested *inside* this layout, so by Next.js's boundary rules it cannot catch a throw from its own layout — and there is **no `src/app/app/error.tsx` and no `src/app/error.tsx`… wait, there IS a root `src/app/error.tsx`** but nothing between it and this layout. So any transient Firestore failure (network blip, quota, cold admin init) in `listProjects`/`getProject` bubbles all the way to the **root** error boundary, which replaces the *entire* page — sidebar, topbar, project switcher — with a full-page error. The layout's own doc comment ("the app shell / sidebar stays, so a module throw shows a branded, retryable card… the user keeps their navigation") only holds for throws in the *page*, never for the shell layout's own reads.
- **Root cause**: request-time I/O that can fail was placed in a layout that has no error boundary at or above its own segment; the retry affordance (`error.tsx` + `reset()`) covers the children but not the shell that produces them.
- **Impact**: a recoverable, momentary store error mid-session nukes the whole workspace UI and loses in-app navigation, rather than the intended in-shell retry — the exact failure mode the design set out to prevent. Compounds finding #1 (a malformed-id throw takes this same path).
- **Fix sketch**: add `src/app/app/[projectId]/error.tsx`'s coverage for the layout by introducing an `src/app/app/error.tsx` (so a shell throw at least keeps the marketing-free authed frame and offers retry), or move the fallible reads behind a try/catch that renders a scoped retry card while keeping `AppShell` mounted.

## 3. "Sign out everywhere" swallows revoke failures and reports success anyway (security success-theater)

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/app/[projectId]/ucet/page.tsx:38-43`
- **Scenario**: `signOutEverywhereAction` calls `await revokeAllSessions(uid)` then unconditionally `await signOut({ redirectTo: "/" })`. `revokeAllSessions` (`account/sessions.ts:24-35`) is wrapped in `try { … } catch { return 0 }` — any Firestore error (batch commit failure, partial delete, permission blip) is swallowed and returns `0`. The action **discards that return value entirely** and proceeds to sign out the current device and redirect home. The user sees the identical happy-path outcome whether every other device's session was actually revoked or none were.
- **Root cause**: the security-critical revoke is treated as best-effort fire-and-forget; the "everywhere" guarantee is never verified, and there is no failure signal back to the UI.
- **Impact**: a user who clicks "sign out everywhere" after e.g. losing a laptop is told (by the redirect) that it worked, while stolen-device sessions may remain live. Silent failure on a trust/security action is materially worse than a visible error.
- **Fix sketch**: have `revokeAllSessions` distinguish "0 sessions" from "failed" (e.g. throw on commit error), and have the action surface a failure (don't redirect / show an error) when revocation didn't succeed, rather than always falling through to `signOut`.

## 4. Session-expiry date slices a UTC ISO string and shows it as a local date (off-by-one near midnight)

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/app/[projectId]/ucet/page.tsx:30`
- **Scenario**: `expiresDate = … session.expires.slice(0, 10)` takes the first 10 chars ("YYYY-MM-DD") of the UTC ISO timestamp and passes it to `AccountSecurity` as the expiry date. For a Czech user (UTC+1/+2), a session expiring at `2026-07-10T22:30:00.000Z` is locally already `2026-07-11 00:30`, but the panel displays `2026-07-10`. Every other date in the app goes through the cs-CZ locale formatter (`lib/format.ts`); this one bypasses it and leaks the UTC calendar day.
- **Root cause**: string-slicing an ISO timestamp assumes the UTC date equals the viewer's local date, which is false for the ~2 hours before midnight local time.
- **Impact**: cosmetic but user-visible in a security panel — the shown "session expires" day can be one day early. Low, display-only.
- **Fix sketch**: parse `session.expires` to a `Date` and format it with the app's locale date formatter (or `toLocaleDateString` in the user's zone) instead of `slice(0, 10)`.

## 5. `requireProjectModule` resolves and discards `userId`, forcing pages to re-read the session

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: structure
- **File**: `src/app/app/[projectId]/integrace/page.tsx:12-13`
- **Scenario**: `requireProjectModule` (`guard.ts:19`) internally does `const userId = await currentUserId()` and then returns only the `Project`, throwing the id away. So every page that also needs the user id calls `currentUserId()` a *second* time right after the guard: `integrace/page.tsx:13`, `start/page.tsx:14`, and `[projectId]/page.tsx:17`. It's correct (React `cache()` dedupes the read) but it's an awkward API seam — three files re-derive a value the guard already had in hand.
- **Root cause**: the guard's return shape exposes the project but not the session identity it necessarily resolved to produce it.
- **Impact**: minor structural noise / extra ceremony in three page files; no correctness cost today. (Distinct from the 2026-07-09 report's finding #2, which proposed returning the resolved `ModuleDef` to avoid `ModulePage`'s re-lookup — this is about the discarded `userId`, a different value and different call sites.)
- **Fix sketch**: have `requireProjectModule` return `{ project, userId }` (it already holds both) so the three pages destructure the id instead of re-calling `currentUserId()`.
