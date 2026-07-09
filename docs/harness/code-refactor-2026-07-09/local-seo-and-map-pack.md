# Local SEO & Map Pack

> Context #49 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 3, Low: 1)
> Files read: 21

## 1. Rank-import CSV splitter reinvents a weaker parser that already exists and can silently drop valid rows

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/local-signals/import.ts:20-58`
- **Scenario**: `parseRankRows` tokenizes a pasted/CSV rank export with `splitCells`, which just does `line.split(/[,;\t]/)` — no quote-awareness, no BOM strip. A user pasting a Sheets/Excel CSV export whose keyword or area contains a comma (common: `"Servis a montáž, servis"` , `Praha`, `4`) gets that field auto-quoted by the export tool; `splitCells` doesn't respect the quotes and splits inside them, shifting every downstream column. The shifted `rank` cell then fails `Number.isFinite`, so the whole row is silently dropped rather than imported — with no error surfaced beyond a possibly-lower `rowCount`. The exact same shape of problem (Czech-locale CSV/TSV export, header aliasing by cs/en column name) is already solved correctly by `parseCsvRecords` in `src/lib/catalog/feed.ts:147-187`, an RFC-4180 quote-aware tokenizer with BOM stripping and auto delimiter detection — which is explicitly exported "so the generic ERP adapter (inventory/erp.ts) reuses the same tokenizer."
- **Root cause**: `local-signals/import.ts` was written standalone (its own header comment calls it "Framework-free + unit-tested"), without knowledge that `catalog/feed.ts` already generalized this exact CSV-ingestion problem for reuse.
- **Impact**: Real, silent data loss on a realistic input (any keyword/area containing a comma from a quoted CSV export) with no error message telling the business why some of their rows didn't import. Also two independently-maintained CSV tokenizers to keep in sync as more delimiter/format edge cases surface.
- **Fix sketch**: In `import.ts`, replace `splitCells`/the manual line-splitting in `parseRankRows` with `parseCsvRecords` from `@/lib/catalog/feed.ts` (already dependency-free and pure, so no boundary risk), keeping `COL` header-aliasing and the `keyword/area/rank` semantics on top of the shared tokenizer's `string[][]` output.

## 2. Two independent "review sample" datasets for the same concept, one of them never personalized — plus a same-named function collision

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/local/sample.ts:25-103`
- **Scenario**: `local/sample.ts` defines `RecentReview` + a static `SAMPLE_RECENT_REVIEWS` (4 hand-written reviews, one per city) rendered by the Lokální module's reputation panel (`src/app/app/[projectId]/lokalni/page.tsx:40`). `reviews/sample.ts` independently defines the near-identical concept `ReviewItem` + a seeded, per-project `reviewsForProject` (18 reviews, `seed01`-varied like every other illustrative dataset in this codebase) for the Review Inbox. The two share the same author pool (`Jana K.`, `Petr M.`, `Lukáš V.`, `Markéta S.` all appear in both files) — clear evidence of a copy-then-diverge origin — and `reviews/sample.ts`'s own header comment even says it is "a fuller dataset than the Lokální module's four-review reputation panel," acknowledging the split. Compounding this, both files export a function literally named `reviewsForProject` with different signatures/return types (`local/sample.ts:65` → `ReviewProfile[]`, `reviews/sample.ts:61` → `ReviewItem[]`), forcing `src/components/demo/DemoModule.tsx` to alias-import one of them (`reviewsForProject as inboxReviewsForProject`) to avoid a name clash.
- **Root cause**: The reputation panel (Lokální) and the Review Inbox were built at different times against the same "reviews" concept without consolidating on one sample source.
- **Impact**: Every real project's Lokální reputation panel shows the exact same 4 unvaried reviews (unlike literally every other seeded dataset in `src/lib/*/sample.ts`), and a dev touching "reviews" has to know to update Czech author/text lists in two places. The name collision is a standing footgun for the next import that doesn't think to alias.
- **Fix sketch**: Derive `RecentReview`s for the Lokální panel from `reviews/sample.ts`'s seeded `reviewsForProject` (map `ReviewItem` → the smaller `RecentReview` shape, e.g. take the top N per area) instead of maintaining `SAMPLE_RECENT_REVIEWS` separately; drop `local/sample.ts`'s `reviewsForProject`/`RecentReview`/`SAMPLE_RECENT_REVIEWS` once callers switch, removing the need for the `inboxReviewsForProject` alias.

