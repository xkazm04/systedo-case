# AI generation, creative studio & ops telemetry — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Background removal accepts any Leonardo image id — no ownership check, no per-user quota for anonymous callers
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unvalidated-cross-tenant-image-id
- **File**: src/app/api/images/nobg/route.ts:25
- **Scenario**: `POST /api/images/nobg` takes `imageId` straight from the client and hands it to `removeBackground(imageId)` (`src/lib/leonardo/client.ts:186`), which submits a Leonardo nobg variation and returns the resulting PNG as a data URL. `leonardoImageId` values are returned to every generation caller in `/api/images` payloads (route.ts:185), so they circulate in browser memory/devtools. Nothing checks that the id belongs to the caller's tenant — or that the caller is signed in at all (`uid` may be null; the quota block is `if (uid)`-gated).
- **Root cause**: The route trusts the opaque provider id as if it were tenant-scoped; ownership lives only in the app's Firestore library, and this path never consults it. The header comment says "per-user daily image quota" but the code only charges signed-in users, leaving anonymous callers IP-throttled only.
- **Impact**: A caller who obtains (or replays) another tenant's `leonardoImageId` receives that tenant's creative back as a transparent PNG — a cross-tenant image read via the provider. Separately, anonymous users get real paid Leonardo operations with zero per-user metering.
- **Fix sketch**: Require `currentUserId()` (401 otherwise) and verify the id: either look the generation up in the tenant's saved creatives (`generationId`/`leonardoImageId` stored by `saveCreative`) or persist a `tenant → leonardoImageId` allowlist at generation time and check membership before calling `removeBackground`.

## 2. Attribution PATCH is a silent upsert — unknown linkId creates a phantom, style-less link that poisons the leaderboard and style prior
- **Severity**: High
- **Lens**: ambiguity
- **Category**: patch-upsert-phantom-rows
- **File**: src/app/api/images/attribution/route.ts:89
- **Scenario**: `PATCH` calls `updateCreativeMetrics(tenant, linkId, metrics)`, which is `attrCol(tenant).doc(linkId).set({ metrics }, { merge: true })` (`src/lib/images/attribution.ts:63`). A stale, mistyped, or deleted `linkId` doesn't 404 — it **creates** a new document containing only `metrics`, with no `style`, `format`, or `prompt`. The route then returns `{ ok: true }` unconditionally; `DELETE` likewise reports `ok: true` whether or not anything existed.
- **Root cause**: Firestore `set(merge)` is upsert semantics, but the route treats it as "update existing"; there is no existence check and no signal in the return contract.
- **Impact**: Phantom metric-only rows flow into `listCreativeLinks` → `styleLeaderboard` → `deriveStylePrior`, i.e. corrupt attribution data with an `undefined` style bucket skews the prior that **biases future paid generations** (`getStylePrior` is read by `/api/images` POST at route.ts:85). Users editing metrics after a concurrent delete get success feedback for a write that produced garbage.
- **Fix sketch**: In `updateCreativeMetrics`, use `doc.update()` (fails on missing doc) or a pre-read, return a found/not-found boolean, and have the route respond 404 like `/api/images` DELETE already does (images/route.ts:239). Defensively filter style-less docs in `listCreativeLinks`.

## 3. nobg never reconciles the global spend ceiling — provider failures permanently consume cross-tenant budget, unlike the sibling route
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: asymmetric-spend-ledger
- **File**: src/app/api/images/nobg/route.ts:48
- **Scenario**: `guardPaidGeneration` debits 1 unit from the global daily ceiling up front (`paid-guard.ts` → `durableGuard(..., { spendUnits: 1 })`) for both `/api/images` and `/api/images/nobg`. `/api/images` documents and enforces the invariant "reclaim BOTH ledgers" — it refunds the global unit on degrade and on throw (images/route.ts:134, 202). nobg's catch block refunds only the per-user `image` quota; the global unit is never refunded when Leonardo fails or the 120 s poll times out.
- **Root cause**: The refund pattern was ported to nobg for the user quota but not for the global ledger; nothing in `paid-guard` centralizes the refund side, so each route must remember both halves.
- **Impact**: A stretch of Leonardo outages (each nobg attempt 502s after ~poll timeout) drains `AI_GLOBAL_DAILY_CEILING` with zero delivered work, eventually rate-limiting *all* tenants' AI features for the rest of the day — exactly the failure the images route's comment says must not happen.
- **Fix sketch**: Mirror images/route.ts: import `refundGlobalSpend` and call `await refundGlobalSpend(1)` in nobg's catch path (and on the `leonardoConfigured()` early-return, which currently also strands the unit — or move that check before `guardPaidGeneration`).

## 4. Metric coercion silently turns Czech-formatted numbers into 0
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-locale-number-coercion
- **File**: src/app/api/images/attribution/route.ts:23
- **Scenario**: `const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)`. This is a Czech-language product; users naturally type `1,5` (decimal comma) or `1 000` (thousands space) for cost/conversion value. `Number("1,5")` is NaN → stored as `0`, with a 200 response and `ok: true`.
- **Root cause**: Invalid input is conflated with "zero" instead of being rejected; the coercion helper has no way to report "this wasn't a number".
- **Impact**: Revenue/cost metrics are silently zeroed, so ROAS in `styleLeaderboard` and the derived style prior are computed from corrupted data — the user sees their carefully entered numbers vanish to 0 with no error, and generation bias quietly follows the wrong style.
- **Fix sketch**: Normalize locale input before parsing (strip spaces, map `,` → `.`), and return 422 (`"Neplatná hodnota metriky"`) when any provided field still parses to NaN, instead of defaulting to 0. Keep 0 only for genuinely absent fields.

## 5. Anonymous GETs return 200-with-empty while sibling verbs 401 — the UI cannot render a truthful empty state
- **Severity**: Medium
- **Lens**: ui
- **Category**: indistinguishable-empty-vs-unauthenticated
- **File**: src/app/api/images/attribution/route.ts:39
- **Scenario**: Signed-out (or session-expired mid-session) users calling `GET /api/images/attribution` get `{ links: [], leaderboard: [], prior: ... }` with 200; `GET /api/images` likewise returns `{ creatives: [] }` (images/route.ts:214). Yet POST/PATCH/DELETE on the same resources return 401, and the thumbnail source `GET /api/images/file/[id]` returns a raw 401 — so after a session expiry the library page renders "empty library" (or broken `<img>` tiles) instead of "please sign in".
- **Root cause**: Three different unauthenticated contracts across one feature surface (200-empty, 401 JSON, 401 plain-text), with no field telling the client *why* the list is empty. (Contrast: the images GET already models a similar distinction for storage outage via `offline: true` + notice.)
- **Impact**: Users with expired sessions see their creatives and attribution history apparently wiped — a trust-destroying false empty state — and only discover the real cause when a write unexpectedly 401s.
- **Fix sketch**: Make the GETs return 401 (or add `signedIn: false` to the payload, matching the existing `offline: true` pattern) so the client can show a sign-in prompt empty state; have the file route redirect/serve a placeholder or let the client swap thumbnails to a "session expired" tile on 401.
