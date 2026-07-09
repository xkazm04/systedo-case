# Scheduled cron jobs

> Context #25 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 2, Medium: 1, Low: 1)
> Files read: 9

## 1. Two cron routes bypass the timing-safe auth check with a hand-rolled `authorized()`

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/app/api/cron/report/route.ts:19-23`
- **Scenario**: `catalog-sync`, `digest`, `microsite` and `sync` all import the shared `cronAuthorized()` from `src/lib/cron-auth.ts`, which SHA-256-digests both sides and compares with `timingSafeEqual` specifically "so neither the secret's value nor its length leaks via a timing side-channel" (per that file's own doc comment). `report/route.ts:19-23` and `social/route.ts:12-16` instead each define an identical private `function authorized(request)` that does a plain `request.headers.get("authorization") === \`Bearer ${secret}\``. Same fail-closed behavior on the happy/unhappy path, but 2 of the 6 cron endpoints silently opted out of the constant-time protection the codebase went out of its way to build.
- **Root cause**: `report` and `social` were likely written (or copy-pasted from each other) before `cron-auth.ts` existed, or before the timing-safe hardening was added there, and never migrated.
- **Impact**: A security control that looks uniformly applied ("all crons are `CRON_SECRET`-gated") is actually inconsistent — the two least-frequently-touched routes carry the weaker check. Any future change to the auth policy (secret rotation format, additional header, etc.) has to remember to fix it in three places instead of one, and is exactly the "two implementations disagree" pattern that produces a landmine.
- **Fix sketch**: Delete the local `authorized()` in `report/route.ts` and `social/route.ts`; import and call `cronAuthorized` from `@/lib/cron-auth` instead, matching the other four routes. No behavior change for a correctly-configured deployment.

## 2. `escapeHtml` reimplemented byte-for-byte instead of reused from `campaigns/alerts.ts`

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/cron/digest/route.ts:25-29`
- **Scenario**: `digest/route.ts` defines its own local `escapeHtml`, which is character-for-character identical to the unexported `escapeHtml` in `src/lib/campaigns/alerts.ts:139-143` (same regex, same ternary chain, same entity list). The same function is *also* independently reimplemented in `src/lib/campaigns/anomaly-alerts.ts:139`, `src/lib/inventory/sync-alerts.ts:16`, and `src/lib/distribution/newsletter.ts:68` — five copies of one nine-line utility across the repo, with digest/route.ts being the one owned by this context.
- **Root cause**: `escapeHtml` was never exported from a shared module, so every file that needed to safely interpolate a string into an HTML email/webhook body wrote its own copy.
- **Impact**: A real (if unlikely) risk class — if one copy is ever fixed for an edge case (e.g. adding `/` or backtick escaping) the other four won't get the fix, and an HTML-injection-relevant bug could be "fixed" in the wrong file. At minimum it's five near-identical private helpers to keep mentally in sync.
- **Fix sketch**: Export `escapeHtml` once from `src/lib/campaigns/alerts.ts` (or hoist it to a neutral `src/lib/html.ts`), then have `digest/route.ts` import it and delete its local copy. (The other three repo-wide copies are outside this context's file list — worth a follow-up but not owned here.)

## 3. The "list projects, fall back to a single null tenant" fan-out is copy-pasted across four routes

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/api/cron/digest/route.ts:54-57`
- **Scenario**: The exact two-line idiom `const projects = await listProjects(userId); const targets = projects.length ? projects : [null];` followed by `for (const project of targets) { try { ... } catch (err) { ... } }` appears verbatim in `digest/route.ts:54-57`, `report/route.ts:42-45`, `social/route.ts:26-29`, and (nested inside an extra account loop) `sync/route.ts:37-45`. `catalog-sync/route.ts` deliberately uses a different, flatter strategy (`listAllConnections()`), so this isn't the dual-store dispatcher pattern — it's four independent copies of the same "resolve every tenant to touch for this user" logic.
- **Root cause**: Each cron endpoint was built by copying the previous one's fan-out skeleton and swapping the per-tenant body.
- **Impact**: Any change to tenancy fan-out semantics (e.g. skipping archived projects, capping project count per user, changing the null-project fallback rule) requires editing four call sites; missing one produces a cron that silently behaves differently from its siblings, which is hard to notice since crons have no UI.
- **Fix sketch**: Extract a small helper, e.g. `listTenantTargets(userId: string): Promise<(Project | null)[]>` in `@/lib/projects/store`, returning `projects.length ? projects : [null]`. Have `digest`, `report`, `social`, and `sync` call it instead of inlining the two lines. `sync/route.ts` keeps its extra `accountIds` loop layered on top.

## 4. `digest/route.ts` builds full HTML email templates and KPI math inline in the route handler

- **Severity**: Medium
- **Category**: structure
- **File**: `src/app/api/cron/digest/route.ts:66-121`
- **Scenario**: Beyond fan-out, `digest/route.ts` also computes KPI aggregates, filters criticals, formats budget-move copy, and hand-builds an HTML table + list (`kpiHtml`, `movesHtml`, `aiHtml`, final `html` string with inline styles) directly inside the `GET` handler — the same shape `report/route.ts:78-81` uses for its own (smaller) inline HTML. Neither `@/lib/campaigns/` nor `@/lib/email.ts` (which only wraps the Resend/webhook transport) has a templates module; presentation and orchestration are fused in the route file.
- **Root cause**: The route was grown incrementally (KPIs, then AI-ops section, then budget moves) with each addition appended to the same string-building block rather than factored out.
- **Impact**: The route handler is hard to unit-test (no way to check the rendered email without hitting the whole cron), and any shared visual change (e.g. matching digest/report email styling) means editing string concatenation in two separate route files rather than one template module.
- **Fix sketch**: Move the KPI-table/moves-list/HTML-assembly logic into a `buildDigestEmail(...)` function in `src/lib/campaigns/` (or a new `email-templates.ts`), taking the already-computed `kpis`, `items`, `criticals`, `aiHtml` and returning the HTML string; `digest/route.ts` then just calls it and stays a thin orchestrator like `catalog-sync/route.ts` already is.

## 5. `err instanceof Error ? err.message : String(err)` repeated inline with no shared helper

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/app/api/cron/catalog-sync/route.ts:63-71`
- **Scenario**: The same error-normalization ternary appears in `catalog-sync/route.ts:70`, `digest/route.ts:125`, `report/route.ts:98`, and `sync/route.ts:74` (and, outside this context, in `src/lib/llm/index.ts` and `src/lib/skills/registry.ts` — six occurrences repo-wide, no shared helper exists).
- **Root cause**: A common JS idiom that nobody extracted into a utility.
- **Impact**: Purely cosmetic — each occurrence is correct and low-risk on its own — but it's a one-line `errorMessage(err)` helper away from being a single source of truth, and six independent copies is more than coincidence.
- **Fix sketch**: Add `export function errorMessage(err: unknown): string { return err instanceof Error ? err.message : String(err); }` to a small shared utils module and swap the four call sites in this context's files to use it. Low priority; bundle with finding #3's refactor rather than doing it standalone.
