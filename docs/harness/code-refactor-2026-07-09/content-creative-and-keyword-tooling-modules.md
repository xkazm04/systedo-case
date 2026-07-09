# Content, creative & keyword tooling modules

> Context #33 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 1, Medium: 2, Low: 1)
> Files read: 9

## 1. Produktová kreativa hardcodes the demo product feed instead of the persisted catalog

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/app/app/[projectId]/produktova-kreativa/page.tsx:6,20`
- **Scenario**: The page imports `SAMPLE_PRODUCTS` straight from `src/lib/catalog/sample.ts` and passes it to `CatalogModule` unconditionally. Its own dependency's doc comment says the seed is "Shared by the Produktová kreativa module (creative generation) and the Sklad & sezónnost module (stock pacing)" — but the sibling module already moved off it: `src/app/app/[projectId]/sklad-sezonnost/page.tsx:7,30` calls `loadProductsFor(project, now)` from `src/lib/catalog/load.ts`, which reads the user's persisted catalog (`src/app/app/[projectId]/katalog/page.tsx` — "the source of truth the smart modules read from", `persistable` catalog manager) and only falls back to the seed when nothing is saved. `zisk/page.tsx:10,31-32` and `mesicni-report/page.tsx:16,40` do the same. Produktová kreativa never calls `loadProductsFor` at all.
- **Root cause**: `sklad-sezonnost`/`zisk`/`mesicni-report` were migrated to the persisted-catalog seam; `produktova-kreativa` was left on the original static import.
- **Impact**: An eshop user who edits their real SKUs/prices/USPs in Katalog will still see Produktová kreativa generate RSA/PMax ad copy for the hardcoded demo products (e.g. "Kešu ořechy natural, 500 g") — their catalog edits silently never reach the one module whose entire job is "catalog → ad creative". Two data sources exist for the same `Product[]` shape and this caller picked the stale one.
- **Fix sketch**: In `produktova-kreativa/page.tsx`, replace `import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample"` with `import { loadProductsFor } from "@/lib/catalog/load"`, call `const products = await loadProductsFor(project);` (mirroring `sklad-sezonnost/page.tsx:30`), and pass `products` to `CatalogModule` instead of `SAMPLE_PRODUCTS`.

## 2. Inline demo-name stripping duplicates (and narrows) the canonical `promptSafeName` helper

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/app/[projectId]/produktova-kreativa/page.tsx:12-14`
- **Scenario**: `const brand = project.name.replace(/\s*\(demo\)\s*/i, "").trim();` reimplements what `src/lib/projects/name.ts` already centralizes as `promptSafeName()`: `name.replace(/\s*\((?:demo|ukázka|sample)\)\s*$/i, "").trim()`. That helper is called from six other places (`src/lib/brand/context.ts`, `TwinOutbox.tsx`, `TwinVoiceStudio.tsx`, `LocalReviews.tsx`, `ReviewInbox.tsx`, `SpeedLeadModule.tsx`) specifically so a demo/sample project name never leaks into user-facing generated content (its own doc comment cites the "Dentalis (demo)" / "Klinika (ukázka)" UAT finding L1-19). The inline copy here only strips the English "(demo)" marker, not "(ukázka)" or "(sample)" — the two other variants the shared helper was explicitly written to catch.
- **Root cause**: This call site (tagged `BM-L1-02` in its own comment) was fixed independently of the canonical `promptSafeName` seam instead of reusing it — likely written before, or without awareness of, `lib/projects/name.ts`.
- **Impact**: For any project named with the "(ukázka)" or "(sample)" marker, the brand string fed into `CatalogModule`'s generated RSA/PMax ad copy and final URL would still carry the demo marker — the exact class of leak `promptSafeName` exists to prevent, reintroduced in the one call site that didn't use it.
- **Fix sketch**: Replace the inline `.replace(...)` with `import { promptSafeName } from "@/lib/projects/name";` and `const brand = promptSafeName(project.name);`. Behavior-preserving for "(demo)"-suffixed names; additionally fixes "(ukázka)"/"(sample)".

## 3. `<div className="mb-5"><SampleDataNote /></div>` wrapper repeated verbatim

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/distribuce/page.tsx:14-16`
- **Scenario**: The identical three-line wrapper `<div className="mb-5"><SampleDataNote /></div>` appears in this file, in `experimenty-lp/page.tsx:14-16`, in `obsah-plan/page.tsx:28-30` (inside a conditional), and in `produktova-kreativa/page.tsx:17-19` — four of this context's nine files. The same block is copy-pasted at least eleven more times elsewhere in the app (`zisk`, `ltv`, `lokalni`, `aktivita`, `kvalita-leadu`, `publikum`, `schranka`, `srovnani-seo`, `vykon`, `spotreba`, `recenze`), always with the exact same `mb-5` margin.
- **Root cause**: `SampleDataNote` (`src/components/app/SampleDataNote.tsx`) renders only its own banner `<div>`; every call site independently re-adds the same spacing wrapper rather than the component owning its own bottom margin.
- **Impact**: Any change to the note's spacing (or a decision to make it a `<section>` for a11y reasons) requires touching 15+ call sites in lockstep; today's consistency is coincidental, not enforced.
- **Fix sketch**: Move `className="mb-5"` onto `SampleDataNote`'s own root `<div>` in `src/components/app/SampleDataNote.tsx`, then delete the wrapping `<div className="mb-5">…</div>` at every call site (the four in this context plus the ~11 elsewhere), rendering `<SampleDataNote />` directly. Purely visual, zero prop/behavior change since the wrapper adds no other styling.

