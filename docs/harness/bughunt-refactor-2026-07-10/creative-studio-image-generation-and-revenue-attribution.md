# Creative Studio - Image Generation & Revenue Attribution

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Leonardo poll budget (120 s) exactly equals the route's `maxDuration` (120 s) — a slow-but-successful generation is killed *after* quota is charged

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/leonardo/client.ts:23-24`
- **Scenario**: `pollGeneration` loops `MAX_POLL_ATTEMPTS = 40` times sleeping `POLL_INTERVAL_MS = 3000` between attempts → up to **120 000 ms of polling alone**. The only route that calls this (`src/app/api/images/route.ts:25`) sets `export const maxDuration = 120`. The full request must also do the `POST /generations` submit, then download each image (`generateCandidates` line 154, sequential `fetch` per candidate), then run N Gemini vision scores (`studio.ts:109-123`) — all *inside* the same 120 s budget. Any Leonardo generation that legitimately completes near the tail of the poll window (e.g. attempt ~34 = ~102 s, common under provider load) leaves no headroom: the serverless function is killed mid-download/scoring and returns the catch-block 502 (`route.ts:143-148`). Crucially, `consume(uid, "image", count)` already decremented the user's daily quota at `route.ts:75` **before** generation, and Leonardo has already produced (and billed) the images in the cloud.
- **Root cause**: The retry ceiling was sized to the function limit (40 × 3 s = 120 s) as if polling were the only work, ignoring that submit + N downloads + N vision calls share the same wall-clock budget. Two independently-chosen constants (`MAX_POLL_ATTEMPTS × POLL_INTERVAL_MS` and route `maxDuration`) were set equal instead of the poll ceiling being strictly less than `maxDuration` minus the download+scoring tail.
- **Impact**: Money-wrong + user-visibly-broken: the user loses `count` image-quota units and Leonardo is charged, yet they receive a generic "Generování se nezdařilo" 502 and no images. Reproducible whenever Leonardo latency pushes completion past ~90–100 s.
- **Fix sketch**: Lower the poll ceiling below the function budget — e.g. `MAX_POLL_ATTEMPTS = 30` (90 s) — and/or pass a deadline into `pollGeneration` computed as `maxDuration − estimatedDownloadScoringMs`. Better: refund the consumed quota in the `route.ts` catch block when `result.source` never materialized (compensating `consume(uid,"image",-count)` or a `refund` helper), so a provider timeout doesn't bill the user.

## 2. Gemini score regex-fallback returns an **unclamped, unvalidated** number, bypassing the 1–10 domain guard the JSON path enforces

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/leonardo/rate.ts:67`
- **Scenario**: The happy path parses JSON and clamps: `Number.isFinite(score) ? Math.max(1, Math.min(10, Math.round(score))) : null` (line 63). But when `JSON.parse` throws, the catch falls back to `const m = text.match(/"?score"?\s*:\s*(\d+)/i); return { score: m ? Number(m[1]) : null, ... }` — **no clamp, no round, no range check**. If the model emits malformed JSON whose text still contains `"score": 42` (or `"score": 0`), `rateImage` returns `42` (or `0`), both outside the documented 1–10 contract (`ImageRating` doc, line 14).
- **Root cause**: Two divergent extraction paths for the same value, and only one enforces the domain invariant. The fallback was written to be lenient about *format* but silently dropped the *value* validation.
- **Impact**: An out-of-domain score corrupts two downstream consumers on the same screen: (a) `studio.ts:139` sorts candidates by `score`, so a spurious `42` makes a defective image the "winner" that gets saved to the library (`route.ts:107-118`); (b) `styleLeaderboard` averages `visionScore` into `avgVisionScore` (`attribution-types.ts:70-71`), skewing the style leaderboard and the derived style prior. A `0` also sorts a real image *below* null-scored ones.
- **Fix sketch**: Route the fallback through the same guard: `const n = m ? Number(m[1]) : NaN; score: Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : null`. Extract a tiny `clampScore(x): number | null` used by both branches.

