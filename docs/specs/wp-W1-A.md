# WP W1-A — Catalog change ledger: auto-detected SKU-level events
card #27 · L · gate: contract (new sqlite table) · wave 1

## Goal
Every catalog write path (feed import, warehouse sync, manual PUT) appends durable, SKU-level
`CatalogEvent` rows (price / stock / active / margin changes, added, removed, renamed) to a
per-project ledger, and the Katalog module shows them as a timeline — so a performance move can be
explained by "what changed in the catalog on that day". Acceptance: the three write paths each
produce the exact expected events in a fixture test (≥12 assertions), and the ledger is readable
through one dispatcher under LOCAL_DB and Firestore.

## Non-goals
- No LLM. No "explanation" generation — the ledger is the data; the join to performance moves is a
  later WP (W2-E / W3-A read it).
- No change to `mergeCatalog`'s public result (`CatalogDiff` stays what it is; all callers stay green).
- No duplicate-cascade copier: a ledger is OPERATING data by `duplicate-cascade.ts:17-24`'s taxonomy —
  add it to that exclusion comment as a seam request only.
- Do not edit `src/lib/db.ts`, `delete-cascade.ts`, `duplicate-cascade.ts`, `context-map.json` — seam requests.
- Do not grow `CatalogManagerModule.tsx` (977 LOC, existing debt): the timeline is a NEW lazy-loaded
  component mounted from `katalog/page.tsx`, not an edit inside the manager.

## Seams
- Differ: `src/lib/catalog/import.ts:33-44` (`differs(a,b)` boolean over `name, price, category, active,
  gtin, stock, dailyVelocity, margin`), `:51-70` (`overlay`), call site `:117-126`; removed set `:129-130`
  (`leftover`), zeroed under merge at `:141`. Key `keyOf = o => o.sku || o.id` (`:30`).
  → Add a PURE `diffCatalogEvents(current: Offering[], next: Offering[], now, actor): CatalogEvent[]`
  in NEW `src/lib/catalog/events.ts` (independent of `mergeCatalog`; compares by the same key rule), so all
  three write paths — including the PUT that never calls `mergeCatalog` — share one detector.
- Write paths (append AFTER the successful save, best-effort, never failing the write):
  - `src/app/api/projects/[id]/catalog/import/route.ts:84-92` (`current` read at `:84`, save `:92`).
  - `src/lib/inventory/sync.ts:157-169` (`current` `:157`, save `:168`; copy the lazy-import side-effect
    shape at `:209-212`).
  - `src/app/api/projects/[id]/catalog/route.ts:10-27` — PUT reads NOTHING today; add
    `const current = (await listOfferings(uid, id)) ?? []` before `saveOfferings`.
  - `actor` per path: `"feed-import" | "warehouse-sync" | "manual"` (+ `provider` id for sync).
- Store trio to copy: `src/lib/leads/store.ts` (row-based dispatcher, lazy backend import),
  `store.local.ts:11-30` parse helpers, `store.firestore.ts` one-doc-per-row subcollection. Catalog is
  Family B (per user+project) — `delete-cascade.ts:45-51,77` — so the ledger key is `(userId, projectId)`
  like `project_catalog` (`db.ts:97-106`).
- Activity: keep the existing `emitProjectActivity` calls; enrich `detail` from the event list
  (e.g. `+3 · 5 změn ceny · 1 vyřazeno`) only where the call already exists (import `:93-100`, PUT `:20-27`).