## 4. "Persisted board, else seeded sample" resolution duplicated between Obsah — plán and Recenze

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/obsah-plan/page.tsx:20-23`
- **Scenario**: `obsah-plan/page.tsx` does `const uid = await currentUserId(); const stored = uid ? await getProjectState<ContentPost[]>(uid, projectId, "content-schedule") : null; const isStored = Array.isArray(stored) && stored.length > 0; const posts = isStored ? stored! : initialPosts(...)`. `src/app/app/[projectId]/recenze/page.tsx:22-23` runs the same shape one line shorter (`getProjectState<ReviewInboxState>(uid, projectId, "reviews")`, no array-length gate since it's a single object) to decide between a persisted user state and a generated sample. Both exist purely to answer "does this user have a saved board for this project, or should we show the seed."
- **Root cause**: `getProjectState` (`src/lib/project-state/store.ts`) is a thin generic KV read; the "resolve to persisted-or-seed" decision on top of it was written inline at each call site instead of as a shared helper.
- **Impact**: Low today (two call sites, small blocks), but a third module adopting the same per-project persisted-board pattern would very likely re-copy it a third time rather than discover a shared helper.
- **Fix sketch**: Add a small helper, e.g. `resolveOrSeed<T>(uid: string | null, projectId: string, key: string, seed: () => T)` in `src/lib/project-state/store.ts`, that does the `uid ? getProjectState(...) : null` read and returns `stored ?? seed()`; have `obsah-plan` and `recenze` call it (obsah-plan additionally needs the `isStored` boolean it uses to gate the `SampleDataNote`, so keep that flag in the helper's return, e.g. `{ value, isStored }`).

## 5. Legacy single-route redirect duplicates the shape used by `rychla-reakce`

- **Severity**: Low
- **Category**: duplication
- **File**: `src/app/app/[projectId]/obsah/page.tsx:1-8`
- **Scenario**: `obsah/page.tsx` is a 3-statement page whose only job is `redirect(\`/app/${projectId}/obsahovy-engine\`)` after awaiting `params`, for old "Obsah & SEO" bookmarks. `src/app/app/[projectId]/rychla-reakce/page.tsx` (outside this context) is structurally identical: await `params`, then `redirect(\`/app/${projectId}/schranka\`)` for the old speed-to-lead route. Both are the same "legacy route → current module" redirect stub.
- **Root cause**: Two independent module merges (Obsah & SEO → Obsahový engine; rychlá reakce → schránka) each added their own one-off redirect page rather than a shared tiny helper.
- **Impact**: Negligible — three lines, no logic to get out of sync, no realistic bug surface. Noted for completeness since it is a genuine (if trivial) duplicate; not worth an extraction on its own.
- **Fix sketch**: Only worth doing if a third legacy-redirect route appears. If so, add a one-line helper in `src/lib/projects/guard.ts` or a new `src/lib/projects/legacy-redirect.ts`, e.g. `legacyRedirect(projectId: string, to: string)`, and have both pages call it. Given there are only two today, leaving as-is is a reasonable call.
