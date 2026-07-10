# Competitive Intelligence: Keywords, SEO Compare & LP Experiments

> Total: 5
> Critical: 0 · High: 0 · Medium: 3 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Degenerate control CVR silently disables the LP sample-size trust gate and reports 100% progress

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/lp-exp/compute.ts:141`
- **Scenario**: An experiment where the control has zero conversions (`controlCvr = 0`), or a very high baseline (`controlCvr ≥ ~0.87`, so `controlCvr·1.15 ≥ 1`), makes `requiredSampleSize()` hit its guard at line 85 and return `Infinity`. Line 141 then evaluates `Number.isFinite(requiredPerArm) ? minVisitors >= requiredPerArm : true` → **`true`**, and line 138-140 sets `progress = 1`. So `hasEnoughData` is `true` and the progress bar shows 100% precisely when the sizing math is *undefined*. For a `running` experiment, `significant = meetsConfidence && hasEnoughData` (line 149) then reduces to just `meetsConfidence` — the peeking guard the whole file exists to enforce is bypassed. A 3-visitor challenger that happens to out-convert a 0%-control can be declared a statistically significant winner.
- **Root cause**: the ternary treats "sample size cannot be computed" (non-finite) as "sample size satisfied", conflating an undefined result with a passing one. The trust gate assumes `requiredPerArm` is always a meaningful finite number.
- **Impact**: false "significant winner" verdict + a full/"trustworthy" progress indicator on exactly the ill-conditioned experiments (dead control, or near-ceiling baseline) where the read is least trustworthy — success theater that would push a user to ship a losing variant. Real once the documented "real traffic split + analytics" seam replaces sample data.
- **Fix sketch**: invert the non-finite branch — when `requiredPerArm` is not finite, `hasEnoughData` must be `false` and `progress` `0` (you can *never* reach an infinite target), e.g. `const hasEnoughData = Number.isFinite(requiredPerArm) && minVisitors >= requiredPerArm;` and drop the `: 1` fallback so `progress` stays `0`.

## 2. Lost-update race in `updateKeywordTags` read-modify-write

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/keywords/store.ts:36`
- **Scenario**: `updateKeywordTags` reads the whole list doc (`ref.get()`, line 36), rebuilds the entire `keywords` array in memory (lines 39-41), then writes it back with `set(..., { merge: true })` (line 42). Because Firestore `merge` replaces an array field wholesale (arrays aren't field-merged), two near-simultaneous PATCHes — the user re-tagging keyword A in one tab and keyword B in another (each PATCH sends only the changed keyword's tag, per the route at `api/keywords/lists/route.ts:100-108`) — both read the same baseline, and the second write clobbers the first: keyword A's new tag is silently lost.
- **Root cause**: a non-atomic get→compute→set over a whole-document array, with no transaction and no per-keyword field addressing; the code assumes tag edits are serialized.
- **Impact**: silent data loss of a tag change (e.g. a keyword the user marked "negative" reverts to "core"), which then flows into `aggregateNegatives` and the paste-to-Ads negative block — a wrong negative-keyword export with no error surfaced.
- **Fix sketch**: wrap the read-modify-write in `firestore.runTransaction`, or address tags at field level (`ref.update({ [\`keywordTags.${kw}\`]: tag })` with a map field) so concurrent single-keyword edits don't collide.