## 3. Vision-scoring telemetry logs fabricated Gemini spend even when no Gemini call was made

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/images/studio.ts:125`
- **Scenario**: After scoring, `generateImageSet` unconditionally records `recordLlmCall({ provider: "gemini", model: "gemini-vision", attempts: candidates.length, estCostUsd: candidates.length * VISION_USD_PER_IMAGE, demo: false, ... })`. But `rateImage` short-circuits with `{ score: null, defects: "bez GEMINI_API_KEY" }` at `rate.ts:28-29` **without any HTTP call** when `GEMINI_API_KEY` is absent, and returns null (via its outer `catch`) on any network failure. In all those cases zero Gemini requests happened, yet telemetry asserts N vision calls at `N × $0.002`.
- **Root cause**: Telemetry is emitted from the orchestrator based on *candidate count*, not on whether the provider was actually invoked. `rateImage` is designed to fail-soft to null, so its "did I call the API?" signal never reaches the telemetry site.
- **Impact**: Success-theater / logging lie. The Spend and Usage dashboards (which roll up `estCostUsd` by provider/model from `llmTelemetry`) report Gemini-vision cost that was never incurred — most acutely in the common repo-default configuration where `LEONARDO_API_KEY` is set but `GEMINI_API_KEY` is not, inflating reported AI spend for every generation.
- **Fix sketch**: Have `rateImage` return a discriminator (e.g. `called: boolean` or a null `score` already implies "no billable call" for the no-key path). In `studio.ts`, compute `const scored = images.filter(i => i.score != null).length` and set `attempts`/`estCostUsd` from `scored`, or skip the vision `recordLlmCall` entirely when `scored === 0`.

## 4. Product (img2img) mode drops `styleUUID`, but the creative is still recorded and attributed under `req.style` — polluting the style→ROAS leaderboard

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/leonardo/client.ts:120`
- **Scenario**: When `initImageId` is set (PRODUCT mode, `route.ts:100`), `generateCandidates` builds the SDXL body with **no `styleUUID` field** (`client.ts:120-130`) — the chosen `ImageStyle` never influences the pixels; only `init_image_id`/`init_strength` do. Yet `generateImageSet` returns `style: req.style` unchanged (`studio.ts:146`), the route saves the winner with `style: result.style` (`route.ts:114`), and the attribution route records `style: body.style` (`attribution/route.ts:62`). `styleLeaderboard`/`deriveStylePrior` then group ROAS by a style label that was cosmetic metadata, not a causal generation input, and `getStylePrior` feeds that "winning style" back into the next prompt (`studio.ts:77`, `attribution.ts:72-76`).
- **Root cause**: The domain assumes `style` is always the applied visual style, but the product-mode branch silently makes it a no-op while the persistence/attribution layer keeps treating it as causal — the two halves of the generate→attribute loop disagree about what `style` means.
- **Impact**: The revenue-attribution model — the module's whole reason to exist — learns a "best-earning style" from creatives whose style UUID never rendered, so the style prior recommends a look based on noise. Silent: numbers look plausible, the leaderboard just ranks the wrong dimension for product-mode tenants.
- **Fix sketch**: In product mode either persist `style: "product"` (a distinct non-styleUUID marker) or exclude `initImageId` creatives from `styleLeaderboard` (add an `appliedStyle: boolean` on `CreativeLink` and filter on it in `styleLeaderboard`), so ROAS is only attributed to styles that actually drove generation.

## 5. `saveCreative` writes Storage bytes then the Firestore doc non-atomically — a Firestore failure orphans the blob (unlistable, undeletable)

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/images/store.ts:46`
- **Scenario**: `saveCreative` first `await storageBucket().file(path).save(bytes)` (line 38) and only then `await creativesCol(tenant).doc(id).set({... storagePath ...})` (line 46). If the Storage save succeeds but the Firestore `.set` throws (transient Firestore error, quota, network), the bytes are already in Storage with **no metadata doc pointing at them**. `listCreatives` (line 60) reads only Firestore, so the blob never appears in the library; `deleteCreative` (line 89) reads the Firestore doc to find `storagePath`, so it can never delete the orphan either. The file header claims "Best-effort: a Storage failure is surfaced, never silently corrupts the library" — but it only reasons about the Storage-fails direction, not this one.
- **Root cause**: A two-store write with the durable index (Firestore) written *second* and no compensating cleanup if the second write fails, so a partial failure leaves unreachable bytes.
- **Impact**: Slow Storage-cost leak of unreferenced blobs that no app path can enumerate or reclaim. Low today (the caller's own catch treats persist as non-fatal, `route.ts:119-121`), but it accumulates silently and is invisible to every reader.
- **Fix sketch**: Wrap the Firestore write in try/catch and, on failure, best-effort `await storageBucket().file(storagePath).delete()` before rethrowing — mirroring the compensating-delete pattern `deleteCreative` already uses. Or write the Firestore doc first (as a pending record) then the bytes, so the index is always a superset of Storage and can drive a reconciliation sweep.
