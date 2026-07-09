# Product Catalog: Model, Feed Import & Ad-Copy Generation

> Context #37 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 2, Low: 2)
> Files read: 16

## 1. `productOfferingsFor` is a dead export that would also be a persistence trap if ever used

- **Severity**: High
- **Category**: dead-code
- **File**: `src/lib/catalog/resolve.ts:33-36`
- **Scenario**: `productOfferingsFor` has zero callers anywhere in `src/` (verified with a repo-wide grep — the only match is its own definition). Every one of its siblings in `resolve.ts` — `productsFor`, `plansFor`, `servicesFor` — has a persisted-aware counterpart in `src/lib/catalog/load.ts` (`loadProductsFor`, `loadPlansFor`, `loadServicesFor`) that all the authed module pages actually call so a user's saved catalog wins over the seed. `productOfferingsFor` has no `loadProductOfferingsFor` counterpart at all.
- **Root cause**: `resolve.ts` is explicitly the PHASE-1 seed-only layer (per its file header); `load.ts` was added later as the persisted-vs-seed seam, but the raw-`ProductOffering[]` accessor was never carried forward — nothing has needed the richer fields (nature, channels, gtin) outside `Product` yet.
- **Impact**: today it's just unused surface area. The real cost is latent: a future page that needs the richer `ProductOffering` shape (e.g. to show `channels`/`gtin` in an authed context) will find `productOfferingsFor` by name, and it will silently return only the seed, ignoring any catalog the user actually saved — exactly the class of bug `load.ts` exists to prevent, and there's no naming cue warning the caller away from it.
- **Fix sketch**: delete `productOfferingsFor` (`resolve.ts:33-36`); it also makes the `ProductOffering` type import on line 6 unused there, so drop that from the import list too. If/when a caller needs persisted raw product offerings, add `loadProductOfferingsFor` to `load.ts` mirroring `loadProductsFor`, not a resolve.ts-only accessor.

## 2. Identical "decode stored catalog JSON" logic duplicated across the two store backends

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/catalog/store.local.ts:19-24`
- **Scenario**: `store.local.ts:19-24` and `store.firestore.ts:18-23` each implement the exact same pure logic verbatim: `try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed as Offering[] : null } catch { return null }`. This isn't sqlite-vs-Firestore parity noise (constraint #2) — it doesn't touch either backend's API at all; it's backend-agnostic string→`Offering[]|null` decoding that both files happen to need after fetching their differently-shaped row.
- **Root cause**: `store.ts` stays a thin lazy-import dispatcher (by design, so `LOCAL_DB=true` never pulls in `firebase-admin`), so each backend re-implemented the "safely decode the JSON blob" step independently instead of sharing it through the dispatcher.
- **Impact**: any future change to the decode rule — e.g. running `sanitizeOfferings` on read for defense-in-depth, or emitting a corrupt-row telemetry event — has to be applied in two places and can silently drift (one backend fixed, the other not).
- **Fix sketch**: add `export function parseStoredCatalog(raw: string | undefined | null): Offering[] | null` to `store.ts` (pure, no backend import needed). Have `store.local.ts` call `parseStoredCatalog(row.data)` and `store.firestore.ts` call `parseStoredCatalog(raw)`, removing their local try/catch blocks.

## 3. Five near-identical `base` object literals repeated across the seed catalog builders

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/catalog/seeds.ts:59-182`
- **Scenario**: `appCatalog` (59-68), `leadgenCatalog` (98-106), `localSeoCatalog` (135-143) and `contentCatalog` (174-182) each open with their own `const base = { projectId, currency: "CZK", active: true, nature: <const>, source: "manual" as const, updatedAt: SEED_TS, channels: [...] }` literal — the same five fixed fields (`projectId`, `currency`, `active`, `source`, `updatedAt`) copy-pasted four times, varying only in `nature`/`channels`/an occasional `category`. `starter.ts` has the same shape repeated across `eshopStarter`, `appStarter`, `leadgenStarter` and `contentStarter` (lines 36-47, 55-65, 73-84, 91-100).
- **Root cause**: each catalog/starter builder was authored independently per project type, so the "every offering in this batch shares these base fields" idea was never factored into a shared constructor.
- **Impact**: adding or renaming a shared `OfferingBase` field touches 4 call sites in `seeds.ts` (and separately 4 more in `starter.ts`) instead of 1; a typo in one copy (e.g. `currency: "CZK"`) wouldn't be caught by the others.
- **Fix sketch**: in `seeds.ts`, add a local helper `function batchBase(projectId: string, nature: OfferingNature, channels: string[]): Pick<OfferingBase, "projectId"|"currency"|"active"|"nature"|"source"|"updatedAt"|"channels">` and replace each `const base = {...}` with `batchBase(...)`. Do the same independently inside `starter.ts` (do not import between the two files for this).
- **Build risk**: `starter.ts` is imported by the client component `src/components/app/CreateProjectForm.tsx` (via `defaultNatureFor`) and must stay framework-free per its file header — any consolidation helper for it must be added inside `starter.ts` itself, not imported from `seeds.ts` or any server-only module.

## 4. `Locality.gbpPlaceId` is declared but never set or read anywhere

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/catalog/offering.ts:82-87`
- **Scenario**: `gbpPlaceId?: string` is declared on the `Locality` interface (line 86). A repo-wide grep for `gbpPlaceId` returns only that declaration — `LOCALITIES` in `seeds.ts` never sets it, and none of the ~10 consumers of `Locality` (`mappack/sample.ts`, `local/catalog.ts`, `content-schedule/sample.ts`, `reviews/sample.ts`, `activity/sample.ts`, `locations/sample.ts`, `CatalogManagerModule.tsx`) ever read it.
- **Root cause**: looks like it was added ahead of a planned Google Business Profile place-id integration for the local/map-pack modules that hasn't landed.
- **Impact**: minor — a dead optional field is harmless but adds noise to the type, to anyone hand-authoring a `Locality`, and to future serialization/test code that has to account for a field nothing produces or consumes.
- **Fix sketch**: remove `gbpPlaceId?: string;` from `offering.ts:86` until an actual GBP place-id integration reads/writes it; re-add it alongside that feature instead of carrying it speculatively.

## 5. `csvField` re-implements the same RFC-4180-style escaping already in `src/lib/export.ts`

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/catalog/export.ts:17-19`
- **Scenario**: `assetGroupCsv`'s local `csvField` (quote-wrap on `/[",\r\n]/`, comma delimiter, for Google Ads Editor) duplicates the escaping *mechanics* of `csvField` in `src/lib/export.ts:8-11` (quote-wrap on `/[",\n;]/`, semicolon delimiter, for Czech-Excel dashboard exports) — same "wrap in quotes if it contains a special char, double any embedded quotes" technique, two copies.
- **Root cause**: the catalog CSV needs a genuinely different delimiter (comma, because Google Ads Editor expects RFC-4180 comma CSV, not the app's usual semicolon convention for Czech Excel), so it wasn't wired to reuse `lib/export.ts`'s hardcoded-semicolon helper — but a full local reimplementation was written instead of generalizing the shared one.
- **Impact**: low — both are 2-3 line pure functions; the risk is only that a future escaping fix (e.g. also handling a literal tab) gets applied to one copy and not the other. Not a bug today.
- **Fix sketch**: generalize `csvField` in `src/lib/export.ts` to take an optional delimiter (`function csvField(v: string | number, delim: "," | ";" = ";")`, adjusting the test regex to include `delim`), export it, and have `src/lib/catalog/export.ts` import and call it with `","` instead of keeping a local copy. Low priority given the size — safe to leave as-is if the churn isn't worth it.