## 3. "Brand" keyword intent is unreachable — the engine never threads the project brand into classification

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/keywords/engine.ts:43`
- **Scenario**: `classifyIntent(keyword, brand)` (`keywords/types.ts:129-131`) returns `"brand"` only when `brand` is supplied and the keyword contains it. But the sole production caller chain — `researchKeywords` → `finalizeKeywords(seed, source, raw)` at `engine.ts:43` — never passes `brand` (the `finalizeKeywords` `brand` param at `types.ts:148,158` is always `undefined` in-app; grep confirms no caller supplies it). So the `"brand"` branch is dead: no keyword idea is ever classified `"brand"`, the `KEYWORD_INTENT_LABELS.brand` ("Značkové") group is always empty, and a branded query like `"asana cena"` lands in `transactional`/`pricing` instead of `brand`.
- **Root cause**: `finalizeKeywords`/`classifyIntent` were built to accept a brand, but the engine has the project context and never forwards it — a wired-in parameter left unwired.
- **Impact**: a whole intent bucket the UI groups and labels for is permanently empty, and branded search terms are mis-bucketed — degrading the opportunity/intent story for any project with a recognizable brand name (the exact case the seo-compare catalog synthesizes `"{brand} …"` queries for).
- **Fix sketch**: thread the project brand through — add a `brand?` param to `researchKeywords`/`fetchRaw` and pass it into `finalizeKeywords(seed, source, raw, brand)`; the API route already resolves the project/tenant and can supply `project.name`.

## 4. `Math.max(..., 1)` floor double-duties as an empty-guard and distorts opportunity tiers

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/seo-compare/compute.ts:66`
- **Scenario**: `const max = Math.max(...scored.map((s) => s.score), 1);` uses `1` as a divide-by-zero guard for an empty query set, but the `1` also participates when real scores exist. Whenever the top query's score is below `1`, `max` becomes `1` (not the true max), so `norm = score/max` is measured against `1` instead of the real ceiling and no query can reach `highCutoff` (0.66) — the top opportunity is denied "high". This is reachable via `deriveCompareQueries`, which forces `rank: null` (→ `rankFactor` 1.3) but pairs it with low `volume` from saved keywords and high `difficulty` (75 for "high" competition): a set of only low-volume comparison keywords (`score ≈ volume·1.3/75 < 1`) collapses every tier toward "low", so the panel shows "no high-opportunity queries" even though relatively some are the best available.
- **Root cause**: one expression conflates two intents — "avoid dividing by an empty-set max" and "clamp the max to at least 1" — and the second silently rescales legitimate sub-1 score sets.
- **Impact**: misleading opportunity tiering (best-available comparison queries shown as low priority) for niche/low-volume keyword lists; purely a ranking-honesty degradation, no crash.
- **Fix sketch**: guard the empty case explicitly and normalize against the true max: `const max = scored.length ? Math.max(...scored.map((s) => s.score)) : 1;` (or `|| 1` only when the true max is 0).

## 5. Near-me modifier tokens duplicated between the sample generator and the intent classifier, with no shared source

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/keywords/sample.ts:31`
- **Scenario**: `sampleKeywordIdeas` appends near-me/booking suffixes — `"v okolí"`, `"poblíž"`, `"objednání"` (`sample.ts:31-33`) — so the demo surfaces local-intent demand. Those keywords are then classified `"local"` only because the exact same strings are hand-listed in the `LOCAL` token array in `keywords/types.ts:119-123`. The two lists must stay in lock-step for the sample's local keywords to bucket correctly, but nothing links them: adding a fourth near-me modifier to `sample.ts` (e.g. `"${s} v mém okolí"`) without also adding the token to `LOCAL` would silently produce a keyword that classifies as `informational`, quietly breaking the "local seed surfaces local intent" contract the comments on both sides describe. This is distinct from the prior report's five findings (it names a different token-list coupling, not the two `competitor` models nor the `CompareIntent` label mirror).
- **Root cause**: the sample modifiers and the classifier lexicon grew independently; the shared near-me vocabulary was typed twice instead of one exporting a `NEAR_ME_TOKENS` constant the other reuses.
- **Impact**: a hidden correctness coupling — a future contributor extending sample local queries has no compile-time or test signal that classification will silently miss them; the drift only shows up as a mis-grouped demo keyword.
- **Fix sketch**: export the near-me tokens once (e.g. `export const NEAR_ME_TOKENS` in `keywords/types.ts`, reused inside `LOCAL`), and derive the near-me `MODIFIERS` suffixes from that same constant in `sample.ts` (or add a unit test asserting every near-me modifier output classifies as `"local"`).
