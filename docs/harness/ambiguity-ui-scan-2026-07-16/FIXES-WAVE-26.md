# FIXES — Wave 26 (final tail)

Last 10 open Medium findings across five reports. 8 fixed, 2 already-resolved
(catalog #3/#4 by an earlier wave), 1 resolved-as-false-premise (local-seo-leads #3),
1 clean mechanical improvement taken on a "re-evaluate" item (content-pages #3).

## Commits

| Commit | Finding | Scope |
| --- | --- | --- |
| 001189f | competitive-intelligence #2 | fix(keywords) merge provenance beats sample volume |
| b9df3f4 | competitive-intelligence #5 | fix(keywords) brand intent word-boundary + min-length + marker guard |
| 02d9ccd | competitive-intelligence #4 | fix(seo-compare) normalize to set max, drop floor-of-1 |
| d71f191 | competitive-intelligence #3 | fix(seo-compare) estRevenue applies SERP top-3 CTR capture |
| 30668e0 | cron-jobs #4 | fix(cron) report "sent" alert only on real delivery |
| aa18104 | cron-jobs #5 | fix(cron) surface token-decrypt failure vs empty token |
| cc09008 | content-creative-keyword-pages #3 | fix(content-engine) page-level sample slot on obsahový engine |
| 94adb69 | competitive #2, #5 | test(keywords) merge + brand-intent unit tests |

Two "verify" items resolved without a code commit — see below.

## Narratives

**competitive #2 (merge provenance).** `mergeRawIdeas` deduped by "higher volume wins".
The sample generator scales head terms to ~9000, so a fabricated sample volume beat and
discarded the real Sklik figure. Added a provenance tie-break: a real provider record
(google/sklik) always beats a `sample` record; the volume rule now applies only
real-vs-real or same-source.

**competitive #5 (brand intent).** `classifyIntent` ran `k.includes(brand)` first, so a
short/common project name ("Ora", "Bio", "CRM") hijacked every keyword containing those
letters ("srovnání" → brand for project "Ora"). New `brandMatches` requires a
word-boundary hit, `brand.length >= 3`, and skips when the brand token is itself a
generic TRANSACTIONAL/INFORMATIONAL/LOCAL marker. `resolveBrandName` doc notes the limits.

**competitive #4 (normalization floor).** `Math.max(...scores, 1)` was a div-by-zero
guard that silently became the ceiling for niche low-volume lists (all raw scores < 1 →
all "low"). Replaced with an explicit empty-list guard + `max > 0 ? s/max : 0`, so tiers
always mean "relative to the best query in this set".

**competitive #3 (estRevenue capture).** `acquisitionFor` multiplied the entire monthly
volume by CR, assuming 100% click-through — overstating conversions/revenue ~3-10×. Added
a named `SERP_CAPTURE = 0.25` (top-3 organic CTR proxy) into the estConversions formula
and relabeled the UI title to "při umístění v top 3 … CTR (~25 %)" so the assumption is
visible. **Behavior change** — surfaced numbers drop ~4× (see sign-off).

**cron #4 (report alert).** The success webhook + "Klientský report odeslán" alert were
written unconditionally above the delivery check, so a total SMTP failure announced
"0/0 příjemců" and the retry logged a duplicate "sent". Now branches on
`summarizeDelivery`: delivered>0 → sent alert + webhook; total failure with recipients →
"Odeslání reportu selhalo — zkusíme znovu"; no recipients → nothing.

**cron #5 (token decrypt).** A ciphertext that won't decrypt (`decryptToken` → null, e.g.
after a `TOKEN_CRYPTO_KEY` rotation) was coerced to `""` and sent to the provider,
yielding a misleading generic 401. Now short-circuits with reason
`token-decrypt-failed (check TOKEN_CRYPTO_KEY)` fed through `classifySyncResult` /
`alertSyncFailed` — never calls the provider with an empty token.

**content-pages #3 (sample signal).** Re-evaluated the deferred "three competing sample
signals" item. Took the clean, non-speculative slice: obsahový engine was the only page
with **no** page-level marker while every sibling passes ModulePage's `sample` slot.
Passed `sample={!live}` (live already resolved server-side); the in-module
Živá/Ukázková pill stays for per-widget granularity. The broader cross-page tri-state
"partially sample" harmonization remains a design decision, not mechanically forced here.

## Verify-items outcome

- **content-creative-keyword-pages #3** — partially actioned (page-level slot added, above).
  The full 9-page convention unification is left as a design decision; only the clean
  mechanical gap (a page with zero page-level signal) was closed.
- **local-seo-leads-reviews-ui #3 — RESOLVED AS FALSE PREMISE, no code change.** The
  finding claims `periodAlerts(sources, {}, locale)` hardcodes targets to `{}` so the
  `critical` "cíl/target breach" severity can never fire. The second argument is
  `AlertOptions` (options), **not** a per-source targets map. `sourceAlerts` defaults
  `targetCzk` to the exported `CPQL_TARGET_CZK = 900` (`opts.targetCzk ?? CPQL_TARGET_CZK`),
  so the critical `cpql-target` alert fires whenever `t.cpqlNow > 900`. The 25% drift
  threshold is likewise already the exported named constant `CPQL_ALERT_RISE = 0.25`.
  Both the "targets disabled" and "unnamed threshold" premises are already false; the
  footer copy ("překročení cíle") is accurate. Left unchanged.

## Already-resolved (no commit)

- **product-catalog #3** — Google feed `g:sale_price` precedence: already fixed in commit
  68dbf36 (`feed.ts:163-165` prefers sale_price over price, with the Merchant Center
  comment). Covered by `catalog-feed.test.mjs`.
- **product-catalog #4** — cs dot-thousands parsing: already fixed in 68dbf36
  (`parseFeedPrice` handles `/^\d{1,3}(\.\d{3})+$/`; docstring + test cover "1.299 Kč").

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — **1791 pass / 0 fail** (baseline 1780 + 11 new: 7 keyword-merge/brand,
  4 seo-compare). LLM contract eval green (unchanged).
- All commits passed the lefthook pre-commit (eslint + tsc + LLM gate).
- `uat/driver/*.mjs` remain untracked and untouched.

## Behavior changes needing sign-off

1. **SEO-compare acquisition figures drop ~4×** (competitive #3). The "~conversions/měs"
   column and revenue tooltip now reflect a top-3 SERP capture (25%) instead of full
   search volume. More honest, but any saved expectations / screenshots will differ.
2. **Report cron alert inbox** (cron #4): a total-delivery failure now records
   "Odeslání reportu selhalo — zkusíme znovu" instead of a false "odesláno · 0/0"; a
   run with zero recipients records no alert at all.
3. **Catalog-sync alerts** (cron #5): a `TOKEN_CRYPTO_KEY` mismatch now alerts
   "token-decrypt-failed (check TOKEN_CRYPTO_KEY)" instead of the provider's 401 text.
4. **Brand intent reclassification** (competitive #5): keywords previously mislabeled
   "Značkové" for short/generic project names move to their true intent bucket; a real
   whole-word brand mention is unchanged.

## Patterns

- Provenance must gate "richer record wins" merges — a fabricated default can outrank a
  real measurement on any max-based tie-break.
- `Math.max(x, 1)` guards double as silent ceilings whenever the metric is an unbounded
  ratio that can sit below 1; guard emptiness explicitly instead.
- "Volume = visits" is a recurring honesty gap; name the capture factor and surface it in
  copy rather than burying a 100%-CTR assumption.
- `?? ""` on a decrypt result erases the "undecryptable" vs "absent" distinction — branch
  on the null before falling back.
- Verify "dead-config" premises against the actual parameter shape: an empty **options**
  object is not an empty **targets** map when the function supplies named defaults.
