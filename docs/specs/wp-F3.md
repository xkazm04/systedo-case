# WP F3 — Microsite registry: dual-store twin + `kind`
cards #12, #15 (prerequisite) · M · gate: contract (new sqlite table) · wave 0

## Goal
`getMicrosite`, `getMicrositeForTenant`, `enableMicrosite`, `disableMicrosite` work under
`LOCAL_DB=true` (a `next dev:local` tenant can publish `/m/{slug}`), every config carries
`kind: "performance"` (default on read for legacy docs), and the Firestore path is byte-identical.

## Non-goals
- No local-landing or LP rendering (W2-C, W3-B). `kind` values other than `"performance"` are
  accepted by the type and REFUSED by `enableMicrosite` for now (`MicrositeSlugError("invalid-kind")`
  is fine — add the code to the union).
- `resolveMicrositeView`, `buildMicrositeView`, `syncedDataset` — no logic change; move them
  unchanged if you split files.
- No change to `/m/[slug]/page.tsx`.

## Seams
- `src/lib/microsite.ts:16,68-70,85-101,128-160,173` — `firestore.collection("microsites")` global
  registry keyed by slug (NOT per-tenant, so `tenantDocs()` is the wrong seam — it is per-tenant).
- Pattern to copy: `src/lib/report-metrics/{store,store.local,store.firestore}.ts` (dispatcher with lazy
  backend import; sqlite blob table). Copy that shape as `src/lib/microsite/{store,store.local,store.firestore}.ts`
  exposing `getBySlug(slug)`, `getByTenant(tenant)`, `upsert(cfg)`, `setEnabled(slug, enabled)`.
- `src/lib/microsite.ts` keeps its public API; its internals call the store. Keep the file name (many
  importers: grep `@/lib/microsite"` and list them in the report; do not rename).
- `src/lib/db.ts` — new table + append-only migration (`MIGRATIONS`, next version; read the header at
  `db.ts:49` and the last entry to match the exact shape, and `MIGRATION_VERSIONS` test expectations):
  ```sql
  CREATE TABLE IF NOT EXISTS microsites (
    slug       TEXT PRIMARY KEY,
    tenant     TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_microsites_tenant ON microsites (tenant);
  ```
- Delete cascade: `src/lib/projects/delete-cascade.ts:55-79` — check whether microsites are already a
  deleter (grep `microsite`). If not, do NOT add one here; write it as a seam request.
- Tests: `test-unit/microsite-view.test.mjs`, `microsite-view-firestore.test.mjs`, `microsite-identity.test.mjs`
  — keep green; add `microsite-local-store.test.mjs` (enable → getBySlug/getByTenant → disable; slug
  ownership refused across tenants; demo slug reserved) under LOCAL_DB using the same harness the
  other `*-local-store` tests use.

## Data contract
```ts
export type MicrositeKind = "performance" | "local-landing" | "lp";
export interface MicrositeConfig { …existing…; kind?: MicrositeKind } // absent → "performance" on read
```
Firestore: same `microsites/{slug}` docs; `kind` written on every new upsert. Sqlite: `data` = JSON of the
config; `tenant` column duplicated for the by-tenant query.

## Invariants
- ADR-0001: both backends behind one dispatcher; the sqlite migration is append-only and the
  `MIGRATION_VERSIONS` contiguity test passes.
- ADR-0002: slug ownership pinned to tenant is enforced in `enableMicrosite` (existing) — the store
  must not bypass it (store has no ownership logic; `enableMicrosite` reads-then-writes as today).
- The ownership read "must not swallow errors" (existing comment at `microsite.ts:145-147`) — preserve.

## Build steps
1. `db.ts` table + migration; run the migration test.
2. Store trio; `microsite.ts` internals → store; `kind` default-on-read in ONE place (`normalizeConfig`).
3. Local store test; keep Firestore tests green.
4. Gates; report the importer list and the cascade seam request.

## Gates
`npx tsc --noEmit` · `npm run test:unit` · `npx eslint src/lib/microsite.ts src/lib/microsite/*.ts src/lib/db.ts`.

## Acceptance
- `grep -c firestore src/lib/microsite.ts` → 0.
- Local store test: 5+ assertions green under LOCAL_DB.
- `MIGRATION_VERSIONS` test green with one new version.

## Hotspot requests
- `db.ts` migration: OWNED by this WP this wave (serial), edit directly.
- Delete-cascade deleter for microsites: seam request only (report the exact lines).

## Rollback
Revert; the sqlite table is inert; Firestore docs with `kind` read fine on the old code (unknown key).
