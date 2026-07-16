# Local SEO, social, reviews, reporting & catalog modules — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Seasonal budget plan for REAL projects is scaled off a hidden notional 120 000 CZK baseline, with no sample label
- **Severity**: High
- **Lens**: ambiguity
- **Category**: hidden-magic-baseline
- **File**: src/app/app/[projectId]/sklad-sezonnost/page.tsx:16,46,59
- **Scenario**: A real (non-demo) project with a genuinely connected warehouse opens Sklad & sezónnost. The stock rows and source badge are real (derived from the persisted StoredConnection), but the "seasonal budget plan" beneath them is `seasonalBudgetPlan(BASELINE_MONTHLY_BUDGET, …)` where `BASELINE_MONTHLY_BUDGET = 120_000` is a notional constant identical for every tenant.
- **Root cause**: The constant's docstring admits it is "notional", yet the page renders it for live projects on the same screen as genuinely live warehouse data, and `ModulePage moduleKey="sklad-sezonnost"` passes no `sample` flag — the shared "illustrative sample data" note (which sibling pages like publikum/lokalni carry) never appears.
- **Impact**: Concrete CZK month-by-month budget recommendations that look grounded (they sit next to real stock/sync data) are actually scaled from a fictitious baseline. A client could act on "increase May to 156 000 CZK" numbers that have no relation to their actual spend.
- **Fix sketch**: Derive the baseline from the project's real ad spend when available (e.g. trailing-90d `adCost` from `getProjectDataset`/`resolveReportDataset`, the same seam mesicni-report uses), falling back to the 120k constant only for demo projects — and when the fallback is used, label the budget section illustrative (pass the same boolean that picked the fallback, per the ModulePage `sample` contract).

## 2. Twin readiness gate silently equates "catalog failed to load" with "business sells nothing"
- **Severity**: High
- **Lens**: ambiguity
- **Category**: swallowed-error-as-empty-state
- **File**: src/app/app/[projectId]/twin/page.tsx:17,26
- **Scenario**: `loadProjectCatalog(project).catch(() => [])` — any transient store read failure (or a future thrown validation error) resolves to `[]`, and `offerings={offerings.length}` feeds the module's `grounding` readiness gate as `0`.
- **Root cause**: The error path and the legitimate empty-catalog path are collapsed into the same value, so the module cannot distinguish "we couldn't check" from "the catalog is empty". (Same silent-swallow shape exists at mesicni-report/page.tsx:107, `getRecaps(...).catch(() => null)` — stored recaps quietly vanish and the user regenerates at LLM cost.) Note also twin omits the dataset-derived `now` that katalog/page.tsx:18 and mesicni-report/page.tsx:60 carefully construct, so it's the only catalog consumer in the group on non-deterministic `Date.now()`.
- **Impact**: On a flaky read, the Twin page tells the user their catalog is unconfigured ("doesn't know what this business sells"), steering them to redo setup they already completed — a trust-eroding false negative on a readiness checklist.
- **Fix sketch**: Catch to a sentinel (`null` = unknown) instead of `[]`; pass `offerings: number | null` and have the gate render "catalog unavailable, retry" for `null`. Pass the dataset-derived `now` for parity with the other catalog consumers.

## 3. The "illustrative sample data" banner contract is applied three different ways across the group
- **Severity**: Medium
- **Lens**: ui
- **Category**: sample-label-inconsistency
- **File**: src/app/app/[projectId]/schranka/page.tsx:26 (also mapa/page.tsx:22, srovnani-seo/page.tsx:36, recenze/page.tsx:29)
- **Scenario**: ModulePage documents the contract: pages that show the sample note conditionally "pass the same boolean they used to gate" (e.g. `sample={!isLive}`). Only recenze honors it (`sample={!resolved.live}`). schranka passes `sample` unconditionally even though `resolveTwin` can return a live source; srovnani-seo passes `sample` unconditionally even when queries are generated from the real catalog + stored competitors and priced with real channel economics; mapa passes no flag at all even though its own comment says "the competitor map-pack stays sample".
- **Root cause**: Each page hand-decides the flag with no link to its live/sample resolution, so the banner drifts from the data's actual provenance as live seams (A1/A2) land module by module.
- **Impact**: The honesty label — the product's core trust device — over-claims sample on pages that are partly real (users discount real numbers) and under-claims on mapa (users may treat sample competitor packs as real market positions).
- **Fix sketch**: Derive the flag from the resolver where one exists (`sample={!resolved.live}` on schranka; `sample={generated.length === 0}` or a partial-note variant on srovnani-seo) and give mapa either `sample` or a scoped per-section note for the always-sample packs, mirroring its per-source ladder badges.

## 4. `project.id.startsWith("demo-")` is an undocumented magic-string convention, re-derived inline at every call site
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-string-discriminator
- **File**: src/app/app/[projectId]/sklad-sezonnost/page.tsx:35,55
- **Scenario**: The demo/real distinction — which decides whether the warehouse badge is illustrative vs derived from a persisted connection, and whether the action plan persists at all — is the string prefix test `project.id.startsWith("demo-")`, written out twice in this one page and again inside `src/lib/catalog/load.ts:35`.
- **Root cause**: No central `isDemoProject(project)` predicate or `Project` field; the convention lives only in scattered inline checks and is nowhere documented as a reserved id namespace.
- **Impact**: A future real project id that happens to begin with `demo-` silently loses catalog persistence, plan storage, and gets a fake warehouse badge; conversely, the two checks in this file can drift (badge says real, plan treats it as demo) under refactor. New contributors cannot discover the rule except by grep.
- **Fix sketch**: Add `isDemoProject(project)` (or a boolean on the project record) in `src/lib/projects/*`, use it at all four sites, and note the reserved `demo-` id prefix where project ids are minted.

## 5. Social center's "brand" persists in one global localStorage key shared across every project
- **Severity**: Medium
- **Lens**: ui
- **Category**: cross-project-state-bleed
- **File**: src/app/app/[projectId]/socialni/page.tsx:12
- **Scenario**: The page renders `<SocialClient />` with zero project props; scoping is left to the client components. Posts/messages correctly re-derive `projectId` from the URL, but the brand field is persisted under the global key `app:social-brand` (Composer.tsx:93,102; WeekPlanner.tsx:104). A user managing two projects sets the brand on project A, opens project B's Sociální sítě, and A's brand silently pre-fills B's composer and seeds B's AI drafts.
- **Root cause**: The page (the only place that authoritatively knows the project) passes nothing down, so a piece of per-project state fell back to a project-agnostic storage key.
- **Impact**: Wrong-brand AI-generated social drafts for multi-project users — exactly the "success theater" failure the module elsewhere guards against, and hard to notice because the field looks pre-filled correctly.
- **Fix sketch**: Pass `projectId` (and `project.name` as the brand default) from the page into `SocialClient`, and key the persisted brand per project (`app:social-brand:${projectId}`), migrating the legacy global key on first read.
