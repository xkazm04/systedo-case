# AI generation, creative studio & ops telemetry

> Context #28 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 1, Low: 2)
> Files read: 9

## 1. The paid-generation abuse-guard sequence is copy-pasted verbatim into 3 route files

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/ai/route.ts:253-265`
- **Scenario**: The exact same three-step guard — `tooLarge(request)` → `durableGuard(clientIp(request), [RATE_RULES.aiPerMin(), RATE_RULES.aiPerDay()], { spendUnits: 1 })` → `acquireSlot()` — is re-implemented line-for-line in `src/app/api/images/nobg/route.ts:23-33` and `src/app/api/images/route.ts:42-52` (only the Czech 429 wording differs: "Příliš mnoho požadavků." vs "Příliš mnoho generování."). `src/app/api/images/upload-ref/route.ts:23-29` shows the drift risk already materializing: it hits the same paid Leonardo API but was copy-pasted with the `tooLarge`/`acquireSlot` steps *omitted*, so a new paid endpoint author has no single place to see "this is the full guard" — they see three inconsistent examples.
- **Root cause**: `src/lib/ai/rate-limit.ts` exports the individual primitives (`tooLarge`, `durableGuard`, `acquireSlot`, `tooManyRequests`) but never composes them into one call, so every paid route hand-assembles the sequence itself.
- **Impact**: Any future change to the guard order (e.g. adding a body-shape check before the rate limit, or fixing an `acquireSlot`/`releaseSlot` pairing bug) must be applied identically in 3 places by hand; a missed copy silently reopens the abuse window on one endpoint while the others stay protected.
- **Fix sketch**: Add `export async function guardPaidGeneration(request: Request, message = "Příliš mnoho požadavků. Zkuste to prosím znovu za ${retryAfter} s."): Promise<Response | null>` to `src/lib/ai/rate-limit.ts` that runs `tooLarge` → `durableGuard([aiPerMin, aiPerDay], { spendUnits: 1 })` → `acquireSlot()` and returns the first failing `Response`, or `null` to continue. Replace the three blocks in `ai/route.ts`, `images/nobg/route.ts`, and `images/route.ts` with `const guard = await guardPaidGeneration(request); if (guard) return guard;`. `releaseSlot()` stays in each route's own `finally` (unchanged).

## 2. `ai/route.ts` re-derives "demo-or-owned project" tenancy three separate times

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/ai/route.ts:135-248`
- **Scenario**: `resolveGrounding` (135-183), `resolveBrandContext` (191-204), and `resolveLeadGrounding` (236-248) all implement the identical control-flow skeleton: `if (!projectId) return <base>; const demo = DEMO_PROJECTS.find(p => p.id === projectId); if (demo) return <demo-derived>; if (userId) { const project = await getProject(userId, projectId); if (project) return <project-derived>; } return <base>;`. Only the payload built from `demo`/`project` differs between the three.
- **Root cause**: Each of the three grounding helpers was added independently (brief grounding, chat/recap grounding, LP-variant grounding) by copying the nearest existing resolver rather than factoring out the shared "which project, and is it mine" lookup.
- **Impact**: This is the tenancy boundary that keeps a caller from grounding a generation on another tenant's project — it is duplicated exactly where a subtle divergence (e.g. one copy forgetting the `userId &&` guard) would be a cross-tenant data leak, not just a maintenance nit. Three copies means three places a future edit to the tenancy rule must land correctly.
- **Fix sketch**: Extract a single private helper in the same file, e.g. `async function resolveTenantProject(projectId: string | undefined, userId: string | null): Promise<{ demo?: (typeof DEMO_PROJECTS)[number]; project?: ProjectType extends never ? never : Awaited<ReturnType<typeof getProject>> }>` that performs only the demo-or-owned lookup once, and have `resolveGrounding`, `resolveBrandContext`, and `resolveLeadGrounding` call it and build their own return shape from `{ demo, project }`. No behavior change — same lookup order, same fallback to `"base"`/`""`.

