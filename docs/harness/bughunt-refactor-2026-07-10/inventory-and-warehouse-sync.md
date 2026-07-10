# Inventory & Warehouse Sync

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `coverValue` drops the price factor, so "value at risk" is shown in Kč but is really units×margin (wrong by a factor of price)

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/inventory/compute.ts:133`
- **Scenario**: `coverValue = daysOfCover * margin * dailyVelocity`. But `daysOfCover = stock / dailyVelocity`, so `dailyVelocity` cancels exactly and the expression collapses to `stock * margin` — a margin-weighted **unit count**, with no `price` term at all. `InventorySeasonModule.tsx:168` sums this into `valueAtRisk` and renders it at line 359 as `fmt.fmtCZK(valueAtRisk)` — i.e. formats a price-free unit count as Czech koruna. For `MIO-FLAX-1K` (stock 210, margin 0.39, price 159) the shelf shows `82 Kč` where the true margin-weighted shelf value is 210×159×0.39 ≈ `13 022 Kč`. The same wrong figure flows into `action-plan.ts:80` (`valueAtRisk`), the "protectedValue" total in `InventoryBudgetActions.tsx:101`, and the insight recommendations at `insights/aggregate.ts:87,99`.
- **Root cause**: The author wrote `daysOfCover × margin × dailyVelocity` believing it produced monetary value, not noticing velocity cancels and `price` was never included — then the UI labelled and currency-formatted the result as CZK.
- **Impact**: A money-labelled metric the merchant uses to judge which stockouts hurt most is undercounted by roughly the SKU's unit price (often 100–500×) and mis-ranks SKUs (a cheap high-stock item outranks an expensive low-stock one). Wrong number presented confidently as currency.
- **Fix sketch**: Compute `coverValue = stock * product.price * margin` (equivalently `daysOfCover * dailyVelocity * price * margin`). Add the `price` factor in `compute.ts:133-136`; the downstream `fmtCZK` render then has correct dimensions. Add a unit test asserting two SKUs with equal stock/margin but different price yield different `coverValue`.

## 2. Baselinker sync fetches only one API page — large catalogs are silently truncated, and `strategy:"replace"` then deletes every SKU past the first page

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/inventory/baselinker.ts:115`
- **Scenario**: `fetchBaselinkerProducts` calls `getInventoryProductsList` exactly once with `{ inventory_id }` and no `page` parameter; `mapBaselinkerProducts` maps whatever came back. Baselinker returns this list paginated (≈1000 products/page, `page` param for the rest), so a catalog with >1 page yields only the first page. In `sync.ts:98` the incoming (truncated) list is fed to `mergeCatalog(current, incoming, opts.strategy)`. With `strategy:"replace"` (reachable from the manual sync route — `STRATEGIES` includes `"replace"`, `catalog/sync/route.ts:13,46`), `mergeCatalog` drops "existing products not present in the feed" (`import.ts:24-25`), so every real SKU beyond page 1 is **removed** from the merchant's catalog. Even under the default `"merge"`, those tail SKUs never receive stock/price/margin updates and silently go stale.
- **Root cause**: The client was built and unit-tested against a single-response shape; nobody looped over Baselinker's pagination, and the design assumes "one call returns the whole inventory."
- **Impact**: Data loss on `replace` (tail of the catalog wiped on a routine sync of any shop with >~1000 SKUs) and stale stock on `merge` — the exact populations most likely to be large warehouse catalogs where this feature matters.
- **Fix sketch**: Loop `getInventoryProductsList` with an incrementing `page` param until a short/empty page is returned, accumulating into one `ProviderProduct[]`; cap total rows the way `erp.ts` does (`MAX_ROWS`). Until pagination exists, refuse `replace` for `baselinker` (force `merge`) so a partial fetch can never delete real SKUs.

