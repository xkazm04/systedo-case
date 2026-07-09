# Account, Activity Feed, Demo Data, Users & Usage Metering

> Context #44 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 17

## 1. `csvCell` reimplemented three times with drifted edge cases

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/activity/compute.ts:37-39`
- **Scenario**: The exact same RFC-4180 cell-escaping regex exists in three places: `src/lib/activity/compute.ts:37` (`ActivityModule.tsx`'s CSV export), `src/lib/ltv/compute.ts:308` (`buildCohortCsv`), and inlined again in `src/components/app/modules/SpendModule.tsx:36` as a local const. The `ltv` copy additionally tests for `\r` (`/[",\n\r]/`) and accepts `string | number`; the other two only test `/[",\n]/` and accept `string`. A developer fixing a CSV-escaping bug in one copy (e.g. adding CRLF handling) has no reason to know two siblings exist and silently leaves them unfixed.
- **Root cause**: Each CSV-export feature (activity, LTV cohorts, spend/usage) was built independently and each needed the same one-line escape helper, so each got its own copy instead of reaching for a shared util.
- **Impact**: Three maintenance sites for one rule; the already-observed drift (missing `\r` handling in two of three) means a value containing a bare carriage return exports unescaped in the activity and spend CSVs today.
- **Fix sketch**: Add `src/lib/csv.ts` exporting a single `csvCell(value: string | number): string` (using the more complete `\r`-aware regex from `ltv/compute.ts:308`). Update `src/lib/activity/compute.ts` to import and re-export it (keep `csvCell` exported from here too, since `ActivityModule.tsx` imports it from this path), delete the local copy in `src/lib/ltv/compute.ts`, and replace the inline const in `src/components/app/modules/SpendModule.tsx:36` with an import.
- **Build risk**: Keep the new `src/lib/csv.ts` framework-free (no `server-only`, no Node built-ins) — `SpendModule.tsx` is a `"use client"` component, so anything it transitively imports must stay client-safe; tsc will not catch a violation (constraint #3).

## 2. Two exported `users/local.ts` helpers have no caller

- **Severity**: High
- **Category**: dead-code
- **File**: `src/lib/users/local.ts:52-62`
- **Scenario**: `getLocalUser(id)` (line 52) and `listLocalUsers()` (line 57) are exported but never imported anywhere in `src/`. Every real caller of this module (`catalog/store.local.ts`, `projects/store.local.ts`, `project-state/store.local.ts`, `llm/keys/store.local.ts`, `inventory/connection-store.local.ts`) only uses `ensureLocalUser`. Repo-wide grep for `getLocalUser` and `listLocalUsers` returns only their own definitions.
- **Root cause**: Likely written alongside `ensureLocalUser` to round out a CRUD-shaped local-user API, but no LOCAL_DB admin/listing surface ever materialized to consume them.
- **Impact**: Two functions (plus the `UserRow`→`LocalUser` mapping path they exercise) are pure dead weight — extra surface to read, test, and keep in sync with the `users` table schema for no behavioral benefit.
- **Fix sketch**: Delete `getLocalUser` (lines 52-55) and `listLocalUsers` (lines 57-62) from `src/lib/users/local.ts`. If a future admin/local-users view needs them, they're one git-log lookup away.

## 3. `usage.ts` re-exports `plans.ts` symbols that nothing imports through it

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/usage.ts:14-15`
- **Scenario**: `usage.ts` re-exports `{ PLANS, planHasByom }` (line 14) and the types `{ Plan, UsageKind, UsageStatus, PlanLimits }` (line 15) "for back-compat" per the file's own header comment. Every actual consumer (`components/usage/UsageMeter.tsx`, `app/cena/page.tsx`, `lib/llm/byom/request.ts`) imports these directly from `@/lib/plans` instead — repo-wide grep finds zero imports of `PLANS`, `planHasByom`, or the four re-exported types via the `@/lib/usage` path.
- **Root cause**: `plans.ts` was split out of `usage.ts` (per its own header: "so client components... can import the limits/labels without pulling firebase-admin into the browser/edge bundle") and the re-export was kept in `usage.ts` for compatibility that no caller ended up needing.
- **Impact**: Small but real — a maintainer editing `usage.ts` has to reason about an export surface with zero actual readers, and it invites new server-only code to import plan types through the wrong (Firestore-adjacent) module by mistake.
- **Fix sketch**: Delete lines 14-15 from `src/lib/usage.ts` (the `export { PLANS, planHasByom };` and `export type { ... } from "@/lib/plans";` lines). Keep the plain `import` on line 12 since `PLANS`/`planHasByom` are still used internally by `statusFrom`, `getUserPlan`, and `byomUnlocked`.

## 4. `activeSessionCount` and `revokeAllSessions` duplicate the same session query

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/account/sessions.ts:12-35`
- **Scenario**: Both exported functions open with the identical line `firestore.collection(SESSIONS).where("userId", "==", userId).get()` (line 14 and line 26) before diverging into count-vs-delete behavior.
- **Root cause**: Each function was written as a self-contained try/catch around its own query rather than sharing the fetch step.
- **Impact**: Minor today (one duplicated line), but any future change to the query (e.g. adding an `orderBy`, or scoping to non-expired sessions) has two call sites to update in lockstep, and it's easy to update one and miss the other.
- **Fix sketch**: Extract a private `async function userSessionDocs(userId: string)` that runs the shared query and returns `snap` (or `[]` on error), then have `activeSessionCount` return `docs.length` and `revokeAllSessions` batch-delete `docs`. Keep both public signatures unchanged.

## 5. `demo/projects.ts` mixes project-catalog and module-routing concerns

- **Severity**: Low
- **Category**: structure
- **File**: `src/lib/demo/projects.ts:56-74`
- **Scenario**: The file's name and top-of-file comment describe it as "Demo workspace projects," and half its exports (`DEMO_PROJECTS`, `demoProjectFor`, `demoProjectForModule`) are exactly that. But lines 56-74 (`MODULE_ALIASES`, `demoModuleFor`, `demoHref`) are about resolving and linking to demo *modules*, not projects — a developer looking for how the `?m=` query param maps to a `ModuleDef`, or how retired module keys (`obsah`, `rychla-reakce`) redirect, has no reason to look in a file called `projects.ts`.
- **Root cause**: Both concerns are small enough (and both needed by `DemoShell.tsx`/`DemoModule.tsx`) that they were added to the same file as it grew, rather than being split when the module-routing half was introduced.
- **Impact**: Minor discoverability cost; not a correctness issue. Low risk, but touches three import sites, so only worth doing opportunistically.
- **Fix sketch**: Move `MODULE_ALIASES`, `demoModuleFor`, and `demoHref` into a new `src/lib/demo/module-routing.ts` (or similar), re-exporting nothing from `projects.ts`. Update the three importers: `src/components/demo/DemoShell.tsx` (`demoHref`), `src/components/demo/DemoModule.tsx` (`demoHref`), and `src/app/dashboard/page.tsx` (`demoModuleFor`).
- **Build risk**: `demo/projects.ts` is explicitly framework-free so it can be imported "from both the server dispatcher and the client shell" (per its header comment) — keep the new file equally framework-free (no `server-only`, no Node built-ins), since `DemoShell.tsx`/`DemoModule.tsx` are client components and tsc won't flag a violation (constraint #3).