## 3. Six independent copies of "extract the signed-in user id from `auth()`" across the owned routes

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/api/ai/route.ts:281`
- **Scenario**: The cast-and-unwrap `(((await auth())?.user as { id?: string } | undefined)?.id) ?? null` appears inline in `ai/route.ts:281`, `ai/status/route.ts:75`, `images/file/[id]/route.ts:10`, and `images/nobg/route.ts:47`, and is wrapped in a locally-named helper twice more — `requireUserId()` in `images/attribution/route.ts:23-25` and `userId()` in `images/route.ts:37-39`. The same block, under yet another local name (`currentUserId`/`requireUserId`), is independently reimplemented in 8 more files outside this context (`src/app/api/alerts/route.ts`, `experiments/route.ts`, `microsite/route.ts`, `campaigns/share/route.ts`, `campaigns/report-config/route.ts`, `keywords/lists/route.ts`, `campaigns/control-plane/route.ts`, `byom/guard.ts`), confirming there is no shared helper anywhere in the app to converge on.
- **Root cause**: No `@/lib/auth/session.ts`-style helper exists; every route author reaches for `auth()` and re-derives the same unsafe cast.
- **Impact**: Low bug risk per call site (the logic itself is simple and consistent everywhere it's copied), but six near-identical one-liners under three different local names inside one context is pure noise — a reviewer has to re-verify the same cast six times, and a future change (e.g. switching the session's id field) touches six call sites in this context alone.
- **Fix sketch**: Add `export async function getSessionUserId(): Promise<string | null>` to a small server-only module (e.g. `src/lib/auth/session.ts`) with the existing cast, and replace all six in-context call sites with it. Leave the 8 other-context copies alone (out of scope here) — note them only as evidence this convention is app-wide, not a one-off.

## 4. `num()` numeric-clamp helper duplicated verbatim with `experiments/route.ts`

- **Severity**: Low
- **Category**: duplication
- **File**: `src/app/api/images/attribution/route.ts:27`
- **Scenario**: `const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);` is byte-for-byte identical to `src/app/api/experiments/route.ts:24`. Both exist solely to sanitize metric fields (`impressions`, `clicks`, `conversions`, `cost`, `convValue` here; similar numeric fields there) from an untrusted JSON body.
- **Root cause**: No shared "clamp to a non-negative finite number" utility exists in `src/lib/`; `src/lib/ai/tools/_shared.ts:16` only has an unrelated string `clamp`.
- **Impact**: Trivial today (one line), but it's the kind of copy that tends to fork silently — e.g. only one copy gets a future `Number.isNaN` edge-case fix.
- **Fix sketch**: Add `export const nonNegNum = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);` to a small shared module (e.g. `src/lib/format.ts` or a new `src/lib/num.ts`), and import it in `images/attribution/route.ts` and `experiments/route.ts` in place of each local `num`.

## 5. `DELETE` handlers in `attribution/route.ts` and `images/route.ts` duplicate the same "best-effort body parse, require an id" shape

- **Severity**: Low
- **Category**: duplication
- **File**: `src/app/api/images/attribution/route.ts:97-115`
- **Scenario**: Both `DELETE` handlers do the same thing: try to parse a JSON body into an object with an id field and an optional `projectId`, swallow a parse failure with an empty catch, then 422 if the id is still empty. Compare `images/attribution/route.ts:97-115` (`linkId`) with `images/route.ts:180-195` (`id`) — same shape, different field name, each hand-rolled.
- **Root cause**: No shared "parse a small delete-by-id body" helper; this is the smallest and least risky of the duplicates found in this context.
- **Impact**: Minor — about 10 lines duplicated once, low bug surface, purely cosmetic maintenance cost. Included because the scan found no genuine dead code or misplaced files in these 9 files (confirmed via repo-wide greps for unused exports, stale TODOs, and leftover `console.log`s — none found), so this is the honest 5th finding rather than an invented one.
- **Fix sketch**: Optional/low priority. If touched, add a tiny local helper `async function parseIdBody(request: Request, idField: string): Promise<{ id: string; projectId?: string }>` in each file (or a shared one if a third caller ever appears) rather than inlining the try/catch again.
