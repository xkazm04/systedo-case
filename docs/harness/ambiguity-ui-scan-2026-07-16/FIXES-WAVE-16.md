# Wave 16 — LLM provider wrapper / telemetry / BYOM keys & entitlements / AI abuse guards

Module-clustered tail wave over `src/lib/llm/*`, `src/lib/llm/byom/*`, `src/lib/llm/keys/*`,
`src/app/api/byom/*`, and `src/lib/ai/{rate-limit,durable-limit,status-core,response-cache}`.

**Scope:** 14 findings (1 High · 10 Medium · 3 Low) across four reports. All 14 fixed — none
skipped. Earlier waves had already closed ai-abuse #1, llm-wrapper #1–2, byom-keys #1–2,
auth-byom #1 (verified present in the code before starting; not re-touched).

## Commits

| # | Commit | Finding | Sev |
|---|--------|---------|-----|
| 1 | `3141efa` fix(ai-cache): canonicalize hashAiInput key | ai-abuse #4 | M |
| 2 | `8929d9f` fix(ai-status): surface the global daily ceiling | ai-abuse #2 | High |
| 3 | `48624ca` docs(ai-limit): Firestore TTL policy prerequisite | ai-abuse #3 | M |
| 4 | `a151126` docs(ai-limit): UTC-midnight straddle in refund/charge | ai-abuse #5 | Low |
| 5 | `50c3382` fix(lighttrack): forward the real call status | llm-wrapper #3 | M |
| 6 | `e14367d` fix(llm-telemetry): cap listLlmTelemetryForProject | llm-wrapper #4 | M |
| 7 | `bfba7da` fix(byom-keys): delete active key turns BYOM off | byom-keys #3 | M |
| 8 | `5b41f42` fix(byom-adapters): Gemini prompt-embed fallback | byom-keys #4 | M |
| 9 | `3115015` fix(byom-adapters): drop Gemini pinned 0.7 temperature | byom-keys #5 | Low |
| 10 | `40bb1bb` fix(auth): harden DEV_AUTH gate + soften invariant | auth-byom #4 | M |
| 11 | `7f45ad2` fix(byom-api): 400 on PATCH models bad vendor/type | auth-byom #3 | M |
| 12 | `10267ce` fix(byom-api): failed key test no longer routes broken key | auth-byom #2 | M |
| 13 | `e4233a0` fix(byom-api): consistent error-code envelope | auth-byom #5 | Low |
| 14 | `6331fe1` fix(claude): guard CLI stdin write against spawn race | llm-wrapper #5 | M |

## Narratives

- **ai-abuse #4 — hashAiInput determinism.** The cache key hashed insertion-order
  `JSON.stringify` (so reordered-key bodies re-paid a model call) and joined fields with a
  NUL/space delimiter a providerTag could bleed across. Now canonicalizes the whole
  `{mode, locale, providerTag, value}` object with a key-sorted `stableStringify`, fixing both.
  Cache-only, self-heals on 15-min TTL.
- **ai-abuse #2 — global ceiling blindness (High).** Added `peekGlobalSpend()` (plain get on the
  `_global_YYYY-MM-DD` doc), a `global` field on `AiStatusPayload`, a new `"capacity"`
  preflight kind (highest precedence after demo, no upgrade CTA since it isn't the caller's
  fault), status-route wiring, and a banner branch with cs/en copy. The user now sees the
  shared-budget warning instead of a silent until-midnight 429.
- **ai-abuse #3 / #5 — docs.** Documented the required Firestore TTL policy on
  `ratelimits.expireAt` (with the `gcloud … --enable-ttl` one-liner) and the accepted
  UTC-midnight straddle in refund/chargeGlobalSpend.
- **llm-wrapper #3 — LightTrack status.** `trackLlmEvent` now forwards `entry.status`
  (corrupt/error → `"error"`, else `"success"`) instead of a blanket `"success"`, and the
  chokepoint's separate corrupt `recordLlmError` mirror was dropped — one truthful event per call.
- **llm-wrapper #4 — unbounded query.** `listLlmTelemetryForProject` gained a
  `PROJECT_TELEMETRY_MAX = 5000` `.limit()` backstop so lifetime rows can't grow the read forever.
- **llm-wrapper #5 — stdin crash.** Attached a no-op `child.stdin.on("error")` + guarded write so
  an EPIPE/ERR_STREAM_DESTROYED on a dead child degrades to a typed `LlmCallError` instead of an
  uncaught exception that could down the process.
