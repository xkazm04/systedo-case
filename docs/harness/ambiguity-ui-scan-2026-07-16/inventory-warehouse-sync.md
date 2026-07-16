# Inventory & Warehouse Sync — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Numeric JSON fields silently become price 0 in the generic ERP mapper
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-type-coercion-loss
- **File**: src/lib/inventory/erp.ts:139
- **Scenario**: A JSON ERP export carries `"priceVat": 349` (a number, not a string) — completely normal for a homegrown ERP or POHODA middleware. `mapErpRows` computes `price: parseFeedPrice(str(cell(mapping.price)))`, and `str()` returns `""` for anything that isn't a string, so every numeric price maps to 0. Same coercion gap hits `ean` and `category` (dropped) and `name` (falls back to the SKU).
- **Root cause**: The `str = (v) => typeof v === "string" ? v : ""` helper is used for fields where numbers are legitimate. The code is inconsistent about it: `sku` (line 119) and `stock`/`margin` (lines 126–128) already have explicit `String(...)` fallbacks for non-string values, but `price`, `name`, `ean`, and `category` do not — so the CSV path works while the JSON path silently corrupts.
- **Impact**: A user connects a real JSON ERP, the sync reports success, and the whole catalog imports with price 0 — coverValue ("value at risk") becomes 0 everywhere, the budget change-set's `adSpendOf` (price × velocity) proposes 0 Kč moves, and offerings show 0 CZK. No error anywhere; it just looks like the shop is worthless.
- **Fix sketch**: Introduce `asText(v) => v == null ? "" : String(v)` and use it for price/name/ean/category (i.e. `parseFeedPrice(asText(cell(mapping.price)))`, matching what stock/margin already do). Add a JSON-with-numeric-fields case to the existing pure-mapper unit tests.

## 2. Baselinker page cap silently truncates >20k-SKU catalogs while stamping a fully successful sync
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-truncation
- **File**: src/lib/inventory/baselinker.ts:87 (cap), src/lib/inventory/sync.ts:103–114 (merge + success stamp)
- **Scenario**: A shop with more than `BASELINKER_MAX_PAGES × BASELINKER_PAGE_SIZE = 20 000` SKUs syncs. `collectBaselinkerPages` stops at page 20 and returns the partial list with no signal that it hit the cap; `computeSync` merges it, `runCatalogSync` stamps `lastSyncAt` and clears errors, and the warehouse badge shows a healthy "ok / synced N min ago".
- **Root cause**: The cap is deliberately documented ("a shop past this needs a scoped/incremental sync") but the truncation is unobservable — `collectBaselinkerPages` returns `ProviderProduct[]` with no `truncated` flag, so neither the sync result, the connection record, nor any alert can distinguish "full catalog" from "first 20k of it". The forced-`merge` comment in sync.ts even acknowledges partial views but only caps the blast radius; it never tells anyone.
- **Impact**: SKUs beyond the cap keep permanently stale stock/price while the UI asserts freshness. Stock-transition alerts for those SKUs fire (or fail to fire) off stale numbers, and the user has no way to learn why some products never update.
- **Fix sketch**: Return `{ products, truncated }` from `collectBaselinkerPages` (truncated = walked to `maxPages` and the last page was full). Thread it into `SyncResult` and surface it: append a warning to the diff/message ("Katalog přesáhl 20 000 položek — synchronizována jen část") and consider recording it as a non-fatal `lastError`-style note so the badge stops claiming full health.

