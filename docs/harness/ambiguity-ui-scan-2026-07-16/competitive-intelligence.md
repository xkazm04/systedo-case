# Competitive Intelligence: Keywords, SEO Compare & LP Experiments — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 4 medium / 0 low)

## 1. LP-experiment trust gate fails OPEN exactly when data is scarcest (control CVR = 0)
- **Severity**: High
- **Lens**: ambiguity
- **Category**: trust-gate-fails-open
- **File**: src/lib/lp-exp/compute.ts:85,138-141
- **Scenario**: A `running` experiment whose control arm has 0 signups so far (a brand-new test, or a broken control page). `requiredSampleSize(0, …)` hits the `!(p1 > 0 …)` guard and returns `Infinity`; the caller then maps non-finite to `progress = 1` and `hasEnoughData = true`.
- **Root cause**: `Infinity` is used both as "sizing is impossible" and as the gate threshold, and the non-finite fallback branch resolves to the *permissive* value (`: true` / `: 1`) instead of the conservative one. The comment block sells the gate as a peeking guard, but the degenerate baseline — the case a peeking guard exists for — bypasses it.
- **Impact**: With control at 0 conversions, any challenger with a handful of signups produces a large z (pooled SE small), clears the corrected-α confidence bar, and `significant` flips true on a running test with a few dozen visitors — the exact false-positive the gate was built to prevent. UI shows a full progress bar ("enough data") on a test that has effectively none.
- **Fix sketch**: When `requiredPerArm` is not finite, fail closed: `hasEnoughData = false`, `progress = 0` (or `minVisitors / someFloor`). Alternatively size against a floor baseline (e.g. `max(controlCvr, 1/controlVisitors)`), and document that a 0-CVR control can never be "read". Also worth a guard: `evaluate` crashes outright on `exp.variants = []` (`variants[0]!`).

## 2. Fabricated sample volumes can beat — and discard — real Sklik data in the merge
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: fake-data-outranks-real
- **File**: src/lib/keywords/types.ts:58-66 (rule), src/lib/keywords/engine.ts:108-111 (call site)
- **Scenario**: No Google Ads connection (base = deterministic sample, head-term base volume up to ~9000) but `SKLIK_API_TOKEN` is set and Sklik returns real ideas. `mergeRawIdeas` dedupes overlapping keywords with "higher avgMonthlySearches wins" — the invented sample record wins whenever its fabricated volume exceeds Sklik's real one, which the ~9000-scaled generator makes likely for head terms.
- **Root cause**: The "richer record wins" rule (`a real volume beats a conservative default`, types.ts:53-54) implicitly assumes both sides are real providers. The engine also feeds it the sample generator, whose numbers are not measurements, so "higher = richer" inverts into "fabricated beats measured".
- **Impact**: The one keyword the user can verify externally shows an invented volume labeled "Ukázka" while the real Sklik figure was silently thrown away; opportunity scoring and intent-group totals for the merged list are then driven by fiction where fact was available.
- **Fix sketch**: In `mergeRawIdeas` (or via a flag from the engine), make provenance trump volume: a `source: "sklik"` record always beats a `source: "sample"` record on dedupe; keep the volume rule only for real-vs-real (google vs sklik). One added tie-break line plus a test.

## 3. `estRevenue` treats monthly search volume as guaranteed visits — no CTR/rank capture factor
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: overstated-revenue-estimate
- **File**: src/lib/seo-compare/compute.ts:118-122
- **Scenario**: A user opens the SEO-compare view with real channel economics wired in (`seoChannelFrom` found an organic row) and reads "estimated monthly revenue" per query.
- **Root cause**: `estConversions = q.volume * seo.cr * INTENT_CONVERSION_FACTOR[q.intent]` multiplies the *entire* monthly search volume by the site conversion rate — i.e. it assumes 100 % of searchers click through to the site. Even a #1 organic ranking captures roughly 25–35 % of clicks; a realistic page-one win captures far less. The doc comment carefully hedges the intent factor ("coarse, clearly-labeled estimate") but never mentions this much larger omission.
- **Impact**: Revenue/conversion figures overstated ~3–10×, on the surface explicitly designed to "tie ranking to real economics". Users prioritizing content by `estRevenue` are anchored to numbers that can't materialize; trust in the whole panel erodes once anyone checks.
- **Fix sketch**: Multiply by an explicit CTR capture constant (e.g. `const SERP_CAPTURE = 0.25 // ~top-3 organic CTR`) or derive it from `rank`, name it in the `QueryAcquisition` doc, and label the UI figure "při umístění v top 3" so the assumption is visible instead of implicit.

## 4. Score normalization floor `Math.max(…, 1)` collapses low-volume keyword lists to all-"low" opportunity
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-normalization-floor
- **File**: src/lib/seo-compare/compute.ts:66-70
- **Scenario**: `deriveCompareQueries` feeds the engine from a real saved keyword list in a niche vertical — comparison keywords with `avgMonthlySearches` of 20–60 (the sample generator itself floors at 20). Raw scores land around `20 × 1.0 × 1.3 / 75 ≈ 0.35`, all below 1.
- **Root cause**: `const max = Math.max(...scored.map(s => s.score), 1)` — the `1` is an undocumented div-by-zero guard, but because scores are unbounded ratios (not 0..1), it silently becomes the normalization ceiling whenever every score < 1. Normalized values then reflect absolute score, not relative rank, and `highCutoff`/`mediumCutoff` (0.66/0.33) compare against the wrong scale.
- **Impact**: A small-market tenant sees every query tiered "low" opportunity regardless of the clear relative winners among them — the tier column (and the "Ladění skóre" cutoffs) become meaningless precisely for the long-tail users the saved-list path was built for.
- **Fix sketch**: Guard emptiness explicitly instead of flooring: `if (scored.length === 0) return []; const max = Math.max(...scored.map(s => s.score)); const norm = max > 0 ? s.score / max : 0;`. Tiers then always mean "relative to the best query in this set", matching the panel's mental model.

## 5. Brand-intent classification is a raw substring match — short/generic brand names hijack the intent buckets
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: substring-brand-match
- **File**: src/lib/keywords/types.ts:209-216 (with resolver at src/lib/keywords/engine.ts:27-39)
- **Scenario**: The active project is named with a common word — e.g. "Bio", "CRM", "Nástroj", or a name embedded in other words ("Ora" ⊂ "srovnání" is one accent away). `classifyIntent` runs `k.includes(brand.toLowerCase())` first and brand wins over every other bucket.
- **Root cause**: The classifier assumes the project name is a distinctive token, but `resolveBrandName` returns whatever the user typed as a project name, with no word-boundary check, no minimum length, and no stop-word guard. The assumption is stated nowhere; sample.ts even generates `bio ${s}` modifiers that would collide with a project literally named "Bio".
- **Impact**: For such tenants, large swaths of transactional/informational/local keywords are mislabeled "Značkové", corrupting the intent groups, group volume totals, and any downstream strategy read ("most demand is brand" when it isn't). Silent — nothing flags the collision.
- **Fix sketch**: Match on word boundaries against a folded keyword (`new RegExp(`(^|\\s)${escapeRegex(brandFolded)}(\\s|$)`)`), require `brand.length >= 3`, and skip brand matching when the brand token is itself in the TRANSACTIONAL/INFORMATIONAL/LOCAL marker lists. Document the remaining limits on `resolveBrandName`.
