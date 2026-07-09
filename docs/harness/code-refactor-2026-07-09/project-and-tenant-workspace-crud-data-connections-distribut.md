# Project & tenant workspace: CRUD, data connections, distribution & social publishing

> Context #27 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 25

## 1. The project-ownership check is hand-rolled ~19 times, and the two attempts at a shared helper disagree on shape

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/projects/[id]/competitors/route.ts:9-13,30-34`
- **Scenario**: The four-line block `const { id } = await params; const uid = await currentUserId(); if (!uid) return 401 "Nepřihlášeno."; const project = await getProject(uid, id); if (!project) return 404 "Projekt nenalezen.";` is inlined verbatim in both `POST` and `DELETE` of `competitors/route.ts` (shown above) — and again in `cost-model/route.ts:10-14,31-35`, `local-signals/import/route.ts:14-18,66-70`, `onboarding/route.ts:15-19,54-58`, `organic-channels/route.ts:12-16,26-30`, `twin/route.ts:12-16,26-30`, `twin/send/route.ts:20-24`, `metrics/sync/route.ts:9-13`, and (with a slightly reordered but logically identical shape, plain `{error}` instead of `{ok:false,error}`) `catalog/import/route.ts:23-28`, `catalog/route.ts:11-16`, `catalog/sync/route.ts:17-22`. Two files even independently invented a local closure to avoid repeating it twice within themselves — `state/[key]/route.ts`'s `owner(id)` (lines 26-32, returns `{uid} | Response`) and `warehouse/route.ts`'s `ownedProject(id)` (lines 21-27, returns `{ok:true,uid} | {ok:false,res}`) — but neither is exported, so the other 11 files never found them and re-wrote the check from scratch instead. `onboarding/route.ts`'s and `organic-channels/route.ts`'s own docblocks ("Mirrors the local-signals import route's auth shape" / "Mirrors the organic-channels route's auth shape") show the team already noticed the duplication and chose to copy it forward rather than extract it.
- **Root cause**: no shared API-route guard exists for this "resolve + own-or-401/404" check. The page-side equivalent (`requireProjectModule` in `src/lib/projects/guard.ts`) exists and is used by all 30+ `/app/[projectId]/*` pages, but it calls `notFound()` and returns a bare `Project`, so it isn't reusable for a JSON API route that needs a `Response`.
- **Impact**: 13 of the 22 files in this context repeat the same tenancy check; a future change (e.g. adding a suspended-project check, or changing the 404 payload shape) means hunting down and editing ~19 call sites by hand, and it's already drifted once (the `catalog/*` trio use bare `{error}` while everything else uses `{ok:false,error}`).
- **Fix sketch**: add a sibling module `src/lib/projects/api-guard.ts` exporting `requireOwnedProject(id: string): Promise<{ uid: string; project: Project } | Response>`, built the same way `guard.ts` is (reusing `currentUserId` from `@/lib/session` and `getProject`), returning the `{ok:false,error}` 401/404 `Response.json` shape that already dominates. Replace all 19 inlined blocks and the two bespoke local helpers (`owner` in `state/[key]/route.ts`, `ownedProject` in `warehouse/route.ts`) with a single `const auth = await requireOwnedProject(id); if (auth instanceof Response) return auth;` call.

## 2. Five files reinvent `currentUserId()` instead of importing the request-deduped helper that thirteen sibling files already use

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/projects/route.ts:13-15`
- **Scenario**: `projects/route.ts` defines `async function userId() { return (((await auth())?.user as {id?:string}|undefined)?.id) ?? null; }`. The identical expression is re-typed as a named helper in `projects/[id]/route.ts:8-10` (`userId`), `campaigns/share/route.ts:17-19` (`requireUserId`), `microsite/route.ts:19-21` (`requireUserId`), and `social/accounts/route.ts:13-15` (`userId`), and inlined once more in `brand-context/route.ts:20` and `social/draft/route.ts:161`. Meanwhile `src/lib/session.ts` already exports exactly this — `currentUserId = cache(async () => ...)` — documented as "Deduped across call sites" so one navigation/request only hits the session store once; it's already imported by 13 of the other 22 files in this same context (`competitors`, `cost-model`, `twin`, `onboarding`, `organic-channels`, `local-signals/import`, `metrics/sync`, `catalog/*`, `state/[key]`, `warehouse`).
- **Root cause**: these 6 files predate (or were written without checking) `src/lib/session.ts`'s cached helper, and each new file calling `auth()` directly copied the previous one instead of switching to it.
- **Impact**: two parallel sources of truth for "who is the signed-in user" in one context; the six reinventions bypass the very request-level memoization `currentUserId()` exists for, and a future change to the session's user-id shape (e.g. adding an org claim) has to be hunted down in 6 extra places instead of one.
- **Fix sketch**: in `projects/route.ts`, `projects/[id]/route.ts`, `campaigns/share/route.ts`, `microsite/route.ts`, `social/accounts/route.ts`, `brand-context/route.ts`, and `social/draft/route.ts`, replace the local `userId()`/`requireUserId()` function (or inline expression) and the `import { auth } from "@/auth"` with `import { currentUserId } from "@/lib/session"`, and call `currentUserId()` directly. (`social/messages/route.ts` and `social/posts/route.ts` also inline this expression inside `tenantOf` — see finding 3, which supersedes this for those two files.)

## 3. `tenantOf` is a byte-identical function duplicated between the two social sub-routes

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/api/social/posts/route.ts:14-17`
- **Scenario**: `posts/route.ts` and `src/app/api/social/messages/route.ts:13-16` both define the exact same four-line function: `async function tenantOf(projectId?: string | null): Promise<string> { const uid = (((await auth())?.user as {id?:string}|undefined)?.id) ?? null; return resolveTenant(uid, projectId); }`. Both files already import `resolveTenant` from `@/lib/campaigns/connector`, so nothing about the target module is in question — the wrapper itself was just typed twice.
- **Root cause**: `social/posts/route.ts` and `social/messages/route.ts` were built as siblings (same header comment style, same `str()` helper, same tenant-resolution need) and the small wrapper was copy-pasted rather than shared.
- **Impact**: small blast radius (2 files) but a real one-line-drift risk — if either route's auth extraction changes (e.g. to use `currentUserId()` per finding 2) and the other isn't updated in lockstep, the two routes silently resolve tenancy differently for the same user.
- **Fix sketch**: add `export async function tenantForCurrentUser(projectId?: string | null): Promise<string>` to `src/lib/campaigns/connector.ts` next to `resolveTenant` (internally calling `currentUserId()` from `@/lib/session`, folding in finding 2's fix), delete the local `tenantOf` from both `social/posts/route.ts` and `social/messages/route.ts`, and call the shared export instead.

## 4. `social/draft/route.ts` repeats the same "demo vs. owned project" branch three times to fetch three different fields

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/api/social/draft/route.ts:42-89`
- **Scenario**: `resolveDataset` (42-54), `resolveBrandFallback` (59-72), and `resolveCompetitorGrounding` (76-89) all follow the identical shape: return early if `projectId` is falsy; look it up in `DEMO_PROJECTS` and return a demo-derived value if found; otherwise, if `userId` is set, call `getProject(userId, projectId)` and return a project-derived value; otherwise return the empty/undefined default. Only the final "derive a value from the resolved project" step differs (`getProjectDataset`, `loadBrandContext`, `getCompetitors` + `competitorGroundingText`).
- **Root cause**: each grounding signal (dataset, brand voice, competitors) was added independently to the social-draft AI path, and each addition copied the previous function's control flow rather than factoring out the "resolve a demo-or-owned project once" step.
- **Impact**: three near-identical 12-14 line functions in one file; a fourth grounding signal (already a pattern here — dataset, brand, competitors) would add a fourth copy, and a bug fix to the demo/ownership branching (e.g. tenancy-check hardening) has to be applied three times in the same file to stay consistent.
- **Fix sketch**: add one local helper, `async function resolveProjectFor(projectId: string | undefined, userId: string | null): Promise<Project | DemoProject | undefined>` that does the demo-lookup / `getProject` branch once, and have `resolveDataset`, `resolveBrandFallback`, and `resolveCompetitorGrounding` each call it and only do their own field-specific derivation on the result. Purely internal to this file — no other route is affected.

## 5. `warehouse/route.ts`'s `GET` and `DELETE` break the codebase's own `_req` convention for an unused request parameter

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/app/api/projects/[id]/warehouse/route.ts:29,106`
- **Scenario**: `export async function GET(req: Request, { params })` (line 29) and `export async function DELETE(req: Request, { params })` (line 106) never reference `req` in their bodies. Every sibling handler in this same context that doesn't need the request object prefixes the parameter with an underscore instead — confirmed by grep: `brand-context/route.ts` GET, `competitors/route.ts` DELETE, `cost-model/route.ts` DELETE, `local-signals/import/route.ts` DELETE, `metrics/sync/route.ts` POST, `onboarding/route.ts` DELETE, `organic-channels/route.ts` DELETE, `projects/[id]/route.ts` DELETE, `state/[key]/route.ts` GET, and `twin/route.ts` DELETE all use `_req: Request` — 10 occurrences of the convention within `src/app/api/projects` alone, none of them in `warehouse/route.ts`.
- **Root cause**: `warehouse/route.ts`'s `GET`/`DELETE` were written (or last touched) without following the `_req` convention the other handlers in the same directory settled on.
- **Impact**: purely cosmetic — no behavior risk — but it's a small inconsistency a reader has to reconcile, and a lint rule for unused parameters (if ever enabled) would flag exactly these two spots.
- **Fix sketch**: rename `req` to `_req` in the `GET` (line 29) and `DELETE` (line 106) signatures of `src/app/api/projects/[id]/warehouse/route.ts` to match the rest of the context.
