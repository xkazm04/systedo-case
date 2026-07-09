# Campaign Sync & Google Ads Connector

> Context #35 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 1, Low: 1)
> Files read: 14

## 1. Add the `server-only` sentinel to the two Google Ads REST clients

- **Severity**: High
- **Category**: structure
- **File**: `src/lib/google/ads.ts:1-15` (also `src/lib/google/keyword-planner.ts:1-9`)
- **Scenario**: Both files' doc comments assert "server-only" but neither actually imports the `server-only` sentinel package, unlike their siblings `src/lib/campaigns/store.ts:11` and `src/lib/campaigns/sync.ts:9`, which do. Every other file in this domain that touches secrets ends up transitively protected anyway: `src/lib/campaigns/connection.ts` and `src/lib/google/token.ts` both import `firestore` from `@/lib/firebase`, and `src/lib/firebase.ts:10` itself carries `import "server-only"` — so a client import of connection.ts, token.ts, or (through them) connector.ts already fails the build today. `google/ads.ts` and `google/keyword-planner.ts` have no such chain: they only import plain type modules (`@/lib/campaigns/types`, `@/lib/keywords/types`) and call the global `fetch`, so nothing stops a future client component from importing them. `formatCustomerId` (ads.ts:43) in particular is a tempting, presentational-looking pure helper — `src/components/campaigns/AdsAccountPicker.tsx` is already `"use client"` and already renders raw, unformatted customer ids (lines 216, 275) — and importing it directly would drag the whole module, including the `GOOGLE_ADS_DEVELOPER_TOKEN`-bearing fetch calls, into the client bundle with zero explicit guard.
- **Root cause**: the domain's `server-only` convention was applied to the Firestore-touching files but never propagated to the two REST-client files, which were presumably assumed to be covered "by association" with the rest of the domain.
- **Impact**: per project constraint #3, `tsc --noEmit` cannot see this at all — only `next build` would, and only once something actually imports the module from client code. At that point the failure mode is a deep, cryptic bundler error (or a silently-`undefined`-but-still-shipped secret) instead of the clear, immediate "cannot import server-only module" error the sentinel already gives everywhere else in this domain.
- **Fix sketch**: add `import "server-only";` as the first import in `src/lib/google/ads.ts` and `src/lib/google/keyword-planner.ts`, mirroring `src/lib/campaigns/store.ts:11`.
- **Build risk**: verified safe today — grepped `src/` for `from "@/lib/google/ads"` and `from "@/lib/google/keyword-planner"`; every current importer (`connector.ts`, `mutations.ts`, `keywords/engine.ts`, `report-metrics/sync.ts`, `api/campaigns/accounts/route.ts`) is server-side. Adding the sentinel changes no current behavior; it only turns a *future* accidental client import into a loud build failure instead of a silent one.

