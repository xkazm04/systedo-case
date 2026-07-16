# Auth & BYOM entitlements — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. `BYOM_MATRIX=true` silently voids the paid entitlement in ANY environment — and the guard never says so
- **Severity**: High
- **Lens**: ambiguity
- **Category**: hidden-entitlement-bypass
- **File**: src/app/api/byom/guard.ts:19 (via src/lib/usage.ts:55-57)
- **Scenario**: An operator sets `BYOM_MATRIX=true` in a staging/prod env (the name reads like a feature flag for the matrix UI, not a billing bypass). `byomUnlocked()` returns true for every user regardless of plan, so `requireByomUser` waves everyone through key management, matrix assignment, and validation.
- **Root cause**: `byomUnlocked(plan)` is `planHasByom(plan) || process.env.BYOM_MATRIX === "true"` — a dev convenience OR-ed into the billing gate, with no production hard-gate (contrast `DEV_AUTH`, which is explicitly killed under `NODE_ENV=production`). `guard.ts`'s docblock ("A signed-in user on the BYOM plan") doesn't mention the flag at all; only `matrix/route.ts`'s header hints at it, so a reader auditing the guard concludes the gate is plan-only.
- **Impact**: One innocuously-named env var turns a paid feature free for all users in a real deployment; the mismatch between the guard's documentation and its actual behavior means reviewers won't catch it.
- **Fix sketch**: Gate the flag like `DEV_AUTH` (`&& process.env.NODE_ENV !== "production"`), rename to something self-describing (`DEV_BYOM_UNLOCK`), and document the bypass in `requireByomUser`'s docblock. Optionally log a loud warning when active, mirroring the DEV_AUTH pattern.

## 2. POST /api/byom/keys stores AND activates a key before testing it; a failed test still returns 200
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: store-before-validate
- **File**: src/app/api/byom/keys/route.ts:35-43
- **Scenario**: A user pastes a typo'd OpenAI key. `putByomKey` persists it and — because it's the user's first key — makes that vendor the *active* vendor (store.ts docblock: "Adding the first key makes that vendor active by default"). Validation then fails, but the route still responds 200 with `validation.ok: false`. If the client only checks HTTP status, the user believes BYOM is set up; every subsequent generation now routes through the broken key and fails at generation time instead.
- **Root cause**: The store-then-test ordering is a deliberate design (test exactly what was persisted), but the trade-off — an unvalidated key becomes live routing state immediately — is undocumented, and the endpoint gives no status-code signal distinguishing "stored + works" from "stored + broken".
- **Impact**: Silent switch of all the user's LLM traffic onto a known-bad key; failure surfaces later in an unrelated flow (generation errors) where the cause is hard to trace back.
- **Fix sketch**: Either validate before `putByomKey` and refuse activation (keep storage if you want retry ergonomics, but don't set `activeVendor` until `check.ok`), or document the contract loudly in the route docblock and ensure the settings UI treats `validation.ok === false` as a blocking error. A distinct response shape (e.g. 200 vs 422) would make the client's obligation explicit.

## 3. PATCH /api/byom silently drops `models` updates with a bad vendor, and casts let non-strings into Firestore
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: inconsistent-validation
- **File**: src/app/api/byom/route.ts:40-44
- **Scenario**: A client sends `{ models: { vendor: "opnai", model: "gpt-5" } }` (typo). The `activeVendor` branch 400s on an unknown vendor, but the `models` branch is guarded by `if (body.models && isByomVendor(body.models.vendor))` — the whole update is skipped with a 200 and a config that quietly lacks the change. Separately, `{ models: { vendor: "openai", fastModel: 123 } }` passes: `body.models.fastModel as string | null | undefined` is a cast, not a check, and the store's truthiness test (`if (models.fastModel) k.fastModel = models.fastModel`) happily persists the number.
- **Root cause**: Two validation philosophies in one handler — reject-invalid for `activeVendor`, ignore-invalid for `models` — plus `as`-casts standing in for runtime type checks on a JSON boundary.
- **Impact**: Model-choice edits can vanish without any error (confusing to debug from the client), and malformed types can be written into the per-user config doc, later surfacing as odd behavior in `resolveByomKey`/model selection.
- **Fix sketch**: 400 on `body.models` present with a non-vendor `vendor` (mirror the `activeVendor` branch), and check `typeof body.models.model === "string" || body.models.model === null` (same for `fastModel`) before passing through.

## 4. DEV_AUTH's "can never become an auth bypass in a real deployment" overclaims — the gate is only `NODE_ENV`
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: overclaimed-invariant
- **File**: src/auth.ts:14-20
- **Scenario**: The app is deployed via a path that doesn't set `NODE_ENV=production` — a custom Node server, a Dockerfile running `node server.js` without the env, a preview/staging platform defaulting to `development` — with `DEV_AUTH=true` copied over from a dev `.env`. Every `await auth()` resolves to the hardcoded test user: full auth bypass, shared identity, real Firestore writes.
- **Root cause**: The docblock states the bypass is "HARD-GATED off ... so it can never become an auth bypass in a real deployment", but the implementation only checks `NODE_ENV !== "production"`. `NODE_ENV` is a build-mode convention, not a deployment-safety boundary; the comment encodes an assumption ("real deployment ⇒ NODE_ENV=production") as a guarantee, so future readers won't add defense in depth.
- **Impact**: A misconfigured deployment silently authenticates everyone as `dev-user`; the loud console.warn at line 65-70 helps only if someone reads server logs.
- **Fix sketch**: Soften the comment to state the actual invariant, and strengthen the gate — e.g. also require the absence of production markers (`VERCEL_ENV === "production"`, presence of `AUTH_SECRET`+Google creds) or make DEV_AUTH opt-in via a value that can't plausibly leak from a template (`DEV_AUTH=I-understand-this-disables-auth`).

## 5. Error `code` taxonomy is inconsistent across the BYOM routes, and the 500 message contradicts the store
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: error-contract-drift
- **File**: src/app/api/byom/guard.ts:10; src/app/api/byom/keys/route.ts:30; src/app/api/byom/matrix/route.ts:45-48
- **Scenario**: A client switches on the machine-readable `code` field. Unauthenticated (401) returns `code: "invalid"` — the same code as every malformed-body 400 — while only the 403 gets a distinct `"forbidden"`; the missing-crypto 500 uses a third value, `"failed"`; and matrix/route's catch maps *internal store failures* to 400 `"invalid"`, blaming the caller for server-side errors. Separately, keys/route.ts:30 tells the operator only `BYOM_KEY_SECRET` is missing, while the store it fronts accepts `BYOM_KEY_SECRET or AUTH_SECRET` — an operator who has `AUTH_SECRET` set would never hit this path, but one debugging from the route's message doesn't learn the fallback exists.
- **Root cause**: `code` values were assigned per-route ad hoc; no shared enum/contract for the BYOM error envelope.
- **Impact**: Clients can't reliably distinguish "sign in again" from "fix your request" without string-matching Czech error text; misleading 400s on store failures send developers hunting for request bugs that aren't there.
- **Fix sketch**: Define the small code set once (e.g. `unauthenticated | forbidden | invalid | server_error`) next to the guard, use 401→`unauthenticated`, map thrown store errors to 500/`server_error` unless recognizably a validation error, and align the crypto message with the store's actual fallback chain.
