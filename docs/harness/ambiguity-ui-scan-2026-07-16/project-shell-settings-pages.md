# Project shell, settings & onboarding — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. Expired session surfaces as a 404, not a sign-in prompt
- **Severity**: High
- **Lens**: ambiguity
- **Category**: session-expiry-404
- **File**: src/app/app/[projectId]/layout.tsx:42 (and src/lib/projects/guard.ts:20)
- **Scenario**: A signed-in user leaves a tab open; the session cookie expires (or they sign out elsewhere via "sign out everywhere" on /ucet). They then click any sidebar module. Client-side navigation keeps the parent /app layout (the AuthGate) mounted, so only the module page / ProjectGate re-runs on the server — `currentUserId()` is now null and both the layout and `requireProjectModule` call `notFound()`.
- **Root cause**: "No user" and "project doesn't exist / isn't yours" are collapsed into the same `notFound()` branch. The 404 is deliberate anti-enumeration for foreign project IDs, but a missing session is a different condition that the AuthGate upstream was supposed to own — it just never re-executes on client nav.
- **Impact**: The user lands on the root not-found page mid-work with no hint that they were merely signed out. It reads like their project was deleted ("data loss" panic) and offers no recovery path back to sign-in.
- **Fix sketch**: In both spots, on `!userId` do `redirect("/app")` (where the AuthGate renders AppSignInGate) instead of `notFound()`; keep `notFound()` only for the missing/foreign-project and unavailable-module cases.

## 2. Blank screen while the auth gate resolves (`fallback={null}`)
- **Severity**: Medium
- **Lens**: ui
- **Category**: missing-loading-state
- **File**: src/app/app/layout.tsx:22
- **Scenario**: Any cold entry to /app or /app/[projectId] (fresh tab, hard refresh, marketing-site link). Under Cache Components the layout's prerendered static shell is exactly the Suspense fallback — which is `null` — so the user stares at an empty page until the server session read streams in.
- **Root cause**: The session read was correctly pushed inside a Suspense boundary (per the file's own header comment), but the fallback was left as `null`, unlike the sibling patterns: /app/page.tsx renders a `role="status"` spinner shell and the project layout renders `AppShellSkeleton`.
- **Impact**: A white flash / dead page on every first paint of the authed surface — the one moment the product is judged on. Also invisible to screen readers (no `role="status"` announcement), so assistive tech gets silence rather than "loading".
- **Fix sketch**: Reuse the /app/page.tsx fallback pattern (`role="status"` + `animate-loading-reveal` + sr-only "Načítání…") — or `AppShellSkeleton` when the path is a project route — as the layout fallback instead of `null`.

## 3. Account-wide BYOM keys live in per-project "Nastavení" with a stale rationale
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: stale-rationale-misplaced-scope
- **File**: src/app/app/[projectId]/nastaveni/page.tsx:1-3,21
- **Scenario**: A user with two projects saves an API key in project A's Nastavení, then opens project B and finds "their project's" key already set — or worse, deletes it there believing it only affects project B. A developer reading the header comment ("shown here since the app has no dedicated account area") is told an account area doesn't exist.
- **Root cause**: The justification predates the /ucet module, whose own header literally says "Účet / Account & Security … Account-level". The comment was never reconciled, so the placement now contradicts the information architecture the sidebar presents.
- **Impact**: Users mis-model key scope (per-project vs account) with real consequences on delete/rotate; future developers duplicate the "no account area" assumption when placing the next account-level feature.
- **Fix sketch**: Either move `<ByomKeys />` (and its quality/matrix views) to the /ucet module, or keep placement but fix the comment and make the UI state the scope explicitly ("Platí pro celý účet, ne jen tento projekt").

## 4. /ucet feeds its "honest" security checklist dishonest sentinels
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: sentinel-values-conflation
- **File**: src/app/app/[projectId]/ucet/page.tsx:19,30-31
- **Scenario**: (a) `user.id` falls back to the literal em-dash `"—"` — a display concern smuggled into the data model; anything downstream keying or comparing on `user.id` silently operates on "—". (b) `expiresDate = session.expires.slice(0, 10)` truncates the ISO timestamp in UTC, so a session expiring 00:30 CET renders as the previous day. (c) `sessionCount` is `0` both for "dev-auth, unknowable" and for a real account with zero rows — the component can't distinguish "no data" from "none".
- **Root cause**: Three ad-hoc coercions at the page boundary instead of typed absence (`null`) and locale-aware formatting; ironic in a module whose stated design goal is being "honest about it" for dev sessions.
- **Impact**: Off-by-one expiry dates for the product's own (Czech, UTC+1/+2) users, and a checklist that can assert facts ("0 active sessions") it never measured.
- **Fix sketch**: Use `id: su?.id ?? null` and let the component render the dash; format expiry with the existing locale formatter from a `Date` (not string slice); make `sessionCount: number | null` with `null` for DEV_AUTH/unknown.

## 5. Dead `: [project]` fallback implies an anonymous overview mode that can't happen
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: unreachable-branch
- **File**: src/app/app/[projectId]/page.tsx:17-18
- **Scenario**: A developer reads `const projects = userId ? await listProjects(userId) : [project];` and infers the overview must handle a null user (single-project degraded mode) — but `requireProjectModule` on line 13 already `notFound()`s when there is no user, so `userId` is always non-null here and the branch never runs.
- **Root cause**: The guard resolves and asserts the user internally but returns only the project, forcing callers (this page, start/page.tsx, integrace/page.tsx) to re-fetch `currentUserId()` and re-handle a nullability the guard has already eliminated.
- **Impact**: Misleading control flow that invites defensive code in every module page, and a typed-nullable `userId` threaded into OnboardingProgressCard even though the route guarantees it exists.
- **Fix sketch**: Have `requireProjectModule` return `{ project, userId }` (userId typed non-null); drop the ternary and pass the guaranteed userId straight through.
