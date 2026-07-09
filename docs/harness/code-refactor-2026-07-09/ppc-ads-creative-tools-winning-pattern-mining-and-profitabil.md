# PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets

> Context #48 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 15

## 1. Two independent "wasted spend" formulas that will silently disagree if either target changes

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/patterns/extract.ts:71-76`
- **Scenario**: `extractPatterns()`'s "money pit" lesson computes `waste: c.cost * (1 - c.roas / TARGET_ROAS)` to rank the worst-performing campaign. The exact same expression — same formula, same name, same purpose ("wasted spend" ranking) — is independently implemented in `src/lib/campaigns/budget-moves.ts:55` inside `recommendBudgetMoves()`'s donor ranking. Both files import `TARGET_ROAS` from `@/lib/campaigns/types` (itself re-exporting `PAID_PORTFOLIO_TARGET_ROAS` from the file this context owns, `src/lib/targets.ts`), so today they agree only because nobody has touched either copy since the other was written.
- **Root cause**: the winning-patterns miner (`extract.ts`) was added after `budget-moves.ts` already had a donor-ranking formula, and the same "wasted spend" idea was re-derived from scratch instead of imported.
- **Impact**: if `recommendBudgetMoves` ever grows a discount factor, a floor, or a different waste definition (e.g. clamping negative waste, or weighting by days-active), `extract.ts`'s "past na rozpočet" pattern text will keep using the old formula and silently start disagreeing with the budget-moves panel about which campaign is the worst offender — a correctness split between two user-facing surfaces that both claim to describe the same thing.
- **Fix sketch**: add `export function wastedSpend(cost: number, roas: number, target: number): number { return cost * (1 - roas / target); }` to `src/lib/campaigns/types.ts` (already the shared, client-safe home for `TARGET_ROAS`/`TARGET_PNO` and already imported by both `extract.ts` and `budget-moves.ts`), then replace both inline expressions with a call to it.

## 2. `BLENDED_PNO_GOAL` and `TARGET_SCOPE_LABEL` are unused exports whose own doc comment claims a link that doesn't exist

- **Severity**: High
- **Category**: dead-code
- **File**: `src/lib/targets.ts:16-33`
- **Scenario**: `targets.ts`'s header comment states: "The dashboard reads its goal from the (per-project) dataset `goals.pno`, which is seeded to `BLENDED_PNO_GOAL`... Keep `goals.pno` in the seed in sync with `BLENDED_PNO_GOAL`." A repo-wide grep shows `BLENDED_PNO_GOAL` and `TARGET_SCOPE_LABEL` are referenced nowhere outside this file (no import in `src/components/dashboard/**`, `src/lib/metrics/**`, or anywhere else). The dashboard's actual goal value is a raw literal `"pno": 0.15` in `src/data/performance.json:16` — it matches `BLENDED_PNO_GOAL = 0.15` today by manual coincidence, not by any code path that reads the constant.
- **Root cause**: the constant and the JSON seed were presumably introduced together, but the "seeded to `BLENDED_PNO_GOAL`" wiring was never actually built — the seed stayed a plain JSON literal — and the export + comment were left behind describing a connection that only exists in prose.
- **Impact**: a future edit to `BLENDED_PNO_GOAL` (e.g. tightening the blended target) will do nothing — the dashboard keeps reading the untouched JSON literal — and the only place documenting that gotcha is a comment that asserts the opposite. `TARGET_SCOPE_LABEL` (the `{blended, paid}` Czech scope labels) has zero consumers, so the "every surface MUST label its scope" guarantee the file's top comment promises isn't actually enforced by any imported label.
- **Fix sketch**: either (a) delete `BLENDED_PNO_GOAL` and `TARGET_SCOPE_LABEL` and rewrite the header comment to say the blended goal lives only in `src/data/performance.json` (removing the false "kept in sync" claim), or (b) if per-project overrides of the blended goal are wanted, have `src/lib/project-data/dataset.ts` fall back to `BLENDED_PNO_GOAL` when a project's `goals.pno` is absent, which would make the comment true. Either way, do not leave the current unused-but-documented-as-wired state.

## 3. `searchPatterns` and `getPatternLines` re-implement the same "embed the library, rank by cosine" logic — and have already drifted

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/patterns/store.ts:61-115`
- **Scenario**: `searchPatterns()` (lines 61-88) and `getPatternLines()` (lines 96-115) both: call `getLibrary(tenant)`, flatten to `all = [...saved, ...auto]`, build `texts = all.map((p) => \`${p.title}. ${p.insight} ${p.evidence}\`.trim())`, call `embedTexts([query, ...texts])`, destructure `[q, ...patternVecs]`, and rank by `cosine(q, patternVecs[i])`. Being copy-pasted rather than shared, the two copies have already diverged in a small but real way: `searchPatterns` calls `embedTexts` unconditionally (even for a 1-pattern library), while `getPatternLines` only embeds `if (query && all.length > 1)` — a difference that has no intentional reason and could not exist if there were one code path.
- **Root cause**: `getPatternLines` was added after `searchPatterns` for the AI-eval grounding use case and copied the ranking block instead of calling into it.
- **Impact**: any future change to the embedding/ranking strategy (e.g. a relevance floor, a different text template, batching limits) has to be remembered and applied twice; the existing `length > 1` inconsistency is a small taste of the kind of behavioral drift that will keep happening.
- **Fix sketch**: extract a private helper `rankBySimilarity(all: Pattern[], query: string): Promise<{ranked: (Pattern & {relevance: number})[], semantic: boolean} | null>` in `store.ts` that does the embed-and-cosine-rank step once; have `searchPatterns` call it directly, and have `getPatternLines` call it only when `all.length > 1` (preserving its current, more conservative gate) before mapping to lines and slicing to `limit`.

## 4. `ad-strength.ts`'s diacritic-stripping `normalize()` reimplements the shared `normalizeForSearch` from `nav.ts`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/ad-strength.ts:63-71`
- **Scenario**: `normalize()` here does `.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")` plus punctuation/whitespace cleanup for headline tokenization. `src/lib/nav.ts:96-101` already exports `normalizeForSearch()`, documented as "shared by `slugify` and the quick-nav matcher so 'clanek' finds 'Článek'" — the exact same lowercase+NFD-diacritic-strip core, just using a Unicode range regex instead of `\p{Diacritic}`. The same core operation is reimplemented a third and fourth time inline in `src/components/ai/AdGenerator.tsx:259-260` and `src/lib/content/seo-score.ts:182`.
- **Root cause**: each feature (nav search, ad tokenization, ad-generator UI, SEO scoring) needed "diacritics-insensitive compare" independently and each wrote its own two-line NFD strip rather than reaching for `nav.ts`'s existing one.
- **Impact**: low bug risk today (both regexes are correct for Czech), but four independent copies of "how to fold Czech diacritics" means a correctness fix (e.g. a Unicode edge case) or a behavior change (e.g. also folding `ě`/`ř` specially) has to be found and applied in four places, and a fifth caller will likely add a fifth copy rather than search for the existing ones.
- **Fix sketch**: export the diacritic-fold step alone from `nav.ts` (e.g. `foldDiacritics(s: string): string`, factored out of `normalizeForSearch`), and have `ad-strength.ts`'s `normalize()` call it before its own punctuation/whitespace pass. Keep `ad-strength.ts`'s extra punctuation-stripping local (it is tokenization-specific, not shared).
- **Build risk**: `ad-strength.ts` is imported by `AdGenerator.tsx`, a client component, and its own doc comment stresses "No network, no API" — client-safe by design. Before wiring it to `nav.ts`, confirm `nav.ts` (and its `@/lib/i18n/messages` import) has no transitive `node:fs`/`server-only` import; `tsc --noEmit` will not catch a violation here, only `next build` will.

## 5. `AD_STRENGTH_LABELS` is exported but has no consumer outside its own file

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/ad-strength.ts:14-19`
- **Scenario**: `AD_STRENGTH_LABELS` (the Czech rating-label map) is `export`ed, but every consumer of a rating label (`AdGenerator.tsx`) goes through `getAdStrengthLabel()` at line 253-255, which is the only place inside `ad-strength.ts` itself that reads `AD_STRENGTH_LABELS`. A repo-wide grep finds zero external imports of `AD_STRENGTH_LABELS`.
- **Root cause**: the map was made `export const` alongside the genuinely-public `AD_STRENGTH_ORDER` and `getAdStrengthLabel`, likely for symmetry, without a caller that needs direct access.
- **Impact**: purely cosmetic — the export widens the file's public surface for no reason and can mislead a future reader into hard-coding a lookup that bypasses the locale switch `getAdStrengthLabel` provides.
- **Fix sketch**: drop the `export` keyword from `AD_STRENGTH_LABELS` (leave `AD_STRENGTH_LABELS_EN` as-is, already non-exported) so both label maps are private to the file and only reachable through `getAdStrengthLabel()`.