## 3. Undecryptable stored token (secret rotation) degrades to `no-token`, mass-failing every tenant's sync with a misleading cause

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/cron/catalog-sync/route.ts:39`
- **Scenario**: `const token = connection.tokenEnc ? decryptToken(connection.tokenEnc) ?? "" : "";`. `decryptToken` returns `null` (never throws) whenever the key can't be derived or the auth tag fails — i.e. whenever `CATALOG_TOKEN_SECRET`/`AUTH_SECRET`/`NEXTAUTH_SECRET` is rotated or unset (`token-crypto.ts:51-55`, `secret()`), a common ops action. The `?? ""` then hands an **empty** token to `runCatalogSync`, which for a credentialed provider returns `{ code: "no-token" }` (`sync.ts:75`). Every credentialed connection across all tenants flips to failing in one cron run; each is stamped with `lastError:"no-token"` and alerted "Synchronizace skladu selhala: no-token" / "vyžaduje API token", telling the merchant *they* removed their token when in fact the server can't decrypt it.
- **Root cause**: `decryptToken`'s null-on-failure contract is collapsed into `""`, erasing the distinction between "no token stored" and "token present but undecryptable"; the caller never consults `hasTokenCrypto()`.
- **Impact**: A single secret rotation silently breaks all warehouse syncs and floods every tenant with an alert whose stated reason is wrong, sending them to re-enter credentials that were never the problem. The failure is invisible in logs (no error thrown).
- **Fix sketch**: In the cron (and `catalog/sync/route.ts:40`), branch on `decryptToken(...) === null` when `tokenEnc` is present: surface a distinct `provider-error` / "token unreadable — reconnect" result instead of `""`, and/or gate on `hasTokenCrypto()` first so a missing secret is reported as a server config fault, not a per-tenant missing token.

## 4. Health stamping writes back a pre-sync snapshot of the whole connection — a token/config update landing mid-sync is silently reverted

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/inventory/sync.ts:113`
- **Scenario**: `runCatalogSync` stamps health by spreading the caller-supplied snapshot: `saveConnection(..., { ...stamp.connection, lastSyncAt, lastError: undefined, ... })`. That snapshot (`connection`) is read at the start of the request (`catalog/sync/route.ts:35,59` reads `stored`; the cron reads it once via `listAllConnections`). The Firestore backend persists it with a full `.set(clean)` overwrite (`connection-store.firestore.ts:46`); local does a full upsert. If, during an in-flight sync (external ERP round-trips can take up to 15 s), the user updates the connection via the warehouse PUT/connect route — rotating the API token, editing the ERP `config`, or changing `inventoryId` — the stamp's full-object write clobbers those newer fields with the stale snapshot values. The next sync then uses the reverted (old) token/config and fails.
- **Root cause**: Health stamping does a read-modify-write of the *entire* connection document from a snapshot captured before the network work, instead of a targeted update of only the health fields it owns (`lastSyncAt`/`lastError`/`lastErrorAt`/`failCount`).
- **Impact**: Lost-update/TOCTOU on the connection record: a token rotation or config edit that overlaps a running sync is silently undone, reintroducing the exact broken credentials the user just fixed.
- **Fix sketch**: Have the stamp write only the health fields (a Firestore `.set(..., { merge: true })` / a local `UPDATE ... SET last_sync_at=..., last_error=..., fail_count=...` keyed on user+project), never re-writing `tokenEnc`/`config`/`inventoryId`. Optionally re-read the connection immediately before stamping.

## 5. `runCatalogSync` reimplements the fail-count transition math that `classifySyncResult` already owns

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/inventory/sync.ts:116`
- **Scenario**: `sync-health.ts` exports `classifySyncResult(connection, ok)` as the single source of truth for the health transition, computing `nextFailCount` (`0` on success, `prevFailCount + 1` on failure) and `recovered`/`newlyFailed`. But `runCatalogSync` (`sync.ts:116-131`) independently hand-derives the persisted state: on `ok` it writes `failCount: 0` + clears `lastError`; on failure it writes `failCount: (stamp.connection.failCount ?? 0) + 1`. So the persisted `failCount` is computed inline in `sync.ts` while the cron's *alerting* decision is computed separately by `classifySyncResult` (`cron/catalog-sync/route.ts:54`) — two implementations of the same "next fail count / recovered" transition that must stay byte-identical or the persisted counter and the alert logic silently diverge. (New: the 2026-07-09 report covered guardrail/provider/channel duplication and dead code, not this stamping/classification split.)
- **Root cause**: `classifySyncResult` was extracted for unit-testable alerting but `runCatalogSync`'s persistence branch was never refactored to consume it, leaving the transition math forked.
- **Impact**: Maintenance landmine — a future change to the fail-count/recovery rule (e.g. a decay or a max cap) done in one place leaves persisted state and alert decisions inconsistent, with no compiler or test signal.
- **Fix sketch**: In `runCatalogSync`, call `classifySyncResult(stamp.connection, result.code === "ok")` and write `failCount: classification.nextFailCount` (clearing `lastError` when `nextFailCount === 0`), so both the persisted counter and the cron's alert use one derivation.
