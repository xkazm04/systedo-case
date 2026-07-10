# Auth & BYOM entitlements

> Total: 5
> Critical: 0 · High: 2 · Medium: 1 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

Note: prior report finding #1 (guard.ts hand-rolled `currentUserId`) has since been
applied — `guard.ts:4` now imports `currentUserId` from `@/lib/session`. Not re-reported.

## 1. Lost-update race: every BYOM config mutation is a non-transactional read-modify-write over a full-document overwrite

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/app/api/byom/keys/route.ts:35`
- **Scenario**: `putByomKey` (and every sibling mutation — `setActiveByomVendor`, `setByomKeyModels`, `markByomValidation`, `setByomOperation`, `deleteByomKey`) does `get(userId)` → mutate the in-memory config → `save(userId, cfg)`, where the Firestore backend `saveByomConfig` (`src/lib/llm/keys/store.firestore.ts:50-51`) is a whole-document `.set(clean(cfg))` — no `merge`, no transaction, no field-level update. Two concurrent requests (e.g. the settings UI firing "add OpenAI key" and "add Anthropic key" back-to-back, or a `keys` POST racing a `matrix` POST) both read the same base doc, each apply only their own vendor/operation, and the second `.set()` overwrites the first — silently dropping the other request's just-stored key or matrix override. Contrast `src/lib/usage.ts:84`, which uses `firestore.runTransaction` for exactly this reason.
- **Root cause**: The store assumes single-flight, serialized access per user; it treats the config doc as if only one writer is ever in flight, but the settings API exposes many independent mutating endpoints a client can (and the UI does) call in parallel.
- **Impact**: Data loss — a paid user's encrypted API key or per-operation model assignment vanishes with no error surfaced; the UI shows success (the response is built from whichever write landed last).
- **Fix sketch**: Route all mutations through a `firestore.runTransaction` (read ref → mutate → `tx.set(ref, clean(cfg))`) in `store.firestore.ts`, or make each op a field-scoped `.set(..., { merge: true })` / `.update()` touching only its own `keys.<vendor>` / `operations.<toolId>` path so concurrent writers no longer clobber sibling fields. The local sqlite backend should mirror with a single `BEGIN IMMEDIATE` transaction.

## 2. A freshly-added first key auto-activates BEFORE its test runs and is never deactivated when the test fails — all of the user's AI generation silently routes through a key known to be broken

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/api/byom/keys/route.ts:35`
- **Scenario**: POST `/api/byom/keys` calls `putByomKey` first, which sets `cfg.activeVendor = vendor` when no vendor is active yet (`src/lib/llm/keys/store.ts:54`). Only *afterwards* does the route resolve + `validateVendorKey` + `markByomValidation` (lines 37-41). If the probe fails (typo'd key, wrong model, provider outage), `markByomValidation` records `lastError` but does **not** clear `activeVendor` — and `resolveActiveByomKey` (`store.ts:144-147`) resolves the active vendor with zero regard for `lastError`/`lastValidatedAt`. So the moment a user pastes their first (invalid) key, BYOM is switched on and every subsequent `/api/ai` call for that user is dispatched through the broken key and fails, even though the key card only shows a small "test failed" badge with no hint that the whole AI stack is now hijacked.
- **Root cause**: "Adding the first key makes it active" (an ergonomics default) is applied unconditionally and eagerly, before the key is known to work; the resolve path assumes an active key is a working key.
- **Impact**: User-visibly-broken — all AI tools silently degrade/fail for the user with a misleading, low-prominence error, until they manually disable or fix BYOM.
- **Fix sketch**: Either (a) auto-activate only after a passing validation (validate first, then `putByomKey` + activate on `ok`), or (b) have `resolveActiveByomKey`/`resolveByomForOperation` skip a key whose latest validation failed (treat `lastError` set with `lastErrorAt > lastValidatedAt` as "not usable" → fall back to the app's own providers) and surface a clear banner.

## 3. PATCH `/api/byom` never validates the chosen model against the vendor catalog (matrix does) and silently no-ops an invalid vendor

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/api/byom/route.ts:40`
- **Scenario**: The PATCH `models` branch is `if (body.models && isByomVendor(body.models.vendor)) setByomKeyModels(userId, vendor, { model, fastModel })`. Two gaps: (a) the `model`/`fastModel` strings are passed straight through to `setByomKeyModels` with **no** check against `BYOM_MODEL_CATALOG` — unlike `matrix/route.ts:37` which rejects a model not in `BYOM_MODEL_CATALOG[vendor].models`. A caller can persist an arbitrary/typo'd model as the vendor's active model; it then flows into `resolveActiveByomKey` and every real generation fails at the provider with an opaque "model not found". (b) When `body.models.vendor` is present but not a valid vendor, the `&&` guard makes the whole branch a silent no-op — the route still returns 200 with the unchanged config, so the client believes the model was saved.
- **Root cause**: PATCH treats the model field as free-form and reuses the enum guard as a filter (silently skip) rather than a validator (reject), diverging from the stricter matrix route's contract.
- **Impact**: Bad data persisted → later silent generation failures; plus success-theater on an invalid vendor. Wrong-value / degradation, not a crash.
- **Fix sketch**: Validate `models.model`/`models.fastModel` against `BYOM_MODEL_CATALOG[vendor].models` (reuse the matrix check) and return the standard 400 when the vendor is present-but-invalid instead of silently dropping the update — ideally via a shared `requireByomVendor`/`requireByomModel` helper in `guard.ts`.

## 4. The BYOM key "test connection" makes a live paid vendor call with no timeout / AbortSignal — the request can hang until the platform kills it

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/byom/validate/route.ts:26`
- **Scenario**: Both `validate` POST (line 26) and `keys` POST (`keys/route.ts:39`) call `validateVendorKey(...)`, which runs `runByom(...)` — a real HTTP call to the vendor. The adapters accept an optional `call.signal` AbortSignal (`src/lib/llm/byom/adapters.ts:34,112,180,252,308`), but `validateVendorKey` constructs the call with only `system`/`prompt`/`schema` and passes no `signal`. Node's `fetch` has no default timeout, so if the vendor endpoint stalls (DNS blackhole, half-open socket, slow model), the route hangs holding a serverless invocation until the platform's hard timeout, returning a generic 5xx with no actionable message — the exact opposite of the "actionable error" this probe is meant to give.
- **Root cause**: The probe path assumes the vendor always responds promptly; the abort plumbing exists in the adapters but the validation seam never wires a deadline into it.
- **Impact**: Occasional hung request / wasted invocation and a confusing timeout error on the settings screen; degradation, not data loss.
- **Fix sketch**: Give the probe a bounded deadline — pass `AbortSignal.timeout(~10s)` through `validateVendorKey` into the `runByom` call options, and map an abort to a friendly `{ ok: false, error: "Test spojení vypršel." }`.

## 5. Every mutating BYOM route re-reads the full config just to build its response, right after the store already wrote it

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: structure
- **File**: `src/app/api/byom/route.ts:53`
- **Scenario**: The mutation store fns (`setActiveByomVendor`, `setByomKeyModels`, `putByomKey`, `deleteByomKey`, `setByomOperation`, `clearByomOperation`, `markByomValidation`) all return `void`, so each route ends with a separate `await getPublicByomConfig(u.userId)` — a second full-document read of the doc the mutation just loaded and wrote (`route.ts:53`, `keys/route.ts:43,57`, `matrix/route.ts:50,61`, `validate/route.ts:28`). Seven call sites each pay an extra round-trip (and, combined with finding 1, widen the read→write window). This is not the resolve→validate→record duplication the 2026-07-09 report flagged (its finding #2) — it's the response-shaping re-read, which that report did not mention.
- **Root cause**: The store's mutation ops chose a `void` return, forcing callers to re-fetch the very state the op already had in hand.
- **Impact**: Extra Firestore read per mutation and a larger race window; purely non-functional cleanup.
- **Fix sketch**: Have the mutation ops return the updated `PublicByomConfig` (they already hold the mutated `cfg` before `save`) and have routes return that directly, dropping the trailing `getPublicByomConfig` re-read. Folds naturally into the transactional rewrite of finding 1.
