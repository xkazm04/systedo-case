# PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Ads Editor / listing CSV export is open to spreadsheet formula injection

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/ads-editor.ts:80`
- **Scenario**: `buildAdsEditorAdSheet` / `buildAdsEditorKeywordSheet` transpose AI-generated headlines, descriptions, callouts and keywords into rows, which `AdGenerator.exportAdsEditorCsv` (`AdGenerator.tsx:571-575`) and `exportAdsCsv` (`:541-552`) feed straight to `toCsv` → `downloadText` as a `.csv`. The single CSV escaper `csvCell` (`src/lib/export.ts:16`) only quotes cells that contain a delimiter/quote/newline (`/[",\n\r;]/`); it does **not** neutralize the leading characters a spreadsheet treats as a formula (`=`, `+`, `-`, `@`, tab). Czech promo copy routinely starts that way — e.g. a headline `-50 % na vše`, `+420 volejte`, or an AI cell that begins `=`. When the marketer opens the exported CSV in cs-CZ Excel/Google Sheets to review before import, that cell is evaluated as a formula (`-50 % na vše` → error/number; `=...` → live formula that can trigger DDE / data exfiltration warnings).
- **Root cause**: `csvCell` was designed as an RFC-4180 *delimiter* escaper and documented as "the single source of truth for CSV cell escaping," so every export (including this ad export) assumes it also makes cells safe to open — but formula-injection defense is a separate concern it never added.
- **Impact**: security (formula injection / possible data exfiltration on open) plus silent data corruption of any headline/keyword beginning with `-`/`+`/`=`/`@` — exactly the discount-led copy this tool exists to produce.
- **Fix sketch**: in `csvCell`, when `s` begins with `=`, `+`, `-`, `@`, `\t` or `\r`, prefix a single quote (`'`) or a zero-width guard and force-quote the field, before the existing delimiter check. Fixing it in `csvCell` covers this export and every other consumer at once; add a unit test with a `-50 %` and a `=SUM(A1)` cell.

## 2. Semantic pattern search has no relevance floor — every query returns the entire library as "matches"

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/patterns/store.ts:73`
- **Scenario**: When embeddings are available, `searchPatterns` maps *all* patterns to `{ ...p, relevance: cosine(q, patternVecs[i]) }` and only `.sort()`s them — there is no `.filter()`. So a query with zero real relevance (e.g. searching "video kreativa" against a budget-only library) still returns the whole library ranked, with `semantic: true`, including patterns whose cosine is ~0 or negative. The substring **fallback** path directly below (`:81-87`) does the opposite — it filters `relevance > 0` and can legitimately return "no results". The two paths therefore disagree on the most basic question ("did anything match?").
- **Root cause**: the semantic branch treats cosine purely as a sort key and assumes the caller wants a full ranking, while the fallback branch treats relevance as a match predicate — no shared contract for "what counts as a hit".
- **Impact**: success theater — the search box never says "no matches" when embeddings are on; the UI shows unrelated patterns as if they were relevant results, and `getPatternLines` (used to *ground the AI eval*) will surface off-topic "proven wins" for any situation, degrading eval quality.
- **Fix sketch**: apply a minimum-cosine floor (e.g. `relevance >= 0.2`) with `.filter()` in the semantic branch, mirroring the fallback's "must actually match" semantics; expose the threshold as a named constant so both branches share one definition of a hit.

## 3. A single empty embedding vector disables semantic search for the whole corpus and discards already-paid vectors

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/patterns/embeddings.ts:48`
- **Scenario**: `embedTexts` fetches the missing vectors, then bails with `if (!fresh.every((v) => v.length > 0)) return null;` **before** the cache-write loop at `:49-52`. If Gemini returns an empty `values` array for *one* input (a text that is empty/whitespace after `.slice(0,2000)`, an odd Unicode payload, or a transient partial response), the entire batch returns null and every other vector fetched in the same call — all already billed — is thrown away uncached. Because that one corpus text is included on every subsequent search, each search re-hits the API, re-pays, and re-fails identically. `searchPatterns`/`getPatternLines` then permanently fall back to substring matching for that tenant while quietly incurring embedding cost on every request.
- **Root cause**: the "all-or-nothing" success gate treats a per-item failure as a whole-batch failure and is positioned so the good, paid-for vectors are never cached, so there is no progress and no back-off.
- **Impact**: silent, indefinite loss of semantic ranking for an affected tenant + a recurring embedding-cost leak, with only a `console.error`-free null return to show for it (the empty-vector case logs nothing).
- **Fix sketch**: cache the vectors that *did* come back non-empty regardless of the batch verdict; skip/param-guard empty-after-slice texts before the request; and if a corpus text genuinely can't embed, drop just that pattern from ranking rather than nulling the whole search.

## 4. Ad-strength "unique headlines" over-normalizes, flagging genuinely distinct headlines as duplicates

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/ad-strength.ts:76`
- **Scenario**: `distinctCount` counts uniqueness after `normalize`, which strips **all** punctuation and folds diacritics (`.replace(/[^a-z0-9\s]/g, " ")`). Two headlines that differ only by punctuation or symbol collapse to the same string: `"Doprava zdarma!"` and `"Doprava zdarma"` → both `"doprava zdarma"`; `"Sleva 50 %"` and `"50% sleva"`-style variants likewise merge. These are legitimately distinct RSA assets to Google, but the "Unique headlines" factor (weight 20) counts them as one, drops `distinctFrac`, and renders `"Only 1 of 2 headlines are unique — rewrite the duplicates."`
- **Root cause**: the same aggressive tokenization-normalizer used for *keyword matching* is reused for *duplicate detection*, where punctuation and symbols are meaningful signal, not noise.
- **Impact**: wrong score (up to −20) and actively misleading guidance telling the user to rewrite headlines that are already distinct — undermining the tool's core "is this set launch-ready" verdict.
- **Fix sketch**: detect duplicates on a lighter key (trim + collapse internal whitespace + lowercase, keeping punctuation), or only treat as duplicate when the *raw trimmed* strings are equal; reserve the diacritic/punctuation-stripping `normalize` for the keyword-coverage factor.

## 5. Keyword-coverage factor scores 0/20 and claims "no headline contains a keyword" when the ad simply has no keywords

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/ad-strength.ts:103`
- **Scenario**: When `result.keywords` is empty (the model returned none, or a caller builds an `AdResult` without keywords), `keywordTokens` is `[]`, so `headlinesWithKeyword` is 0 and `coverage` is 0. The factor then reports `status: "fail"` and the copy `"No headline contains a keyword. Include keywords in at least half of them."` (`:175-186`) and subtracts its full 20-point weight — even though there are no keywords to include and nothing the user can do inside the ad view.
- **Root cause**: the factor conflates "no keywords supplied" with "keywords supplied but absent from headlines"; there is no guard for the empty-keyword-set case.
- **Impact**: a valid ad is under-scored by up to 20 points and shown an unactionable instruction, biasing the Poor→Excellent rating downward whenever keywords are absent.
- **Fix sketch**: when `keywordTokens.length === 0`, exclude the coverage factor from the weighted sum (renormalize remaining weights) or mark it `partial`/neutral with copy like "No keywords provided — add keywords to measure coverage," instead of a hard fail.