- **byom-keys #3 — delete auto-promote.** Deleting the active vendor now turns BYOM off instead of
  auto-activating an arbitrary `Object.keys[0]` vendor (unexpected spend reroute).
- **byom-keys #4 — Gemini fallback.** `runGemini` routes through `fetchWithFallback`: a
  responseSchema-rejecting 400 now retries with an embedded-schema prompt (`responseMimeType`
  json only) instead of being rebranded a retryable "server" error. New adapter test added.
- **byom-keys #5 — magic 0.7.** Gemini now omits `temperature` when unset (model default), matching
  the other adapters.
- **auth-byom #4 — DEV_AUTH.** Gate now also requires `VERCEL_ENV !== "production"`; comment reworded
  to state the real (non-guarantee) invariant.
- **auth-byom #3 — PATCH models.** 400s on an unknown `models.vendor` (was silently dropped) and
  runtime-checks `model`/`fastModel` are string|null before persisting (was an `as`-cast).
- **auth-byom #2 — store-before-validate.** A failed first-key test now undoes the auto-activation
  (restores prior active vendor / off) so traffic isn't silently routed through a known-bad key;
  response stays 200 + `validation.ok:false`.
- **auth-byom #5 — error codes.** Shared `unauthenticated | forbidden | invalid | server_error`
  envelope documented in the guard; 401→`unauthenticated`, non-validation store throws in
  matrix→500/`server_error`, crypto message aligned with the `BYOM_KEY_SECRET or AUTH_SECRET` fallback.

## Verification

- `npx tsc --noEmit`: **0 errors** (clean before every commit; enforced by the pre-commit hook).
- `npm run test:unit`: **1723 / 1723 pass, 0 fail** (baseline 1719 + 4 new tests, 0 regressions).
  - New tests: response-cache key-order invariance + providerTag-space collision (2);
    ai-status-core `capacity` precedence (1); byom-adapters Gemini prompt-embed fallback (1).
- LLM gate: real-Claude full wrapper suite ran twice (index.ts and claude.ts are HASHED_FILES),
  both passed and re-cached; contract fingerprints unchanged for all 20 tools.

## Behavior changes needing sign-off

1. **byom-keys #3** — deleting the active BYOM key now turns BYOM **off** (app providers) rather
   than auto-activating another stored vendor. The UI may want a "switch to <vendor>?" prompt.
2. **auth-byom #2** — a first BYOM key that **fails its connection test is no longer left active**;
   BYOM stays off until a working key is stored/activated. (Re-keying an already-active vendor is
   unchanged.)
3. **byom-keys #5** — Gemini BYOM calls with no explicit temperature now use the **model default**
   instead of 0.7; outputs will sample slightly differently.
4. **auth-byom #3** — a PATCH `/api/byom` `models` update with an unknown vendor or non-string
   model now returns **400** instead of a silent 200 (clients relying on the old silent-drop see an error).
5. **auth-byom #5** — BYOM error `code` values changed (401 `invalid`→`unauthenticated`, crypto
   500 `failed`→`server_error`, matrix internal failures 400→500). Any client switching on `code`
   should be updated.
6. **ai-abuse #2** — new `AiStatusPayload.global` field + `"capacity"` preflight kind (additive;
   the banner renders new cs/en copy).
7. **auth-byom #4** — DEV_AUTH is now also disabled under `VERCEL_ENV=production`.

## Ops prerequisite surfaced (ai-abuse #3)

Provision a Firestore TTL policy on `ratelimits.expireAt` per environment
(`gcloud firestore fields ttls update expireAt --collection-group=ratelimits --enable-ttl`),
else the collection leaks docs forever.

## Patterns

- Report files carry stray NUL bytes; `response-cache.ts:hashAiInput` literally used `\0`
  delimiters — a byte-accurate Python edit was needed, not the Edit tool.
- `index.ts` and `claude.ts` are HASHED_FILES → committing either triggers the full real-Claude
  wrapper suite (~6–7 min). Batch all non-hashed findings first and commit the hashed ones last;
  give those commits a ≥10-min timeout. The gate rewrites `test-llm/samples/*.json` as a side
  effect — restore them (`git checkout -- test-llm/samples/`) to keep the tree clean.
- A BYOM 400 test body containing the word "model" trips `classifyByomHttp`'s `\bmodel\b`
  model-fault detector — use a model-word-free message to exercise the bare-400 embed path.
