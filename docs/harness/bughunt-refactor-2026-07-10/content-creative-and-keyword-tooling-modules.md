# Content, creative & keyword tooling modules

> Total: 5
> Critical: 0 · High: 0 · Medium: 2 · Low: 3
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Produktová kreativa always shows the "illustrative sample data" banner — even over the user's real persisted catalog

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/app/[projectId]/produktova-kreativa/page.tsx:18`
- **Scenario**: The prior code_refactor migrated this page's data source to the persisted catalog (`const products = await loadProductsFor(project)` — line 16, honors a user's saved SKUs, falls back to the seed only when nothing is saved). But `<ModulePage moduleKey="produktova-kreativa" sample>` still hardcodes `sample` (always `true`), so `ModulePage` (`ModulePage.tsx:54`) unconditionally renders `<SampleDataNote />` — the "ukázková data / illustrative sample data" gutter banner. A paying user who imports/edits their real product feed in **Katalog** then opens Produktová kreativa and is told, above their own real products, that this is illustrative sample data.
- **Root cause**: When the data source was moved from static `SAMPLE_PRODUCTS` to `loadProductsFor`, the `sample` flag was not switched from a constant to the data-provenance signal. The correct pattern already exists in this repo: the sibling `sklad-sezonnost/page.tsx` reads the same `loadProductsFor(project)` and passes **no** `sample` flag (and `obsah-plan/page.tsx:25` gates it with `sample={!isStored}`).
- **Impact**: User-visibly-wrong / trust erosion — the module whose entire job is "catalog → ad creative" mislabels the user's real catalog as fake demo data, contradicting the sibling modules fed by the identical loader.
- **Fix sketch**: Compute a real provenance boolean the way `loadProjectCatalog` decides seed-vs-stored (e.g. return/derive an `isSeed` alongside the products, or check `listOfferings(userId, project.id) == null`) and pass `sample={isSeed}`; or, if a truthful signal is out of scope here, drop the `sample` prop to match `sklad-sezonnost`.

## 2. Content engine badges seeded topic-cluster/decay tables as "Živá data · Google Ads" whenever any Ads metrics are synced

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/app/[projectId]/obsahovy-engine/page.tsx:15`
- **Scenario**: The page resolves `const live = await hasSyncedMetrics(project.id)` and passes it as `ContentEngine`'s `live` prop (line 18), while passing `clusters={clustersForProject(project)}` and `decay={SAMPLE_DECAY}` — both **always seeded** illustrative data. `ContentEngine.tsx:256` renders `ds.live ? "Živá data · Google Ads" : "Ukázková data"` from `projectDataSource(live)`. `hasSyncedMetrics` is true once a project has synced **Google Ads performance rows** (impressions/clicks/cost aggregates — `report-metrics/store.ts:23`), which are a different data shape from SEO topic-cluster coverage and content decay. So a user who syncs Google Ads sees the "Živá data · Google Ads" badge over topic-coverage, monthly-volume and year-over-year decay numbers that are 100% fabricated seed values.
- **Root cause**: The `live` signal (designed for the Monthly Report's synced Ads metrics) is reused to badge a surface whose displayed rows never derive from those metrics; `projectDataSource`'s own doc warns the label "must never claim 'živá data' before [the surface] actually shows it," but this call site passes a signal that can be true while every cluster/decay figure remains seeded.
- **Impact**: Success theater — seeded/illustrative content-strategy numbers are presented to the user (and drive the AI brief/refresh hand-offs) under a live-data provenance claim they can't tell is false.
- **Fix sketch**: Gate the content engine's `live` on a content-specific provenance (real synced clusters/decay), not `hasSyncedMetrics` (Google Ads). Until a content data source exists, pass `live={false}` so the badge stays honestly "Ukázková data," matching the seeded `clusters`/`decay` it renders.

## 3. Produktová kreativa renders a blank module for a real catalog that has no products

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/app/[projectId]/produktova-kreativa/page.tsx:16`
- **Scenario**: `loadProductsFor(project)` filters the persisted catalog to `isProduct` offerings. `loadProjectCatalog` (`catalog/load.ts:22`) honors an explicitly-empty saved catalog (`stored ?? seed` — a saved `[]` is returned, not reseeded). A user who saves a catalog containing only services/plans, or who deletes all products, gets `products = []`. `CatalogModule` then does `const product = products.find(...) ?? products[0]` → `undefined`, hits `if (!product || !group) return null` (`CatalogModule.tsx:226`), and renders nothing. The page shows the module header plus the (already-wrong, see #1) sample banner over an empty void — no empty state, no guidance to add products.
- **Root cause**: The page passes possibly-empty `products` straight through, and `CatalogModule` treats "no product" as `return null` (a loading/error fallback) rather than an intentional empty state.
- **Impact**: Degraded/blank screen for a legitimate (if uncommon) catalog shape; the user gets no hint that the module needs products in Katalog.
- **Fix sketch**: In the page, when `products.length === 0`, render an empty-state (link to Katalog) instead of `CatalogModule`; or give `CatalogModule` a real empty branch rather than `return null`.

## 4. `KeywordResearch` consumes `initialSeed` only at mount — a changed `?seed=` prop is silently ignored

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/app/[projectId]/klicova-slova/page.tsx:19`
- **Scenario**: The page reads `?seed=` from `searchParams` and passes `initialSeed={seed?.trim() || undefined}` to `KeywordsModule` → `KeywordResearch`. There, `seed` is `useState(initialSeed ?? "")` (`KeywordResearch.tsx:148`) and the auto-run is guarded by a `useRef` that fires once (`autoRan.current`, lines 193-200, `[]` deps). App-Router navigation to the **same** route with a different `?seed=` re-renders the server page and passes a new `initialSeed`, but the client `KeywordResearch` is reconciled (not remounted): its `seed` state keeps the old value and `autoRan.current` stays `true`, so neither the input nor an auto-search updates. Today's only entry points are the Lokální-gap deep links (`LocalModule.tsx:219`, which mount fresh), so this is latent — but it is a landmine the moment any klíčová-slova→klíčová-slova link or in-page seed switch is added.
- **Root cause**: `initialSeed` is treated as mount-only initial state; the component has no effect that syncs the field / re-triggers auto-run when the prop changes.
- **Impact**: A future (or manual-URL) seed switch silently shows stale results for the previous seed — a "clicked X, got Y" bug with no error.
- **Fix sketch**: Key the client subtree on the seed (`<KeywordResearch key={initialSeed} .../>` from `KeywordsModule`) so a new seed remounts it, or add an effect keyed on `initialSeed` that resets `seed`/`autoRan` and re-runs.

## 5. `obsah-plan` fetches the service catalog on every load even when the stored board makes it unused

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: cleanup
- **File**: `src/app/app/[projectId]/obsah-plan/page.tsx:16`
- **Scenario**: `const services = await loadServicesFor(project)` runs unconditionally at line 16, but `services` is consumed only in the seed branch of line 22 (`isStored ? stored! : initialPosts(project, services, localitiesFor(project))`). For a returning user with a persisted board (`isStored === true` — the common case), that catalog read (a Firestore/SQLite round-trip via `loadProjectCatalog` → `listOfferings`) is pure waste; `localitiesFor(project)` is already correctly lazy inside the false branch. This is not in the 2026-07-09 report (which flagged the `resolveOrSeed` persisted-or-seed duplication, not this eager read).
- **Root cause**: The seed inputs are resolved before the persisted-vs-seed decision, so the persisted path pays for data it discards.
- **Impact**: One avoidable per-load DB round-trip on the hot path for every returning user of this module; negligible correctness risk, small latency/cost.
- **Fix sketch**: Move `loadServicesFor(project)` inside the seed branch (compute it only when `!isStored`), mirroring how `localitiesFor` is already deferred — e.g. `const posts = isStored ? stored! : initialPosts(project, await loadServicesFor(project), localitiesFor(project));`.
