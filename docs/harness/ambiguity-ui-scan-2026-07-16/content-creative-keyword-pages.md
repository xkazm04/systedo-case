# Content, creative & keyword tooling modules — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. "Sample data" banner shown over the user's real persisted catalog
- **Severity**: High
- **Lens**: ui
- **Category**: false-sample-banner
- **File**: src/app/app/[projectId]/produktova-kreativa/page.tsx:18
- **Scenario**: A user saves their own offerings in the Katalog module. `loadProductsFor(project)` (src/lib/catalog/load.ts) correctly returns the persisted catalog, and the page even documents that "Products come from the persisted catalog … falling back to the seed only when nothing is saved" — yet `<ModulePage moduleKey="produktova-kreativa" sample>` hardcodes the "illustrative sample data" gutter note unconditionally.
- **Root cause**: The `sample` flag was never wired to the live/seed resolution that the products already went through; sibling pages (obsah-plan, experimenty-lp) compute `sample={source === "sample"}` but this page kept the static boolean.
- **Impact**: Users generating RSA/PMax asset groups from their own saved products are told the data is illustrative — they distrust real output, or worse, learn to ignore the banner everywhere, defeating the honesty system.
- **Fix sketch**: Have the loader (or the page) report source, e.g. return `{ products, source }` or compare against a `listOfferings` null check, then `sample={source === "sample"}` exactly like experimenty-lp.

## 2. Emptied content-schedule board silently resurrects the seed posts
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: empty-state-vs-null-conflation
- **File**: src/app/app/[projectId]/obsah-plan/page.tsx:21
- **Scenario**: `const isStored = Array.isArray(stored) && stored.length > 0;` treats a persisted empty board (`[]`) the same as "never saved" — the seed posts come back on reload and the page flips back to `sample` mode.
- **Root cause**: The page conflates "no state saved" (null) with "state saved and empty" ([]), diverging from the codebase's own documented contract in src/lib/catalog/load.ts ("an explicitly-empty saved catalog ([]) is honored; only a never-saved project (null) falls back to the seed").
- **Impact**: Anyone who clears or publishes away all posts sees demo content reappear labeled as sample data; future developers copying either page get two contradictory null-vs-empty conventions in the same module family.
- **Fix sketch**: `const isStored = Array.isArray(stored);` — fall back to `initialPosts(...)` only when `stored === null`, matching the catalog contract; keep `sample={!isStored}`.

## 3. Three competing "sample vs live" signaling patterns across sibling modules
- **Severity**: Medium
- **Lens**: ui
- **Category**: inconsistent-data-honesty-pattern
- **File**: src/app/app/[projectId]/obsahovy-engine/page.tsx:17
- **Scenario**: Across the nine pages the same concept ("is this real data?") is rendered four different ways: unconditional banner (distribuce, produktova-kreativa), computed banner (obsah-plan, experimenty-lp), no banner but an in-module Pill (`sourceLive`/`sourceSample`, ContentEngine.tsx:256), and nothing at all (klicova-slova, kreativa, knihovna). Obsahový engine additionally always renders `SAMPLE_DECAY` seed data while the pill only reflects cluster-metric liveness.
- **Root cause**: The `sample` prop and the module-internal pill grew independently; no page-level convention was ever settled, so each module chose its own honesty surface.
- **Impact**: Users can't build a stable mental model of the sample marker — the same seeded data is flagged loudly on one page, subtly on the next, and not at all on a third (the always-sample decay table shows unmarked when metrics are live).
- **Fix sketch**: Standardize on the ModulePage `sample` slot as the single page-level signal (pass `sample={!live}` from obsahovy-engine, or a tri-state "partially sample" note when decay is seed but clusters are live) and reserve the pill for per-widget granularity only.

## 4. Kreativa/Knihovna skip server-side projectId, leaving a silent unscoped API fallback
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: dual-path-project-scoping
- **File**: src/app/app/[projectId]/kreativa/page.tsx:12
- **Scenario**: The page awaits `params.projectId` and guards on it, then renders `<CreativeStudio />` with no props; the module re-derives `pid = project?.id` from client context (CreativeStudio.tsx:181, PatternsLibrary.tsx:96) and every fetch carries a `pid ? scoped : unscoped` branch (e.g. `fetch(pid ? "/api/images?projectId=…" : "/api/images")`).
- **Root cause**: Two conventions coexist: server pages that pass `projectId` down as a prop (ContentSchedule, LpExperimentsModule) versus client modules that rediscover it from context with an unscoped fallback intended for a different (non-project) host route.
- **Impact**: If the context ever hydrates late or the provider is missing, the library quietly fetches/uploads without project scoping — cross-project creatives can appear, and the failure is invisible (no error, just wrong scope). Future developers also can't tell which branch is the intended one inside a `[projectId]` route.
- **Fix sketch**: Pass `projectId={projectId}` from these two pages (like their siblings) and make the unscoped branch explicit to the standalone host only (e.g. a `scope="global"` prop), removing the ambient fallback inside project routes.

## 5. "Permanently redirect" docstring, but `redirect()` issues a temporary 307
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: doc-code-mismatch
- **File**: src/app/app/[projectId]/obsah/page.tsx:7
- **Scenario**: The legacy `/obsah` route's docstring says "Permanently redirect so old links / bookmarks land on the unified module", but the code calls `redirect()` from next/navigation, which emits a temporary 307.
- **Root cause**: Next.js has a separate `permanentRedirect()` for 308; the intent in the comment never made it into the API choice.
- **Impact**: Browsers/crawlers keep re-requesting the dead route instead of updating bookmarks/link equity; a future developer reading the comment will assume 308 semantics when debugging caching.
- **Fix sketch**: `import { permanentRedirect } from "next/navigation"` and call it, or amend the docstring if a temporary redirect is actually intended during the migration window.
