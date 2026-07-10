# BYOM (Bring-Your-Own-Model) Keys & Provider Adapters

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Undecryptable stored key silently downgrades to the app's own providers while the UI still shows the user's key "active"

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/llm/keys/store.ts:165`
- **Scenario**: `crypto.ts:secret()` (lines 15-22) derives the AES key from `BYOM_KEY_SECRET` **or, as a fallback, `AUTH_SECRET`/`NEXTAUTH_SECRET`**. Rotating `AUTH_SECRET` (a routine security practice) — or later setting a dedicated `BYOM_KEY_SECRET` after keys were first stored under `AUTH_SECRET` — changes the derived key, so `decryptByomKey` fails its auth tag and returns `null` (crypto.ts:65-67). In `resolveByomForOperation`, both the override path (`if (apiKey)` at store.ts:165) and the global fallback (`resolveFromConfig` at store.ts:175) then silently yield `null`, so `enterByomForOperation` (byom/request.ts:23-25) enters "no BYOM" and every generation runs on the app's **own** Gemini/Claude-CLI providers — spending the app's quota/money — even though the user configured their own paid key.
- **Root cause**: the assumption that a stored `keyEnc` blob is always decryptable with the *current* secret. `publicByomConfig` (types.ts:170-191) reports `hasKey: true` + `activeVendor` purely from `keyEnc` **presence**, never verifying it decrypts, so the settings UI shows a green "connected / active" state that the backend silently ignores.
- **Impact**: money (app silently pays for calls the user believes hit their own account) + a status-lie: no error, no `lastError`, no telemetry signal — the mismatch is invisible until someone audits provider bills.
- **Fix sketch**: on a decrypt-`null` at resolve time, surface it — write a `lastError`/`decryptFailed` marker via the existing `markByomValidation` shape and have `publicByomConfig` down-rank the vendor to a "needs re-entry" state instead of "active", so the UI stops claiming the key is live. Minimum: log/telemetry a distinct "BYOM key present but undecryptable" event rather than falling through as plain "no BYOM".

## 2. Non-atomic full-document read-modify-write loses concurrent BYOM settings changes

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/llm/keys/store.firestore.ts:51`
- **Scenario**: every mutating op (`putByomKey`, `deleteByomKey`, `setByomKeyModels`, `setActiveByomVendor`, `markByomValidation`, `setByomOperation`, `clearByomOperation`) does `get()` → mutate in memory → `save()`, and `saveByomConfig` calls `byomDoc(userId).set(clean(cfg))` — a **whole-document overwrite**, not a merge or transaction (local backend has the same read-then-`INSERT…ON CONFLICT` gap, store.local.ts:32-43). Two overlapping requests for the same user each read the same base config; the second `set()` clobbers the first. Real trigger: the "test connection" flow (`markByomValidation`) fires while the user adds a second vendor key or flips the operation matrix in the settings UI — the two `set()`s race and one write is lost.
- **Root cause**: treating a multi-field aggregate document as if mutations were serialized; no optimistic-concurrency guard or `runTransaction`.
- **Impact**: data loss — a just-stored encrypted key, an operation-matrix assignment, or a validation result silently vanishes; the vendor the user connected appears to "not stick".
- **Fix sketch**: wrap the read-modify-write in `firestore.runTransaction` (and a single SQLite transaction locally), or make each mutation a field-scoped `set(..., { merge: true })` / `update()` on the specific `keys.<vendor>` / `operations.<toolId>` path instead of overwriting the entire doc.

## 3. `deleteByomKey` leaves orphaned operation-matrix entries pointing at the removed vendor

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/llm/keys/store.ts:96`
- **Scenario**: `deleteByomKey` removes `cfg.keys[vendor]` and reassigns `activeVendor`, but never touches `cfg.operations`. If a user had assigned an operation (e.g. `ads → openai`) via `setByomOperation`, then deletes the OpenAI key, the matrix entry `operations["ads"] = { vendor: "openai", … }` survives with no backing key. `resolveByomForOperation` (store.ts:161-163) reads that override, finds `cfg.keys["openai"]` undefined, and silently falls through to the *global active vendor* — so the tool runs on a vendor the user never assigned to it, while `ByomMatrix` still renders "ads → OpenAI". Worse: re-adding an OpenAI key later silently **revives** the stale assignment.
- **Root cause**: missing cascade cleanup — key deletion doesn't prune dependent references in the operation matrix.
- **Impact**: wrong provider silently serves an operation; UI shows an assignment that isn't in effect (and a later re-key resurrects an assignment the user thought was gone).
- **Fix sketch**: in `deleteByomKey`, after removing the key, drop every `cfg.operations` entry whose `.vendor === vendor` (mirror the `clearByomOperation` filter) before `save()`.

## 4. Gemini adapter transmits the user's API key in the request URL query string

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/llm/byom/adapters.ts:237`
- **Scenario**: `runGemini` builds `…/models/${model}:generateContent?key=${encodeURIComponent(byom.apiKey)}`, putting the user's secret Gemini key in the URL. Unlike the OpenAI/Anthropic/OpenRouter adapters (which pass the key in an `Authorization`/`x-api-key` **header**), a query-string secret leaks into any layer that records URLs: proxy/access logs, Next.js fetch tracing/observability, and — critically — thrown network errors, whose message often embeds the full request URL and which this app surfaces through its telemetry/LightTrack mirror.
- **Root cause**: query-string auth for a user-owned secret; the assumption that the request URL is never logged or embedded in an error.
- **Impact**: security — a BYOM user's paid API key can end up in plaintext logs/traces, enabling third-party spend on their account.
- **Fix sketch**: send the key via the header Google supports — `headers: { "x-goog-api-key": byom.apiKey }` — and drop `?key=` from the URL, matching the header-auth posture of the other three adapters.

## 5. OpenAI and OpenRouter adapters are near-identical duplicated Chat-Completions implementations

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/llm/byom/adapters.ts:281`
- **Scenario**: `runOpenRouter` (281-353) is ~90% a copy of `runOpenAi` (98-156): same `/chat/completions` POST, same `response_format: json_schema` (strict) native call, same `embeddedUserContent` prompt-embed fallback via `fetchWithFallback`, same `choices[0].message.content` → `extractJson` parse, and the same `usage` → `TokenUsage` mapping. They differ only in base URL default, two optional attribution headers, a `max_tokens: 16000`, and reading an extra `usage.cost` field. This is a genuinely new observation — the prior 2026-07-09 report flagged the ALS wrapper, catalog, reasoning-flag and `deleteByomConfig` duplications, but not the adapter bodies.
- **Root cause**: OpenRouter was added as an OpenAI-compatible target by copy-pasting the OpenAI adapter rather than parameterizing it.
- **Impact**: a fix to the shared Chat-Completions path (e.g. a parse-hardening change, a fallback-semantics fix, or a usage-field correction) must be applied twice or silently drifts between the two providers.
- **Fix sketch**: extract one `runOpenAiCompatible(byom, call, opts)` where `opts` carries `{ baseUrlEnv/default, extraHeaders, maxTokens?, includeCostUsd }`; have `runOpenAi` and `runOpenRouter` both delegate, keeping only their small config deltas.