## 2. The sync-over-sync diff recomputes ROAS with the operands swapped from the shared helper

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/campaigns/store.ts:602`
- **Scenario**: `getLatestChanges` defines its own `roas = (cost, value) => cost > 0 ? value / cost : 0` (store.ts:602) to compute `roasBefore`/`roasAfter` for the change-diff (used at lines 618, 629-630, 639). The shared, single-source-of-truth helper is `roas(value, cost)` in `src/lib/metrics/ratios.ts:11` — the exact same formula but with the arguments in the **opposite order** — and it's what `deriveMetrics` calls for every other ROAS number in the app (`src/lib/campaigns/types.ts:199`: `roas(c.conversionValue, c.cost)`). Both call sites are internally consistent today, so nothing is visibly wrong, but the two helpers now disagree on argument order for the identical formula in the same domain.
- **Root cause**: the change-diff was written against raw `SnapshotEntry` shapes (`cost`, `conversionValue`) as a self-contained local closure instead of importing the shared ratios helper.
- **Impact**: a maintenance/bug trap. Anyone who later touches `getLatestChanges`, or copies its local `roas` as a pattern into a new call site, and assumes the shared `(value, cost)` signature will silently compute `1/roas` instead of `roas`. Both a correct and an argument-swapped call compile and return a plausible-looking number, so this is easy to ship and hard to catch in review.
- **Fix sketch**: delete the local `roas` const at store.ts:602, import `roas` from `@/lib/metrics/ratios`, and call it as `roas(valueOf(c), c.cost)` / `roas(valueOf(p), p.cost)` at the three call sites (618, 629-630, 639) to match the shared `(value, cost)` order.

## 3. `headers()`, `num()` and the API version/base URL are copy-pasted between the two Google Ads REST clients

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/google/keyword-planner.ts:8-27`
- **Scenario**: `src/lib/google/keyword-planner.ts` (lines 8-9, 13-22, 24-27) byte-for-byte duplicates three pieces of `src/lib/google/ads.ts` (lines 17-18, 31-40, 314-317): the `API_VERSION`/`BASE` constants, the `headers(accessToken)` builder (Authorization + developer-token + login-customer-id), and the `num()` string/number coercion helper.
- **Root cause**: `keyword-planner.ts` was added after `ads.ts` as a second, independent REST client for the same API family instead of factoring out the shared request plumbing.
- **Impact**: an API version bump (`v18` → `v19`) or an auth-header change (e.g. a new required header) has to be made in two places; missing one silently leaves one client on stale behavior with no compiler warning, since both files typecheck independently.
- **Fix sketch**: extract `API_VERSION`, `BASE`, `headers()` and `num()` into a new shared module (e.g. `src/lib/google/rest.ts`), give it `import "server-only"` at the top (see finding #1), and have both `ads.ts` and `keyword-planner.ts` import from it instead of redefining.
- **Gate impact**: none — neither existing file nor the proposed new module appears in `scripts/llm-gate.mjs`'s `HASHED_FILES`, and neither calls `generateStructured`.

## 4. `campaigns/store.ts` is one 646-line module doing four jobs

- **Severity**: Medium
- **Category**: structure
- **File**: `src/lib/campaigns/store.ts:1-646`
- **Scenario**: one file owns campaign CRUD (lines 64-226), the daily-series store (228-295), the AI-report store plus caching (297-513), and the sync-snapshot/change-diff engine (515-646) — four largely independent concerns sharing only the small `tenantDoc()`/`activePeriod()` helpers. The file is already internally section-commented (`// --- campaigns ---`, `// --- reports ---`, etc.), which is exactly the seam a split would follow.
- **Root cause**: organic growth — each concern was added to the existing store file rather than a new one, since they all persist to the same `tenants/{tenant}` document tree.
- **Impact**: no correctness cost today, but a 646-line file with ~20 exports makes it harder to locate the one function you need, and an edit to "just the reports code" requires scrolling past three unrelated sections.
- **Fix sketch**: split into `src/lib/campaigns/store/campaigns.ts`, `store/series.ts`, `store/reports.ts`, `store/snapshots.ts`, each keeping `import "server-only"` and its own slice of `tenantDoc()`/`activePeriod()` (or a small shared `store/tenant.ts`), then re-export the full public surface from `src/lib/campaigns/store.ts` (or a new `store/index.ts`) so the ~10 existing importers (`sync.ts`, `shared-report.ts`, the `api/campaigns/*` routes, `patterns/extract.ts`, `mutations.ts`) need no import-path changes.

## 5. `AdsConnection` and `ConnectedAccount` are byte-identical interfaces

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/campaigns/connection.ts:7-18`
- **Scenario**: `ConnectedAccount` (the stored shape, lines 7-11) and `AdsConnection` ("the active connection in the shape the connector / tenant resolver expect", lines 14-18) declare the exact same three fields — `customerId`, `customerName`, `connectedAt`. `getConnectedAccount` and `getAdsConnection` both manually re-spread a `ConnectedAccount` into an `AdsConnection` object literal (lines 64 and 74 respectively) purely to satisfy the second type.
- **Root cause**: `AdsConnection` was likely introduced to give the connector-facing return type its own name and doc comment, without noticing it had become a structural duplicate of `ConnectedAccount`.
- **Impact**: cosmetic today — a type-only duplication with no runtime cost — but the two interfaces are one un-synced field rename away from silently diverging, and the two manual re-spreads (lines 64, 74) are unnecessary code.
- **Fix sketch**: replace `export interface AdsConnection { ... }` with `export type AdsConnection = ConnectedAccount;`, then simplify `getConnectedAccount`/`getAdsConnection` to return `match`/`active` directly instead of re-spreading each field.
