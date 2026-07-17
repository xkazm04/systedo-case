# Wave 14 — module-clustered tail: Campaigns UI, campaign-perf pages, PPC/pattern mining, creative studio

Branch `vibeman/ambiguity-ui-2026-07-16`. 13 findings assigned (2 High, 9 Medium, 2 Low). **All 13 fixed** — none skipped. tsc clean throughout; `npm run test:unit` **1698/1698** (baseline 1687 + 11 new); LLM gate green on every commit; 0 regressions.

## Commits

| # | Commit | Finding | Sev |
|---|--------|---------|-----|
| 1 | `b28625e` fix(ad-strength): stop falsely failing keyword coverage for short keywords | ppc-patterns-targets #1 | High |
| 2 | `bf6ab7f` fix(images): require positive ROAS + a conversion before crowning a style prior | creative-studio-images #2 | High |
| 3 | `b211203` fix(leonardo): send Gemini key via x-goog-api-key header, not URL query | creative-studio-images #3 | Med |
| 4 | `0180be1` fix(leonardo): honest candidate mime + surface dropped CDN downloads | creative-studio-images #4 | Med |
| 5 | `b5d5b23` fix(images): roll back the Storage upload when saveCreative's Firestore write fails | creative-studio-images #5 | Med |
| 6 | `990c7e6` fix(patterns): keep paid embedding vectors on a partial batch (allSettled) | ppc-patterns-targets #5 | Med |
| 7 | `cc04366` fix(plans): disclose the BYOM app-funded fallback cap and fix its quota CTA | ppc-patterns-targets #4 | Med |
| 8 | `7e07887` fix(patterns): couple mined pattern titles to the contradiction-check constants via a test | ppc-patterns-targets #3 | Med |
| 9 | `b98a15a` fix(campaigns): memoise changesById so CampaignTable's triage memo isn't busted | campaigns-control-plane-ui #3 | Med |
| 10 | `3ade568` fix(campaigns): resolve the KPI portal host robustly with an in-flow fallback | campaigns-control-plane-ui #4 | Med |
| 11 | `287c251` fix(campaigns): distinguish a backend read failure from an empty feed on Aktivita/Spotřeba | campaign-perf-pages #2 | Med |
| 12 | `92dfc11` fix(campaigns): localize the Kampaně channelFocus so en users don't see Czech copy | campaign-perf-pages #3 | Med |
| 13 | `5308af1` fix(campaigns): apply the cost model to triage for all project types, not just eshop | campaign-perf-pages #4 | Med |
| 14 | `cd6f850` fix(campaigns): use the shared czPlural helper for the 1/2-4/5+ selectors | campaigns-control-plane-ui #5 | Low |
| 15 | `cf9fc18` fix(twin): label seeded Správa kanálů data with the shared sample-data banner | campaign-perf-pages #5 | Low |