- UI: `src/app/app/[projectId]/katalog/page.tsx` (35 LOC) renders `<CatalogManagerModule>`; mount a new
  `<CatalogLedgerSection>` under it via `next/dynamic` + `SectionSkeleton`. Model the list on
  `src/components/app/modules/ActivityModule.tsx` (kind filter; no CSV). Empty state is honest ("no events
  yet — they appear after the next import / sync / save"); NO sample data.
- Read API: `GET src/app/api/projects/[id]/catalog/events/route.ts` (`requireOwnedProject`, `?limit=`, `?key=`).
- Test harness: `test-unit/campaigns-local-store.test.mjs:1-30` (temp db keyed by pid + `SYSTEDO_DB_FILE` +
  `LOCAL_DB=true` set BEFORE the dynamic import). Do NOT copy `catalog-persistence.test.mjs` (it writes the
  shared `.data/systedo.db`).

## Data contract
```ts
// src/lib/catalog/events.ts
export type CatalogEventKind = "added" | "removed" | "price" | "stock" | "active" | "margin" | "renamed";
export type CatalogEventActor = "feed-import" | "warehouse-sync" | "manual";
export interface CatalogEvent {
  id: string;            // `${at}_${key}_${kind}` — idempotent re-append
  at: string;            // ISO
  key: string;           // sku || id
  name: string;          // offering name at event time
  kind: CatalogEventKind;
  before?: number | string | boolean | null;
  after?: number | string | boolean | null;
  actor: CatalogEventActor;
  provider?: string;     // warehouse provider id when actor = warehouse-sync
}
export const CATALOG_EVENT_CAP = 2000;
```
Rules: `stock` only when `|delta| ≥ 1`; `price`/`margin` when changed by ≥ 0.005 (float guard); `renamed`
when `name` differs; `added`/`removed` never also emit field events for the same key in the same batch.
Cap: keep the newest `CATALOG_EVENT_CAP` rows per project (evict oldest on append, as `lead_activities`).
Store API (dispatcher `src/lib/catalog/events-store.ts` + `.local` + `.firestore`):
`appendCatalogEvents(userId, projectId, events)`, `listCatalogEvents(userId, projectId, { limit = 200, key? })`
(NEWEST FIRST), `clearCatalogEvents(userId, projectId)`.

Sqlite (seam request, migration **v25** — next after `db.ts:922-927`):
```sql
CREATE TABLE IF NOT EXISTS catalog_events (
  user_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL,
  at TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id, id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_events_at ON catalog_events (user_id, project_id, at);
```
Firestore: `users/{uid}/projectCatalogs/{projectId}/events/{id}`.

To run your local-store test you may apply the DDL + v25 entry in `src/lib/db.ts` and bump
`test-unit/db-migrations.test.mjs:10` LATEST — but list BOTH files under "seam requests", not under
"files modified"; the Director lands them in the seams commit (another builder's migration may be v25 first).

## Invariants
- ADR-0001 both backends behind one dispatcher; ADR-0002 key is `(uid, projectId)` from `requireOwnedProject`,
  never from the body. Ledger append is best-effort AFTER the save (a ledger failure must not fail an import).
- Cache Components: no `export const dynamic`; the route handlers are plain handlers.

## Build steps
1. `events.ts` pure detector + `test-unit/catalog-events.test.mjs` (added/removed/price/stock/active/margin/
   renamed; float guard; no double-emit; stable ids).
2. Store trio + `test-unit/catalog-events-local-store.test.mjs` (append idempotent, newest-first, `key` filter,
   cap eviction, clear).
3. Hook the three write paths; extend `test-unit/catalog-sync.test.mjs`-shaped fixture so `runCatalogSync`
   with `apply: true` appends the expected events (mock the events store like that test mocks the others).
4. Read route + `src/components/app/modules/catalog/CatalogLedgerSection.tsx` (≤200 LOC, `T` dict cs/en,
   `stagger`, primitives) mounted in `katalog/page.tsx`.
5. LF-normalize touched files; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/catalog src/lib/inventory/sync.ts "src/app/api/projects/[id]/catalog" src/components/app/modules/catalog` ·
`npm run test:unit` (all `catalog-*` suites green).

## Acceptance
- ≥12 assertions across the new tests; each of the three write paths covered by ≥1 assertion.
- `grep -rn "appendCatalogEvents" src/app/api/projects src/lib/inventory/sync.ts` → exactly 3 call sites.

## Hotspot requests (report as seam requests — verbatim inserts + anchors)
- `src/lib/db.ts` DDL (after `lead_activities`, `:305-319`) + `MIGRATIONS` v25 after `:922-927`;
  `test-unit/db-migrations.test.mjs:10` LATEST; the "28-table" comments at `db.ts:563` and `:1078-1080`
  (report the true table count).
- `src/lib/projects/delete-cascade.ts:77` — `{ name: "catalog-events", delete: (p, u) => clearCatalogEvents(u, p) }`.
- `duplicate-cascade.ts:17-24` exclusion comment line.
- `context-map.json` mapping for the new files (Director).

## Rollback
Revert; table inert; Firestore subcollection orphaned but harmless (cascade removes it on project delete).