## 3. `bandOf`/`bandKey` — the exact same rating→sentiment-band logic reimplemented in the same folder

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/reviews/sample.ts:56-58`
- **Scenario**: `reviews/compute.ts:10-12` exports `bandOf(rating): Band` (`rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative"`), used for filtering and sentiment rollups. `reviews/sample.ts:56-58` privately reimplements the identical ternary as `bandKey`, used only to pick a review-text pool for the generated sample data — same file, same folder as the canonical version, one import away.
- **Root cause**: `sample.ts` needed a band classifier before `compute.ts`'s `bandOf` was wired in as its dependency (or the author didn't notice `compute.ts` already had it), and the two never got merged.
- **Impact**: Small today, but it's the classic drift trap — if the business ever redefines the positive/neutral/negative thresholds (e.g. 4★ becomes neutral), a dev fixing `bandOf` in `compute.ts` has no reason to look in `sample.ts` and the sample data's text-pool selection quietly falls out of sync with the real classification shown elsewhere in the same module.
- **Fix sketch**: Delete `bandKey` in `sample.ts` and import `bandOf` from `./compute` instead (same directory, no new dependency edge — `compute.ts` is already framework-free/pure).

## 4. "Outside top 10" is a repeated magic number with no shared constant

- **Severity**: Medium
- **Category**: structure
- **File**: `src/lib/local/compute.ts:14-23`
- **Scenario**: The same local-SEO business rule — "a rank worse than #10 is effectively invisible" — is hard-coded as the literal `10` in three independent places: `local/compute.ts:23` (`coveredButWeak` = `hasPage && rank > 10`), `locations/compute.ts:23` (`needsAttention` = `mapRank > 10`), and `locations/compute.ts:48` (`attentionScore`'s `mapRank > 10 ? 15 : 0`). None reference a shared named constant, and the UI mirrors the same threshold again in `LocalModule.tsx`'s `rankCell` (`t.rank <= 10` for the warning tier).
- **Root cause**: Each module (local coverage, location fleet roster) independently encoded the same domain constant when it needed it, rather than sharing one definition.
- **Impact**: No bug today, but a low-risk, easy-to-miss-one-copy situation: if the product ever changes what counts as "weak" (e.g. moving to a top-5 standard for the map pack), someone has to remember to grep for `> 10` across two `lib/` modules and a component instead of updating one constant.
- **Fix sketch**: Introduce a shared `LOCAL_RANK_WEAK_THRESHOLD = 10` (or similarly named) constant — e.g. in `local/compute.ts` or a small shared module — and have `locations/compute.ts`'s `needsAttention`/`attentionScore` import it instead of repeating the literal. Purely additive; no behavior change if the value stays 10.

## 5. `locations/sample.ts` is the only "sample.ts" in this context with no actual static sample data

- **Severity**: Low
- **Category**: structure
- **File**: `src/lib/locations/sample.ts:1-9`
- **Scenario**: Every sibling `sample.ts` this context owns — `local/sample.ts` (`SAMPLE_TARGETS`, `SAMPLE_REVIEWS`, `SAMPLE_RECENT_REVIEWS`), `mappack/sample.ts` (seeded-but-structurally-"sample" pack generators), `reviews/sample.ts` (seeded review generator) — follows the pattern "sample.ts = the illustrative/fallback data source for this domain." `locations/sample.ts` breaks that pattern: it holds no static baseline data at all, only `locationsFromCatalog`, a 100% catalog+`seed01`-driven roster builder (closer in spirit to `local/catalog.ts`, which this context also owns and which _is_ named for what it does).
- **Root cause**: `locations` never grew a catalog.ts/sample.ts split the way `local` did (see `local/catalog.ts` vs `local/sample.ts`); everything just landed in one file named after the older convention.
- **Impact**: Purely a discoverability nit — a developer scanning filenames for "the static fallback data" in `locations/` won't find one (there isn't one) and may be surprised `sample.ts` is actually catalog-grounded generation logic. No functional risk.
- **Fix sketch**: Low priority; if touched, rename `src/lib/locations/sample.ts` → `src/lib/locations/catalog.ts` (mirroring `local/catalog.ts`) and update its two importers (`LocationsOverviewSection.tsx`, `LocationsModule.tsx`'s type-only import of `GbpStatus`/`LocationRow`). Purely a rename — no behavior change — but touches two call sites, so only worth doing opportunistically alongside other work in this area.
