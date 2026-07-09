# Project shell, settings & onboarding

> Context #31 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 2, Low: 2)
> Files read: 22

## 1. `/app`'s Suspense fallback reimplements — and visibly drifts from — the shared loading-shell pattern

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/app/page.tsx:12-24`
- **Scenario**: `AppHomePage` wraps `AppHomeContent` in its own inline `<Suspense fallback={...}>`: a bare `role="status"` div with `animate-loading-reveal`, `aria-busy`, and a generic `<span className="sr-only">Načítání… · Loading…</span>` — no brand mark. There is no `src/app/app/loading.tsx`, so this inline block is the *only* loading UI ever shown when a signed-in user opens `/app` (the project hub, i.e. the very first screen after auth). Every other loading state on the same authed surface uses the same `role="status"` + `animate-loading-reveal` treatment but *with* a centered `<Logo>` mark and page-specific copy: `src/app/loading.tsx` (root, "Načítání stránky… · Loading…") and `src/components/app/AppShellSkeleton.tsx:27-33` (entering a project, "Načítání aplikace… · Loading…"). The project hub's fallback is a hand-copied, incomplete variant of that same pattern — it dropped the `<Logo>` and the specific copy — so the entry point into the product looks visibly plainer than the screens on either side of it.
- **Root cause**: the fallback markup was written inline when the `<Suspense>` boundary was added (per the file's own comment, to satisfy Cache Components' request-time-read rule) instead of factoring out the shell that `src/app/loading.tsx` and `AppShellSkeleton.tsx` already established.
- **Impact**: a real, visible branding inconsistency on the highest-traffic page in the authed product (every post-login landing), and a change to the shared loading treatment (new animation, added copy) now has three places to update instead of one — and the third was already missed.
- **Fix sketch**: extract the `role="status"` + `animate-loading-reveal` + `<Logo>` + `sr-only` block into a small shared server component, e.g. `src/components/app/LoadingShell.tsx` with a `text: string` prop, and use it from `src/app/loading.tsx`, `AppShellSkeleton.tsx`, and `app/page.tsx`'s inline fallback (`text="Načítání… · Loading…"`). All three current call sites are plain server components, so this is a pure extraction with no client/server boundary to cross.

## 2. A module's route key is duplicated as an untyped literal, with no single source of truth

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/branding/page.tsx:11-13`
- **Scenario**: every module page under `/app/[projectId]/*` repeats its own route key as a bare string literal twice in the same file — once to `requireProjectModule(projectId, "branding")` (the 404/availability guard) and again to `<ModulePage moduleKey="branding">` (the header title/description lookup) — with a third implicit copy in the folder name itself (`branding/page.tsx`). The identical two-literal shape recurs verbatim in the sibling files this context also owns: `nastaveni/page.tsx` ("nastaveni"), `ucet/page.tsx` ("ucet"), `integrace/page.tsx` ("integrace") and `start/page.tsx` ("start"). `ModuleDef.key` in `src/lib/projects/modules.ts:41-56` is typed as plain `string`, so none of the three embodiments (folder name, guard literal, `ModulePage` literal) is checked against the others by the compiler.
- **Root cause**: each module page was created by copy-pasting a sibling and hand-editing the two literals; there is no per-route constant either file imports instead.
- **Impact**: the two literals can drift independently and fail differently. A typo in the guard literal is loud (an unconditional `notFound()`, easy to catch in dev). A typo in the `ModulePage moduleKey` literal is quiet: `MODULES.find` in `ModulePage.tsx:25` just returns `undefined`, and `ModulePage.tsx:26-27` falls back to an empty heading/description — the page still renders and still passes a manual click-through, just with a blank title.
- **Fix sketch**: define the key once per file, e.g. `const MODULE_KEY = "branding" as const;`, and pass that single local to both `requireProjectModule(projectId, MODULE_KEY)` and `<ModulePage moduleKey={MODULE_KEY}>` in each of the five files — reducing two independent literals per file to one. A stronger fix would have `requireProjectModule` return the resolved `ModuleDef` so `ModulePage` takes the object instead of re-looking-up a second raw string, but that changes the guard's return shape and every one of its six call sites, which is more churn than this finding's value justifies on its own.

## 3. `ucet/page.tsx` inlines account-fact derivation that every sibling page delegates to `lib/`

- **Severity**: Medium
- **Category**: structure
- **File**: `src/app/app/[projectId]/ucet/page.tsx:16-31`
- **Scenario**: every other module page this context owns is a thin guard-fetch-render shell (15-25 lines) that hands all business logic to a `src/lib/**` helper — `start/page.tsx` calls one `resolveOnboardingProgress()`, `integrace/page.tsx` calls one `integrationStatus()`. `ucet/page.tsx` breaks that pattern: it inlines ~15 lines shaping `user`/`facts`/`expiresDate`/`sessionCount` directly from the raw `session` object, with no equivalent helper in `src/lib/account/` even though that folder already exists (`src/lib/account/sessions.ts`) and is the natural home.
- **Root cause**: the account page grew feature-by-feature (profile → security checklist → session count) without a matching extraction step, unlike `start`'s onboarding logic which was pulled out into `resolveOnboardingProgress`.
- **Impact**: this derivation is only exercisable by rendering the page (no unit-testable pure function), and it's inconsistent with the convention every other file in this context follows — the next person adding a security-checklist fact has no established call site to extend and will likely keep growing the page inline.
- **Fix sketch**: add a `resolveAccountFacts(session, devAuth)` function to `src/lib/account/` (same shape as `resolveOnboardingProgress`) that returns `{ user, facts, expiresDate }`; keep `sessionCount`'s `activeSessionCount()` call in the page since it's already a thin lib call. This is a pure server-side extraction (session shaping has no client dependency), so no build risk.

## 4. Two inline sign-out server actions duplicate their shared `signOut` call

- **Severity**: Low
- **Category**: duplication
- **File**: `src/app/app/[projectId]/ucet/page.tsx:33-43`
- **Scenario**: `signOutAction` and `signOutEverywhereAction` are two `"use server"` closures defined back-to-back in the same file; both end in the identical `await signOut({ redirectTo: "/" })`, and `signOutEverywhereAction` additionally resolves `currentUserId()` and calls `revokeAllSessions(uid)` first. The shared final line is copy-pasted rather than shared.
- **Root cause**: each action was written as a standalone closure instead of one action parameterized by whether to revoke first.
- **Impact**: minimal today (one line), but the `redirectTo: "/"` destination is now a value to keep in sync in two places by hand if it ever needs to change (e.g. to a signed-out landing page).
- **Fix sketch**: have `signOutEverywhereAction` revoke sessions then call `signOutAction()` (or extract a private `doSignOut()` helper both call) instead of repeating the `signOut({ redirectTo: "/" })` line.

## 5. Stray double blank line between imports and the page function

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/app/app/[projectId]/nastaveni/page.tsx:10-11`
- **Scenario**: there are two consecutive blank lines between the last import (`ByomMatrix`) and the `export default async function Page` declaration — every sibling page in this context uses exactly one.
- **Root cause**: leftover from an edit (e.g. a removed import or comment) that wasn't cleaned up.
- **Impact**: purely cosmetic; no behavior or maintenance cost beyond a one-line formatting inconsistency.
- **Fix sketch**: delete the extra blank line so the file matches the single-blank-line convention used by `ucet/page.tsx`, `integrace/page.tsx`, `start/page.tsx` and `branding/page.tsx`.
