# WP W2-D — Outbound product feed: profit/stock-labelled XML the channels pull
card #4 · XL (narrowed to L: serialize + labels + token, no bidding writes) · gate: policy (tokened public URL) · wave 2

## Goal
A project's catalog is served as a pull feed at `/api/feed/{token}?format=google|heureka|zbozi`
— Google Merchant RSS and Heureka/Zboží.cz XML — with profit/stock custom labels
(margin band, stock status) derived from the same ladders the app already uses, so the catalog
becomes the bid surface in the channels' own tools. Acceptance: each serializer round-trips
through the repo's OWN parsers (`parseFeed` reads back what `feedOut` wrote — byte-honest
fixture, pinned), labels match `stockRows`/`marginOf` on a fixture (pinned), the token route
404s an unknown/revoked token (pinned) — ≥20 assertions.

## Non-goals
- No bid changes, no channel API pushes, no per-SKU velocity ledger (#10 is CONCEPT) — labels
  only re-expose what `stockRows`/`marginOf` already compute.
- **The plan's "`inventory-plan` effects" seam does not exist** (verified: zero `effect` hits
  in `src/lib/inventory/`) — dropped; the honest anchors are `stockRows`
  (`src/lib/inventory/compute.ts:107-144`) and the margin ladder
  (`src/lib/profit/products.ts:22`). Do not touch `src/lib/inventory/**`.
- No image hosting, no description generation (no LLM anywhere in this WP).
- Services/plans are NOT fed — products only (`isProduct`/`toProducts`,
  `src/lib/catalog/offering.ts:101,141`); cap `MAX_FEED_ITEMS` (offering.ts:23).
- Do not edit `db.ts`, `delete-cascade.ts`, `duplicate-cascade.ts`, `sast-allowlist.json`,
  `context-map.json` — seam requests. Do not grow `CatalogManagerModule.tsx` (977 LOC debt).

## Seams
- Serializers: NEW `src/lib/catalog/feed-out.ts` — pure. Emits the three formats the repo's own
  importer understands (`src/lib/catalog/feed.ts`): Google Merchant RSS 2.0 with
  `xmlns:g="http://base.google.com/ns/1.0"` (`g:id/title/price/availability/link/image_link/
  description/gtin/brand/product_type` — the exact tags `parseGoogle` :157-175 reads), Heureka
  `<SHOP><SHOPITEM>` (`ITEM_ID/PRODUCTNAME/PRICE_VAT/CATEGORYTEXT/EAN/URL/IMGURL/DESCRIPTION/
  DELIVERY_DATE` — what `parseHeureka` :139-155 reads), Zboží.cz (same SHOPITEM family,
  Zboží tag names). XML escaping by hand (the repo is dependency-free here — mirror
  `decodeEntities` :50-60 in reverse: escape `& < > " '`). Prices `formatted per format`
  (`parseFeedPrice` :77-95 must read them back).
- Labels: NEW `src/lib/catalog/feed-labels.ts` — pure.
  `feedLabels(product, now): { label0: string; label1: string }` where label0 = margin band
  over `p.margin ?? CATEGORY_MARGINS[p.category] ?? CATEGORY_FALLBACK_MARGIN`
  (`src/lib/profit/products.ts:22`, constants `src/lib/margins.ts:43,50`): `marze-vysoka`
  (≥0.45) / `marze-stredni` (≥0.25) / `marze-nizka`; label1 = `sklad-{status}` from
  `stockRows([product], now)[0].status` (`inventory/compute.ts:36,107`). Google: emitted as
  `g:custom_label_0/1`; Heureka/Zboží: appended as `<PARAM>` pairs (their label mechanism).
  Availability: `g:availability` from `active` + stock>0 (`toProduct`'s carry,
  `offering.ts:126-130` logic).
- Token store trio (NEW `src/lib/catalog/feed-token-store.ts` + `.local` + `.firestore`):
  GLOBAL key-addressed like microsites (`src/lib/microsite/store.ts:6-9,30-32`), token minted
  `randomBytes(16).toString("hex")` (`src/lib/outbound/secret-crypto.ts:73-74` shape — but NOT
  encrypted: a feed token is a capability URL like `shared-report`'s, stored plaintext as the
  PK, retrievable so the panel can re-show the URL). One token per project (re-mint replaces +
  revokes the old row).
- Public route: NEW `src/app/api/feed/[token]/route.ts` — GET only; `getFeedToken(token)` →
  404 unknown; loads offerings via `listOfferings(userId, projectId)`
  (`src/lib/catalog/store.ts:13`) with the ids FROM THE TOKEN ROW (ADR-0002: the token row was
  written under an ownership guard; the route trusts only the row); `toProducts` → serialize →
  `Response` with `content-type: application/xml; charset=utf-8` and
  `cache-control: public, max-age=0, s-maxage=1800`. **sast `route-auth` fires** — allowlist
  seam request, reason: "Deliberately anonymous: a merchant feed is pulled by Google/Heureka/
  Zboží robots that cannot sign in. The 128-bit random token in the path IS the credential
  (unguessable, per-project, revocable by re-mint); the route is read-only, spends no AI units,
  and serves only the catalog the owner explicitly exposed."
