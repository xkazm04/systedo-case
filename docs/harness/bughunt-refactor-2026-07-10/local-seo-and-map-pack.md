# Local SEO & Map Pack

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Imported rank ladder resets its history on every import — the "climb / trend" the map module exists to show is permanently flat for real data

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/local-signals/import.ts:66`
- **Scenario**: A business imports its rank export month after month (the intended A2 workflow — "map-pack rank has no clean API, so a business brings its own rank rows"). Each POST to `/api/projects/[id]/local-signals/import` runs `parseRankRows` → `ladderFromRows`, which sets `history: [r.rank]` (a single point) for every keyword, then `saveLocalSignals` **overwrites** the stored blob (`store.local.ts:24` `ON CONFLICT … DO UPDATE`, `store.firestore.ts:24` `.set(...)`). The route never reads the existing ladder to append to it. So `ladderDelta` (`mappack/compute.ts:41`) always sees `history.length < 2` and returns `0`; `best === current === this-import's-rank`. The ranking ladder — whose entire product value is showing movement toward #1 over time — shows a flat, zero-climb trend forever on live data, and `best` can never reflect a genuinely better past position.
- **Root cause**: The import path treats each upload as a fresh, historyless snapshot (`history: [r.rank]`) and the store is replace-only, with no merge of the incoming ranks into the previously-persisted per-keyword history. The seeded sample ladder fabricates an 8-point history (`mappack/sample.ts:124`), so the feature *looks* fully working in demo/sample and silently degrades to a flat line the moment a real import lands.
- **Impact**: User-visibly-broken headline feature (climb %, sparkline, "best position") for exactly the customers who did the work of importing real data; worse than the honest sample it replaces.
- **Fix sketch**: In the POST handler (`import/route.ts`) load the current `getLocalSignals(project.id)` and, in a `mergeLadder(prevLadder, newRows)` helper, append each new rank to the matching keyword×area `history` (keyed like `ladderFromRows`' id), recompute `current`/`best = Math.min(...history)`, cap history length (e.g. last 12). Keep `ladderFromRows` for the first-ever import.

## 2. Monthly-recap prompt labels seeded illustrative signals as "real, already-computed data the report must not stay silent on" — the honest `live` flag is available but discarded

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/local-signals/summary.ts:53`
- **Scenario**: `localSignalsPromptText` builds the grounding appendix fed into the AI monthly client report. It resolves the ladder via `resolveLocalLadder` (line 27), which returns `{ ladder, live }` — `live: false` when no real import exists — but the function **ignores `resolved.live`** and unconditionally emits `"Lokální viditelnost (reálná, spočítaná data — report na ně nesmí mlčet)"` / `"Local visibility (real, already-computed data — the report must not stay silent on it)"` (lines 53 / 70). Reviews are *always* the seeded `reviewsForProject` sample (line 29, purely `seed01`-derived — never live), yet they're presented under the same "real, computed" header with an explicit instruction that the report must cite them. So a client-facing recap is steered to assert fabricated map-rank and review numbers as verified fact.
- **Root cause**: The prompt copy asserts data provenance ("reálná") that the code has the exact signal to qualify (`resolved.live`) but throws away; and the review half has no live path at all while riding the same "real data" framing.
- **Impact**: Over-claim / success-theater in a paid, client-facing report — matches this app's known money-truth/over-claim risk theme. The LLM is actively told to surface illustrative figures as real.
- **Fix sketch**: Gate the wording on `resolved.live`: emit "reálná, spočítaná" only when `live` is true, else an "illustrative / demo" qualifier (mirroring how the mapa module labels `ladderLive`). Never label the always-sample review block as real; drop it or mark it illustrative.

## 3. Rank-CSV header detection is all-or-nothing — one unrecognized extra column silently forces a positional guess and mis-maps every row

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/local-signals/import.ts:38`
- **Scenario**: `hasHeader = headerCols.every(Boolean) && …` requires **every** first-row cell to be a known column name. Real rank-tracker / Google-Sheet exports routinely include extra columns (`změna`/change, `objem`/volume, `URL`, date). With a header like `klíčové slovo, oblast, pozice, změna`, `COL["změna"]` is `undefined`, so `.every(Boolean)` is `false`, `hasHeader` is `false`, and the parser silently falls back to the fixed positional assumption `idx = {keyword:0, area:1, rank:2}` (line 40). If the export's real column order differs from that fixed order (e.g. `pozice` first, or `oblast` and `pozice` swapped), ranks are read from the wrong column: rows are either dropped (`Number("praha") → NaN`, line 53) or, worse, imported with `area` holding a number and `rank` holding a change-% — then persisted and shown as **live** data.
- **Root cause**: Header recognition demands a 100% match instead of "does this row contain the columns I need?" A single unknown column defeats the by-name mapping that exists precisely to survive column reordering.
- **Impact**: Silent wrong-data import presented as the live source of truth; the user gets no error (`rowCount` may even look plausible).
- **Fix sketch**: Treat a row as a header if it contains the required known columns (`keyword`/`area`/`rank` all resolvable) rather than requiring all cells known; ignore/skip unrecognized columns and map only the resolved ones. (Consolidating onto `catalog/feed.ts`'s `parseCsvRecords`, per prior report #1, is the natural home for this.)

## 4. `targetsFromCatalog` seeds coverage off `service|area` with no project id — every project sharing a service+locality name shows identical volume, page-coverage and rank

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/local/catalog.ts:16`
- **Scenario**: The Lokální coverage matrix (`lokalni/page.tsx:22`, the primary path when a project has services) is built by `targetsFromCatalog`, which seeds `monthlyVolume`, `hasPage` and `rank` off `const k = \`${s.name}|${loc.id}\`` (line 16) — **no project id in the seed**. Every other seeded generator in this context deliberately namespaces by project: `mappack/sample.ts` (`${project.id}:kw:…`), `locations/sample.ts` (`${project.id}:loc:…`), `local/sample.ts` via `projectVary(project, …)`. Because local businesses commonly share generic service+locality pairs ("Servis a revize" × "Praha"), two different tenant projects render byte-identical coverage rows — same search volume, same "has a page", same SERP rank — undermining the per-project distinctness the rest of the app is careful to preserve. The demo (`DemoModule.tsx:253`) hits the same call, so all demo projects collapse too.
- **Root cause**: `targetsFromCatalog` was written to take only `(services, localities)` and never threaded the project through into the seed key, unlike its sibling generators.
- **Impact**: Illustrative-but-labeled-per-project data that isn't actually per-project; an agency viewing two clients sees suspiciously identical local numbers, eroding trust in the figures.
- **Fix sketch**: Thread `project` into `targetsFromCatalog(project, services, localities)` and seed off `\`${project.id}:local:${s.name}|${loc.id}:vol\`` etc., matching `locationsFromCatalog`/`keywordLadder`. Update the two call sites (`lokalni/page.tsx`, `DemoModule.tsx`).

## 5. `round1` one-liner duplicated across two sample generators in this context

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/mappack/sample.ts:60`
- **Scenario**: `const round1 = (n: number) => Math.round(n * 10) / 10;` is defined identically in `mappack/sample.ts:60` and `locations/sample.ts:44`, both used only to round a seeded star rating to one decimal. Not flagged by the 2026-07-09 code_refactor report (which covered the CSV parser, review-sample split, `bandKey`/`bandOf`, the `>10` magic number, and `locations/sample.ts` naming — but not this helper).
- **Root cause**: Each sample generator grew its own tiny rounding helper rather than importing a shared one.
- **Impact**: Trivial today; pure drift-surface (two copies to keep in sync if rounding precision ever changes). Only worth folding in opportunistically.
- **Fix sketch**: Export a shared `round1` (and the adjacent `round5`) from a small numeric util — or reuse an existing rounding helper if one already lives in `lib/format` — and import it in both sample files.
