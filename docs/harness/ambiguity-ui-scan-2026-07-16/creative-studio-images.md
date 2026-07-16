# Creative Studio - Image Generation & Revenue Attribution — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Arbitrary "winner" crowned when vision scoring is unavailable on the live path
- **Severity**: High
- **Lens**: ambiguity
- **Category**: degraded-mode-winner-semantics
- **File**: src/lib/images/studio.ts:143-144
- **Scenario**: LEONARDO_API_KEY is set but GEMINI_API_KEY is not (or every `rateImage` call fails / 429s). All candidates come back with `score: null`, `images.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))` is a no-op tie, and `images[0].winner = true` crowns whatever Leonardo happened to return first.
- **Root cause**: `null` score is coerced to 0 for ranking, and the winner flag is set unconditionally — there is no "ranking was not possible" state distinct from "ranked best". Only the demo path honestly labels itself (`defects: "ukázkový režim"`).
- **Impact**: The UI highlights a random candidate as "the best"; downstream, that pseudo-winner is the one that gets saved to the library and recorded in creative-to-revenue attribution with `visionScore: null`, quietly polluting the very leaderboard `deriveStylePrior` learns from. The user believes the generate→score→rank loop ran when half of it silently didn't.
- **Fix sketch**: When every candidate has `score === null`, either set no winner (and let the UI show a "scoring unavailable — pick manually" notice) or set winner but carry an explicit `scored: false` / `defects: "bez vision skóre"` flag through `StudioImage`/`GeneratedImage` so the surface can distinguish "ranked" from "arbitrary".

## 2. Style prior can lock generation onto a money-losing style (ROAS 0 with spend beats everything)
- **Severity**: High
- **Lens**: ambiguity
- **Category**: attribution-prior-edge-cases
- **File**: src/lib/images/attribution-types.ts:95-104
- **Scenario**: A tenant records one creative link: style "bokeh", cost 500 CZK, zero conversions (ROAS 0). `deriveStylePrior` filters to `withSpend`, picks `withSpend[0]`, and emits the hint "Drž se vizuálního stylu „Bokeh" — historicky nejlépe konvertuje (ROAS 0×)." Every future generation is now biased toward the one style proven to lose money, and the hint asserts the opposite of the truth.
- **Root cause**: "Prefer the highest-ROAS style with real spend" has two undocumented gaps: (a) spend > 0 qualifies even when ROAS is 0, and the wired hint text hard-codes the "converts best" claim; (b) there is no minimum sample size — a single 1 CZK link outranks a 50-creative vision-scored style. `withSpend[0]` also silently relies on `styleLeaderboard`'s sort order, an implicit cross-function contract.
- **Impact**: The self-reinforcing loop (prior → generation → more creatives in that style → more weight) amplifies a bad early signal; the Czech hint actively misinforms the operator.
- **Fix sketch**: Require `roas > 0` (or a minimum conversions/spend threshold, named constants) to qualify for the ROAS branch; fall through to the vision-score branch otherwise. Word the hint conditionally ("zatím bez konverzí" when ROAS is 0) and document the sort dependency or re-sort locally.

## 3. Gemini API key sent as a URL query parameter
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: secret-in-query-string
- **File**: src/lib/leonardo/rate.ts:42
- **Scenario**: Every vision-scoring call builds `${BASE}/models/${MODEL}:generateContent?key=${key}`. With `GEMINI_BASE_URL` overridable to a proxy, and with URLs routinely captured by proxies, gateway access logs, and error/telemetry tooling, the key travels in the most-logged part of the request.
- **Root cause**: The query-param auth style was copied from Google's curl examples; the equivalent `x-goog-api-key` header (already used elsewhere in comparable codebases) avoids URL exposure. Nothing documents why the query form was chosen.
- **Impact**: Credential leakage risk into any log line that records the request URL — including this app's own thrown errors if the fetch layer ever includes the URL — for a paid, quota-bearing key.
- **Fix sketch**: Move the key to the `x-goog-api-key` request header and drop `?key=` from the URL; behavior is identical for the Gemini REST API.

## 4. Failed candidate downloads are silently dropped and mime is hard-coded to PNG
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-partial-results
- **File**: src/lib/leonardo/client.ts:158-168
- **Scenario**: The user requests 4 candidates; Leonardo completes 4, but one CDN download 403s/expires mid-loop. `if (!res.ok) continue;` drops it without a trace — the studio returns 3 images with no indication that a paid candidate vanished. Separately, every downloaded buffer is stamped `mime: "image/png"` regardless of what the CDN actually served (Leonardo can return JPEG), and that mime flows into data URLs, Gemini `inlineData.mimeType`, and the Storage `contentType` of a saved winner.
- **Root cause**: Best-effort download loop with no counter of drops; mime inferred by assumption instead of from the `content-type` response header or the image URL extension.
- **Impact**: Quota is charged for images the user never sees, with zero signal for debugging recurring CDN failures; a mislabeled mime can corrupt vision scoring input typing and serve saved creatives with the wrong content type.
- **Fix sketch**: Read `res.headers.get("content-type")` (fallback to png) for the mime; count dropped downloads and surface them (e.g. `droppedCount` on `LeonardoGeneration`, logged and/or reflected in telemetry `attempts`).

## 5. saveCreative is non-atomic: a Firestore failure after the Storage upload orphans billed blobs
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: partial-write-orphan
- **File**: src/lib/images/store.ts:67-86
- **Scenario**: The Storage `save()` succeeds, then the Firestore `set()` throws (rules, quota, transient outage). The route treats the save as failed, the user retries, and a full-size image blob sits in `tenants/{tenant}/creatives/` forever — no Firestore doc references it, `deleteCreative` can never reach it, and the generation reaper only tracks Leonardo generations, not Storage orphans.
- **Root cause**: Two independent writes with no compensation path; the header comment promises "a Storage failure is surfaced, never silently corrupts the library" but the reverse ordering (Storage ok, Firestore fail) is the undocumented hole.
- **Impact**: Slow accumulation of untracked, tenant-billed storage bytes; also a privacy wrinkle — deleted-from-library never guarantees deleted-from-bucket for these orphans.
- **Fix sketch**: Wrap the Firestore write in try/catch and best-effort delete the just-uploaded Storage file on failure before rethrowing (mirror of the existing delete-tolerant pattern in `deleteCreative`).