- Authed management route: NEW `src/app/api/projects/[id]/feed-token/route.ts` —
  `requireOwnedProject` (`src/lib/projects/api-guard.ts:78`; call shape
  `catalog/events/route.ts:19-21`); GET current token (or null), POST mint/re-mint, DELETE
  revoke. Activity: `emitProjectActivity` (module `"katalog"`) on mint/revoke.
- Panel: NEW `src/components/app/modules/catalog/FeedOutPanel.tsx` (client, ≤200 LOC, `T`
  cs/en) copying the `WebhookEndpoints.tsx` card choreography (:79-197 — busy states, retry,
  copy row) but with persistent URLs (three format links + copy buttons), mint/revoke, and a
  short "kam to vložit" hint per channel. Mounted as the third sibling in
  `src/app/app/[projectId]/katalog/page.tsx:45-47` via the same `next/dynamic` +
  `SectionSkeleton` recipe (:17-20). Do NOT mount inside CatalogManagerModule.
- Test harness: temp-db `test-unit/campaigns-local-store.test.mjs:1-30` shape; round-trip
  tests import BOTH `feed-out.ts` and `feed.ts`.

## Data contract
```ts
// src/lib/catalog/feed-token-store.ts
export interface FeedToken {
  token: string;         // 32-hex, PK / doc id
  userId: string; projectId: string;
  createdAt: string;
}
export type FeedOutFormat = "google" | "heureka" | "zbozi";
```
Store API: `getFeedToken(token)`, `getProjectFeedToken(userId, projectId)`,
`mintFeedToken(userId, projectId)` (revokes any prior), `revokeFeedToken(userId, projectId)`,
`clearFeedTokens(userId, projectId)` (cascade).

Sqlite (seam request, migration **v29** — W2-A holds v27, W2-B v28; append after
`db.ts:1032`; `db-migrations.test.mjs:10` LATEST is a seam request):
```sql
CREATE TABLE IF NOT EXISTS feed_tokens (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_tokens_project ON feed_tokens (user_id, project_id);
```
Firestore: `feedTokens/{token}` (userId/projectId fields; project lookup via `queryEq`-style
field query in the firestore backend).

## Invariants
- ADR-0001 both backends; ADR-0002 mint/revoke key off `requireOwnedProject`; the public route
  derives `(userId, projectId)` from the stored row only.
- Honest output: `stock`/`availability` reflect the stored catalog verbatim; no invented
  fields; an empty catalog serves a VALID empty feed (not a 404 — robots must not de-list on a
  transient empty).
- Cascade: deleting a project revokes its token (`delete-cascade.ts` entry — seam request,
  anchor :92/93); NO duplicate-cascade copier (a token is a secret address —
  exclusion comment seam request beside `duplicate-cascade.ts:64-66`).
- Cache Components: plain route handlers, no `export const dynamic`.

## Build steps
1. `feed-out.ts` serializers + round-trip tests (`parseFeed(feedOut(products, f)) ≈ products`
   for all three formats: id/name/price/ean/category/availability survive; escaping test with
   `&`, `<`, diacritics; ≥12 assertions).
2. `feed-labels.ts` + fixture test against `stockRows`/margin ladder (≥5).
3. Token trio + tests (mint replaces, revoke, project lookup, clear).
4. Routes (public + authed) + tests (404 unknown, 404 revoked, XML content-type, empty-catalog
   valid feed, ownership guard on mint).
5. `FeedOutPanel` + katalog mount; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/catalog "src/app/api/feed"
"src/app/api/projects/[id]/feed-token" src/components/app/modules/catalog
"src/app/app/[projectId]/katalog"` · `npm run test:unit` (all `catalog-*` suites green).

## Acceptance
- Round-trip pinned for google + heureka + zbozi (the repo's own parser is the oracle).
- `feedLabels` fixture: a 0.5-margin in-stock product → `marze-vysoka`/`sklad-ok`; a
  low-cover product → `sklad-low` (pinned against `stockRows` output, not re-derived).
- `grep -rn "getFeedToken" src/app/api` → exactly the two routes.
- ≥20 new assertions.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `db.ts` v29 + DDL + table-count comments (`:612`, `:1184`); `db-migrations.test.mjs:10`.
- `delete-cascade.ts` entry at :92/93; `duplicate-cascade.ts` exclusion comment at :64-66.
- `.github/security/sast-allowlist.json` `route-auth` entry for
  `src/app/api/feed/[token]/route.ts` (reason verbatim above).
- `context-map.json` (Director).

## Rollback
Revert; `feed_tokens` inert; external channels pulling a revoked/dead URL get 404 and de-list
after their grace period (their standard behaviour for a removed feed) — no data stranded.