## 3. Secret fallback chain makes token decryption silently rot on env changes
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: hidden-key-rotation-hazard
- **File**: src/lib/inventory/token-crypto.ts:31–38, 78–94
- **Scenario**: Tokens are encrypted under `CATALOG_TOKEN_SECRET || AUTH_SECRET || NEXTAUTH_SECRET`. A deployment stores tokens while only `AUTH_SECRET` exists, then later an operator adds a dedicated `CATALOG_TOKEN_SECRET` (the "proper" setup the error message itself recommends) — or rotates `AUTH_SECRET` for an auth incident. Every stored `tokenEnc` now decrypts with the wrong key.
- **Root cause**: `decryptToken` intentionally returns `null` for both "no secret configured" and "wrong secret / tampered blob" (never throws), and nothing in the module distinguishes "this blob was written under a different secret" from "no token". The precedence chain is documented only implicitly in code; the operational consequence (adding the dedicated var = mass key rotation) is documented nowhere.
- **Impact**: All existing warehouse connections quietly stop syncing — the sync path sees a null token, fails as if the user never entered one, `failCount` climbs, and users get "sync failed" alerts with no hint that an env change, not their token, is the cause. Recovery requires every user to re-enter their token.
- **Fix sketch**: Document the precedence + rotation hazard in the module header, and make the failure diagnosable: e.g. have `decryptToken` (or a wrapper) log/return a distinct "undecryptable blob present" state so the sync route can say "token je uložen, ale nelze dešifrovat — po změně serverového tajemství jej zadejte znovu". Optionally embed a key-id (hash of the secret) in the v2 blob to detect mismatch cheaply.

## 4. Raw machine codes ("empty", "no-token") persisted as lastError and shown to users
- **Severity**: Medium
- **Lens**: ui
- **Category**: unlocalized-error-surface
- **File**: src/lib/inventory/sync.ts:138 (`lastError: result.message ?? result.code`)
- **Scenario**: A scheduled sync returns a result code that carries no human message — `empty` (provider returned zero products), `no-token`, `no-config`, `unknown-provider`, `not-implemented`. `runCatalogSync` persists the bare code string as `lastError`. `deriveWarehouseBadge` then exposes it as the failing badge's `lastError`, and `alertSyncFailed` interpolates it into the Czech inbox alert, webhook, and HTML email ("Baselinker · Shop: empty").
- **Root cause**: `SyncCode` is an internal discriminant, but the stamping path uses it directly as user-facing text whenever `message` is absent — only `provider-error` reliably sets a localized `message`.
- **Impact**: The connection badge and failure email — the two places a non-technical Czech user learns their warehouse broke — show an untranslated internal token that explains nothing ("empty" reads like a bug, not "váš sklad nevrátil žádné produkty"). It also erodes trust in an otherwise carefully localized surface.
- **Fix sketch**: Add a `messageForCode(code): string` map with Czech texts (e.g. `empty` → "Zdroj nevrátil žádné produkty — katalog nebyl změněn.") and stamp `lastError: result.message ?? messageForCode(result.code)`. Keep the machine code in a separate field if the cron needs it.

## 5. Action plan fabricates donor data when a move's SKU is missing from the stock rows
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: fabricated-fallback-values
- **File**: src/lib/inventory/action-plan.ts:63–82
- **Scenario**: `buildActionPlan` joins `changeSet.moves` back to `stock` by SKU. If a donor/recipient SKU isn't in the map — the change-set was computed from a different (older/filtered) stock snapshot than the one passed in — the code invents values: `donorStatus: "low"`, `donorMargin: 0`, `recipientMargin: 0`, `valueAtRisk: 0`, `stockoutAt: null`.
- **Root cause**: `donor?.status ?? "low"` and friends paper over a broken join instead of treating it as the data-consistency error it is. Nothing asserts that `changeSet` was derived from the same `stock` array, and the fabricated `"low"` is indistinguishable from a genuine low-stock donor.
- **Impact**: The plan is explicitly pitched as an "EXECUTABLE, governed change-set" whose numbers a real apply would act on. A silent snapshot mismatch renders moves with a fake status and 0 % margins that still pass the guardrail check (amounts are real), so a user could approve spend shifts justified by fabricated context. Future maintainers also can't tell the fallback is "should never happen" rather than a valid state.
- **Fix sketch**: Either make the invariant explicit — filter out (or mark `orphaned: true`) moves whose donor is absent from `stock`, excluding them from `withinGuardrails` — or accept `StockRow[]` and derive the change-set internally so the two inputs cannot drift. At minimum, replace `?? "low"` with a comment-free honest sentinel rather than a plausible status.
