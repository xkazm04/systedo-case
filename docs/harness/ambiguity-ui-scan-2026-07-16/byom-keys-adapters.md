# BYOM Keys & Provider Adapters — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Gemini API key sent in the URL query string
- **Severity**: High
- **Lens**: ambiguity
- **Category**: secret-in-url
- **File**: src/lib/llm/byom/adapters.ts:276
- **Scenario**: Every Gemini BYOM call does `fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(byom.apiKey)}`)`. The user's plaintext Gemini key rides in the URL, so it lands in any layer that logs request URLs: corporate/egress proxies, `GEMINI_BASE_URL` overrides pointing at a gateway, fetch instrumentation/APM, and error messages that include the request URL.
- **Root cause**: The v1beta REST convenience `?key=` form was used instead of the equally supported `x-goog-api-key` header. OpenAI/Anthropic/OpenRouter adapters correctly put the secret in a header; Gemini is the odd one out.
- **Impact**: A long-lived user secret (which crypto.ts goes to AES-256-GCM lengths to protect at rest) is exposed in transit-adjacent logs. This directly undercuts the module's own "the decrypted key never leaves the server except through the call-time seam" contract — it leaves through URL logs.
- **Fix sketch**: Send `headers: { "x-goog-api-key": byom.apiKey, "Content-Type": "application/json" }` and drop the `?key=` query param. No behavior change otherwise.

## 2. A transient provider outage during "test connection" silently disables a healthy BYOM key
- **Severity**: High
- **Lens**: ambiguity
- **Category**: sticky-validation-failure
- **File**: src/lib/llm/keys/validate.ts:33-36 (with src/lib/llm/keys/store.ts:155-158, 219)
- **Scenario**: User clicks "test connection" while the vendor happens to return a 5xx / times out / is rate-limited. `validateVendorKey` catches ANY error — including `LlmCallError("server")` and `"rate_limited"`, which the adapters explicitly classify as transient — and returns `{ ok: false }`. `markByomValidation` stamps `lastError`, and from then on `latestValidationFailed()` makes `resolveByomForOperation` skip the key on every generation.
- **Root cause**: The probe collapses the adapters' carefully built user-fault vs transient distinction into a single boolean. There is no auto-retry and no expiry: the flag is only cleared by another manual, successful test.
- **Impact**: A perfectly valid key stops being used indefinitely; generation silently falls back to the app's own providers (the app pays) while the user believes BYOM is active. Nothing in the generation path tells them — the state is only visible if they revisit settings and re-test.
- **Fix sketch**: In `validateVendorKey`, treat transient classifications (`LlmCallError` with code `server`/`rate_limited`) differently — either return a third state ("inconclusive", don't persist `lastError`) or have `latestValidationFailed` ignore errors older than N hours / only honor `ByomUserError`-sourced failures.

## 3. Deleting a key silently activates another vendor's key (unexpected spend reroute)
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: implicit-state-change
- **File**: src/lib/llm/keys/store.ts:111-114
- **Scenario**: User has OpenAI (active) and Anthropic keys stored. They delete the OpenAI key intending to stop BYOM spend. `deleteByomKey` auto-promotes "any remaining configured vendor" — `Object.keys(cfg.keys)[0]`, an arbitrary insertion-order pick — to active, and all subsequent generation starts billing their Anthropic account without any confirmation.
- **Root cause**: The fallback conflates "keep BYOM configured" with "keep BYOM active". Deleting a key is a spend-related action; auto-activating a different personal payment surface is a policy decision buried in a store helper (documented only in a code comment, not surfaced to the UI).
- **Impact**: Money moves to a provider account the user did not choose at that moment; the arbitrary `[0]` pick makes the outcome non-deterministic when 2+ other vendors exist.
- **Fix sketch**: On deleting the active vendor, clear `activeVendor` (BYOM off → app providers) and let the UI prompt "switch to <vendor>?"; or at minimum return which vendor was auto-activated so the settings route can surface it.

## 4. Gemini has no prompt-embed fallback, contradicting the module contract; a bare 400 becomes a misclassified retryable "server" error
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: contract-drift
- **File**: src/lib/llm/byom/adapters.ts:272-293 (vs. module doc lines 7-10 and classifyByomResponse:81-83)
- **Scenario**: The module doc promises "if a user-picked model rejects the structured-output param, the adapters retry once with a prompt-embedded schema… so any model still works" — but `runGemini` calls `byomHttpError` directly with no `fetchWithFallback`. A Gemini model/endpoint that 400s on `responseSchema` (or on an unsupported `thinkingConfig.thinkingLevel`, e.g. an older 2.5-era model where the comment in reasoning.ts:23 notes the param differs) never gets the embed retry.
- **Root cause**: `classifyByomResponse` returns `null` for a bare 400 to mean "try prompt-embed"; `byomHttpError`'s `??` arm then rebrands that deterministic request-shape failure as `LlmCallError("server")` — a *retryable* error — for the vendor with no fallback path.
- **Impact**: The wrapper wastes its bounded retries replaying a request that will 400 identically every time, then falls to the app provider; the user sees a generic "provider failed" instead of the promised any-model compatibility. Future maintainers reading the module doc will assume Gemini has the fallback.
- **Fix sketch**: Either give `runGemini` the same `fetchWithFallback` pair (embed the schema in the prompt, `responseMimeType: "application/json"` only), or narrow the module doc to OpenAI/Anthropic/OpenRouter and make the Gemini bare-400 a non-retryable request error.

## 5. Per-vendor temperature defaults diverge silently (magic 0.7)
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: magic-number
- **File**: src/lib/llm/byom/adapters.ts:285
- **Scenario**: The same tool call with `temperature` unset behaves differently per vendor: OpenAI/OpenRouter omit the param (model default), Anthropic never sends one at all, but Gemini hardcodes `temperature: call.temperature ?? 0.7`.
- **Root cause**: An unexplained `?? 0.7` literal in one adapter; nothing documents why Gemini alone gets a pinned default instead of the model default the other three rely on.
- **Impact**: Switching a tool's matrix assignment between vendors changes sampling behavior in a way no one chose; A/B-ing providers for output quality is quietly confounded.
- **Fix sketch**: Match the other adapters — spread `...(call.temperature !== undefined ? { temperature: call.temperature } : {})` into `generationConfig` — or hoist 0.7 to a named, commented constant if the pin is intentional.