(15 fix commits for 13 findings — the two kampane/page.tsx findings #3 and #4 were split into separate atomic commits.)

## Narratives

**ppc #1 (High) — Ad Strength keyword coverage.** The ≥4-char token filter drops short Czech heads ("čaj", "med", "bio"), emptying `keywordTokens` and rendering a hard "no headline contains a keyword" fail even when every headline carried the keyword. Added whole-normalized-keyword substring fallback when tokenisation strips everything; when there are genuinely no measurable keywords the factor is excluded and its 20 weight redistributed (score normalised over measured weight) so an absent signal neither penalises nor inflates. New tests: `test-unit/ad-strength.test.mjs`.

**creative #2 (High) — style prior.** `deriveStylePrior` filtered only to styles with spend, so a style with cost + zero conversions (ROAS 0) became `withSpend[0]` and emitted "historically converts best (ROAS 0×)". Now the ROAS branch requires `roas > 0` and ≥1 conversion (`PRIOR_MIN_CONVERSIONS`); otherwise falls back to the highest **average vision score** (explicitly re-sorted, fixing the documented reliance on the ROAS-first upstream sort). New tests: `test-unit/style-prior.test.mjs`.

**creative #3 (Med).** Gemini vision key moved from `?key=` URL query to the `x-goog-api-key` header (behaviour-identical REST) so it stops travelling in the most-logged part of the request.

**creative #4 (Med).** Leonardo candidate mime now read from the CDN `content-type` header (PNG fallback) instead of hard-coded `image/png`; failed candidate downloads counted as `droppedCount` on `LeonardoGeneration` and warned by the studio (quota was charged for them).

**creative #5 (Med).** `saveCreative` now best-effort deletes the just-uploaded Storage blob if the Firestore doc write throws, closing the orphaned-blob hole (Storage ok → Firestore fail).

**ppc #5 (Med) — embeddings.** `embedTexts` switched from `Promise.all` + `every(v.length>0)` (which discarded every paid vector before the cache loop if any one was empty/timed-out) to `Promise.allSettled`: caches + telemeters every fulfilled non-empty vector, still returns null when any input lacks a vector, so callers are unchanged but retries are incremental and spend is visible. New test appended to `test-unit/patterns-embeddings.test.mjs`.

**ppc #4 (Med) — BYOM honesty.** Added an honest `/cena` feature line ("Záložní generování přes náš klíč: 25/den"); the quota-exceeded message in `dispatch.ts` now, for a BYOM-plan user, tells them to add/renew their key and drops the nonsensical `/cena` upgrade CTA.

**ppc #3 (Med) — pattern title coupling.** No behaviour change — added `test-unit/patterns-title-format.test.mjs` that mines real patterns and feeds the mined titles into `contradictedSavedIds`, coupling the mint sites (extract.ts:69/83) to the detection constants (`SCALING_PREFIX`/`BEST_TYPE_SUFFIX`), so a copy reword that desyncs them fails CI. (Full structured-field refactor was the finding's larger option; the test guard is its stated minimum and the low-risk choice for a tail wave.)

**campaigns-ui #3 (Med).** `changesById` wrapped in `useMemo([changes])` so CampaignTable's expensive per-campaign triage memo isn't busted every parent render; TypeBreakdown's dep-exclusion workaround + eslint-disable removed.

**campaigns-ui #4 (Med).** The header KPI portal host is now resolved via a `MutationObserver` that watches until the slot commits, with an in-flow fallback render (+ dev `console.warn`) if it never appears — the portfolio KPI badges can no longer vanish silently.

**campaign-perf #2 (Med).** `listActivity` / `liveActivityForProject` / `liveSpendForProject` now return an `{ ok }` flag (the LLM-telemetry reader rethrows so its single caller can catch); Aktivita and Spotřeba render a new `DataUnavailableNote` on `ok === false` instead of presenting seeded events/spend as the tenant's own during an outage.

**campaign-perf #3 (Med).** Kampaně header uses `projectTypeMeta(type, await getServerLocale()).channelFocus` so en users get `channelFocusEn`, not raw Czech in a translated sentence.

**campaign-perf #4 (Med).** Dropped the `project.type === "eshop"` gate on `getCostModel` in Kampaně so margin-based triage activates for every project type — matching /zisk, which already persists+consumes the (project-scoped) model for all types.

**campaigns-ui #5 (Low).** Three inline `1/2-4/5+` plural ternaries (TriageBanner, HealthTimeline, TypeBreakdown) replaced with the existing `czPlural` from `@/lib/format` (made generic so it preserves the i18n key-literal union). Output byte-identical.

**campaign-perf #5 (Low).** Správa kanálů now passes `sample={resolved.source === "sample"}` so seeded channel/autonomy defaults carry the shared honesty banner (previously unlabeled). Kanály left as-is (it already has an in-module source pill — the finding's request to keep that pill).

## Already-resolved by earlier waves (verified, not re-touched)
- ppc #2 (High): channel/targeting pins are already **explicitly EXEMPT** from contradiction in `extract.ts` (the demo-fed branch is gone) — the finding's recommended fix.
- creative #1 (High): `crownWinner` already flags `scored:false`/"bez vision skóre" (see `studio-winner.test.mjs`).
- campaigns-ui #1 (High): `resolveSignedMoneyFormatter` exists and is threaded (`fmtMoneySigned`).
- campaigns-ui #2 (High): `preparePackage` already returns `{ ok, error }` and surfaces the server error string.
- campaign-perf #1 (High): out of this wave's list.

## Behavior changes needing sign-off
1. **Ad Strength scoring** now redistributes the keyword factor's weight when no measurable keyword exists (score of a keyword-less set rises slightly; previously it was penalised ~20 pts). Short-keyword sets now score their true coverage.
2. **BYOM quota-exceeded response**: for byom-plan users the error copy changed and `upgradeUrl` is now omitted (no `/cena` CTA). Any client relying on `upgradeUrl` always being present should tolerate its absence (existing `ToolError` hides the link when absent).
3. **listLlmTelemetryForProject now throws** on read failure instead of returning `[]` (single caller `liveSpendForProject` catches it). Aktivita/Spotřeba now show an "unavailable" state on a real backend outage rather than sample data.
4. **Kampaně triage** now uses the tenant's cost model for **all** project types, not just eshop — non-eshop tenants who entered a margin will see margin-based break-even where they previously saw the blind portfolio target.

## Patterns
- **Empty-vs-error conflation** (perf #2) and **all-or-nothing batch** (ppc #5) are the same shape: a swallowed failure returning a neutral empty value that a downstream consumer can't distinguish from legitimate emptiness. Fix = thread an explicit `ok`/partial signal.
- **Display copy as load-bearing schema** (ppc #3) and **stringly-typed DOM id** (campaigns-ui #4): both silently break on an unrelated edit; guard with a coupling test or a resilient runtime lookup.
- **Half-threaded cross-cutting concern**: signed money formatter (ui #1, prior wave), currency, cost-model gate (perf #4), provenance banner (perf #5) — a convention applied to some surfaces but not siblings. Fix = apply the one system everywhere.
- Gotcha: `src/lib/llm/telemetry.ts` contains a deliberate raw NUL separator in a hash template (`${system} ${...}`) so ripgrep flags it binary; verified the NUL survived the edit (`nulls 1`).
- Gotcha: the react-hooks lint rule flags a **direct** `setState` in an effect body but not one behind a helper fn — resolving the portal host through a `resolveHost()` helper both reads cleaner and satisfies it.
