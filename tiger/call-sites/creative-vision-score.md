---
id: creative-vision-score
type: tiger/call-site
modality: vision
file: src/lib/leonardo/rate.ts:42
wrapper: direct (fetch :generateContent)
provider: gemini
model: gemini-3-flash-preview (GEMINI_MODEL; override via GEMINI_VISION_MODEL)
schema: partial (prompt-instructed JSON {score, defects}; no native responseSchema; tolerant regex fallback)
grounding: 2/2
code_score: "3"
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
The "recognize" half of the generate→score→rank loop. For each Leonardo candidate from [[creative-image-gen]], `rateImage` ([src/lib/leonardo/rate.ts:22](../../src/lib/leonardo/rate.ts)) sends the image bytes (base64 inline) + an instruction to Gemini vision and gets back a 1–10 quality score + one-line defects summary. `generateImageSet` ([src/lib/images/studio.ts:83-99](../../src/lib/images/studio.ts)) scores all N candidates **in parallel**, sorts by score desc, and marks `images[0].winner = true`. (Misfiled name: this is the Gemini **vision scorer**, not a rate limiter — config.md mislabels `rate.ts` as the Leonardo rate-limit.)

## Prompt & grounding
Instruction built at [rate.ts:31-39](../../src/lib/leonardo/rate.ts) from two real sources, both of which reach the model:
1. **Intended prompt** — `intendedPrompt.slice(0,240)` so the score reflects prompt-adherence, not just generic prettiness.
2. **Brand kit** — when `brand` is supplied, a `brandClause` ("soulad se značkou (barvy/styl/tonalita): …", `brand.slice(0,200)`) plus an explicit "obrázky mimo styl značky výrazně sniž v hodnocení" downranking directive.
**Grounding 2/2** — both the prompt and brand reach scoring, so the winner is selected for brand-fit, not just visual quality. (Honest ceiling: brand is truncated to 200 chars and the same free-text kit as generation; there's no reference-image-vs-candidate similarity check, so "looks on-brand" is the model's judgment of prose, not a pixel comparison to a brand asset.)

## Code quality
- **Chokepoint/wrapping:** NOT through the text `[[llm-wrapper]]` — a direct `fetch` to `:generateContent` ([rate.ts:42](../../src/lib/leonardo/rate.ts)). Bypasses the wrapper's provider-switch, retry, cost-stamp, and telemetry.
- **Schema/validation:** No native `responseSchema` (the wrapper uses Gemini's, but this hand-rolled call doesn't). Output parsing is robust though: strips ```json fences, `JSON.parse`, then a **regex fallback** (`/"?score"?\s*:\s*(\d+)/`) if parse fails, and clamps `score` to 1–10 ([rate.ts:58-69](../../src/lib/leonardo/rate.ts)). `maxOutputTokens: 256`, `temperature: 0.2` — sensible for a deterministic judge.
- **Retry/fallback/self-repair:** **No retry** and **no self-repair**. Never throws — any failure (no key, non-200, parse miss, network) returns `{ score: null, defects: <reason> }` ([rate.ts:29,52,70-72](../../src/lib/leonardo/rate.ts)) so generation still succeeds. Graceful-degrade is correct, but a null-scored candidate sorts to the bottom (`b.score ?? 0`), so a transient vision blip can silently demote a good image. Single-attempt judging means no majority/adversarial pass on close calls.
- **Caching/dedupe:** **NONE.** Re-scoring the same image (e.g. an iterate pass that re-uploads a prior winner) re-calls Gemini. Could cache on image-hash + brand + prompt.
- **Telemetry:** **UN-INSTRUMENTED.** No cost/latency/token recording — Gemini vision spend (N calls per generation, in parallel) is invisible. Same Lens-1 gap as [[creative-image-gen]] and [[patterns-embed]].
- **Prompt/efficiency:** Efficient — both inputs truncated (240/200 chars), tiny `maxOutputTokens`. Parallel scoring of N candidates is good for latency but multiplies cost N× with no cap beyond `MAX_IMAGE_CANDIDATES`.

## Findings
- (stub) code · **No telemetry** — vision scoring records no cost/latency; instrument the N parallel `rateImage` calls. Raised [[2026-06-20-run]].
- (stub) code · **Null-score demotion** — a transient vision failure returns `score:null` which sorts last (`?? 0`), so a flaky judge can silently bury the best candidate; add one retry before falling to null.
- (stub) code · **No cache** — identical (image, prompt, brand) re-scores from scratch.
- (stub) value · single-judge, prose-only brand check; no candidate-vs-brand-asset pixel similarity (honest ceiling).
