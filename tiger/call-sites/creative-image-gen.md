---
id: creative-image-gen
type: tiger/call-site
modality: image
file: src/lib/leonardo/client.ts:146
wrapper: direct (generateCandidates → fetch /generations; orchestrated by generateImageSet)
provider: leonardo
model: Lucid Origin (Kino 2.1) for style mode · Leonardo Vision XL (SDXL) for image-to-image
schema: no (binary image output; no JSON schema)
grounding: 4/4
code_score: "3"
quality_score: "—"
recommended_model: "—"
status: improved
last_scanned: 2026-06-20
characters: []
---

## What it does
Generates N candidate images via Leonardo REST. `generateImageSet` ([src/lib/images/studio.ts:57](../../src/lib/images/studio.ts)) builds the prompt and calls `generateCandidates` ([src/lib/leonardo/client.ts:101](../../src/lib/leonardo/client.ts)), which POSTs `/generations`, polls to COMPLETE, and downloads the bytes. Two paths: **style mode** (Lucid Origin + `styleUUID` + optional `imagePrompts` reference) and **faithful-product image-to-image** (routes to Leonardo Vision XL with `init_image_id` + `init_strength` from a fidelity slider). Entry: `POST /api/images` ([src/app/api/images/route.ts:43](../../src/app/api/images/route.ts)) → also background-removal via `removeBackground`. No key → deterministic SVG placeholder fallback (`demoResult`).

## Prompt & grounding
The prompt is composed once at [studio.ts:65-69](../../src/lib/images/studio.ts) from four real sources, all of which reach Leonardo:
1. **Brand kit** — `brandBlock` ("Drž se značky (barvy, vizuální styl, tonalita): …") prepended.
2. **Style prior** — `req.prior`, the best-earning look from creative→revenue attribution (`getStylePrior`, [route.ts:85](../../src/app/api/images/route.ts)).
3. **User prompt** — the visual description.
4. **Avoid list** — `req.avoid`, defects fed back from a prior winner for an iterate pass.
Plus a **product/style reference image** (`imagePromptIds` or `initImageId` + `fidelity`) reaches generation natively. **Grounding 4/4** — brand, prior, reference, and avoid all wire through. (Honest ceiling: the brand kit is a free-text string the caller passes in `body.brand`; there's no structured palette/logo asset feeding ControlNet, so brand adherence rests on prose + the vision re-rank in [[creative-vision-score]].)

## Code quality
- **Chokepoint/wrapping:** NOT through the text `[[llm-wrapper]]`. A self-contained `api()` helper ([client.ts:30](../../src/lib/leonardo/client.ts)) wraps every REST call with auth + error text — clean and dependency-free, but a *separate* plumbing island from the text chokepoint, so it inherits none of the wrapper's telemetry/retry/cost machinery.
- **Schema/validation:** n/a (binary output). Output is validated only by emptiness (`candidates.length === 0` throws, [client.ts:162](../../src/lib/leonardo/client.ts)) and downstream vision scoring.
- **Retry/fallback/self-repair:** **No retry** on transient `/generations` 5xx or download failures — a single failed `fetch` skips that candidate ([client.ts:153-160](../../src/lib/leonardo/client.ts)); a failed submit throws straight to the route's 502. The only fallback is the no-key SVG path (not an in-flight failure path). Polling is bounded (40 × 3 s = 120 s) and matches `maxDuration = 120` on the route — tight, a cold generation can time out the function before the poll loop gives up.
- **Caching/dedupe:** **NONE.** Identical (prompt, style, format, brand, count) regenerates from scratch every call — the most expensive call site in the app with zero memoization. No input-hash cache. ([Finding] candidate for an input-hash cache keyed on the composed `fullPrompt` + preset + reference ids.)
- **Rate-limit/quota:** Good, but generic — IP fixed-window + a process concurrency semaphore + per-user daily `image` quota live in the route via `[[llm-wrapper]]`'s sibling `src/lib/ai/rate-limit.ts` ([route.ts:44-103](../../src/app/api/images/route.ts)). There is **no Leonardo-account-level rate limiter** (config.md's referenced `src/lib/leonardo/rate.ts` is actually the vision scorer, not a limiter) — concurrent tenants can still burst Leonardo's own quota.
- **Telemetry:** **UN-INSTRUMENTED.** No cost, latency, attempt, or candidate-count metric is recorded. `recordLlmCall` is never called for image gen; Leonardo spend and latency are invisible to the eval dashboard that every text tool feeds. This is the single biggest Lens-1 gap here (see [[creative-vision-score]] and [[patterns-embed]] for the same gap).
- **Prompt/efficiency:** Prompt built once and reused for all N candidates (good). `count` is clamped (`clampCount`, [studio.ts:53](../../src/lib/images/studio.ts)). `guidance_scale`/`contrast`/`alchemy:false`/`ultra:false` are sensible defaults.

## Findings
- (stub) code · **No telemetry** — image gen records no cost/latency/candidate count; wire a Leonardo equivalent of `recordLlmCall` so spend is observable. Raised [[2026-06-20-run]].
- (stub) code · **No cache/dedupe** — add an input-hash cache on the composed prompt+preset+refs; this is the priciest call site and reruns are free to avoid.
- (stub) code · **No transient retry** — a single `/generations` 5xx or a flaky candidate download fails/degrades the whole set with no retry.
- (stub) value · brand grounding is free-text only (no structured palette/logo asset); relies on [[creative-vision-score]] re-rank to enforce brand-fit.
