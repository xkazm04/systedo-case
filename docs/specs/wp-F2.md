# WP F2 — Control plane offline: change-sets, alerts, mutations audit on the tenant-docs seam
cards #1, #3 (prerequisite) · L → this WP is M · gate: contract (persisted paths unchanged) · wave 0

## Goal
Under `LOCAL_DB=true`, `createChangeSet` → `approveChangeSet` → `revertChangeSet`, `recordAlert` →
`resolveAlert`, and the mutation audit append/read all work against sqlite; under Firestore every
collection path, query and transaction semantic is **byte-identical** to today. Zero behaviour change.

## Non-goals
- No new features, no new fields, no change to `control-plane-types.ts`.
- No change to what the Google mutations DO (`pauseCampaign` etc. in `google/ads.ts` untouched).
- Do not touch `src/lib/campaigns/store/backend.ts` (the campaign-data seam) — this WP uses the
  GENERIC per-tenant document seam `src/lib/tenant-docs/backend.ts` (`tenantDocs()`), which already
  has `getDoc/setDoc/addDoc/listDocs/queryEq/batchSet/compareAndSet` and a sqlite twin (`tenant_docs`).

## Seams
- `src/lib/campaigns/control-plane.ts:8,34-35,111,117,126,159-163,266,316-320,378` — every
  `firestore.collection("tenants").doc(tenant).collection("changeSets")` use and both
  `firestore.runTransaction` claims.
- `src/lib/campaigns/alerts.ts:70-71,84,96,106-107,126-127,137,144,150-152` — `alerts` collection;
  two transactions (status claim), one batch (mark all read), one `where("read","==",false)`.
  Lines 162 and 184 read `users/{userId}` and the tenant root — leave those as they are if they are
  not under `tenants/{tenant}/alerts`; note it in the report.
- `src/lib/campaigns/mutations.ts:102,139,222,247,301,343-346` — `mutations` audit appends + the
  restore read.
- `src/lib/tenant-docs/backend.ts:44-88` — the interface. `queryEq` takes a `string` value; `alerts`
  needs `read == false`. Do NOT widen the backend contract: implement the unread query as
  `listDocs(tenant,"alerts",{orderBy:{field:"createdAt",dir:"desc"},limit:200})` + filter, and say so in
  a comment (bounded; the inbox is capped anyway).
- Claim transactions → `compareAndSet(tenant, col, id, { field:"status", equals: <fromStatus> }, patch)`.
  Read `planApproveClaim` / `planRevertClaim` in `control-plane-types.ts` to find the exact from/to
  statuses; the transaction today also READS the doc to build the patch — do `getDoc` first, compute the
  patch with the pure planner, then `compareAndSet`; on `false` re-read and return the current doc
  (the existing `NotClaimable` no-op semantics).
- Tests: `test-unit/campaigns-changeset-transitions.test.mjs`, `campaigns-control-plane-pauses.test.mjs`,
  `campaigns-alert-changeset-loop.test.mjs`, `campaigns-alert-suppression.test.mjs`,
  `tenant-docs-local-store.test.mjs` — read how they inject/mocks stores; extend, do not weaken.

## Data contract
Unchanged document shapes. Firestore paths unchanged (`tenants/{tenant}/changeSets|alerts|mutations`).
Sqlite: rows land in the existing `tenant_docs` table (migration v17) — **no `db.ts` change**.

## Invariants
- ADR-0001: the Firestore backend of `tenantDocs` reproduces the exact prior queries (its own doc says
  so); you are moving call sites onto it, not changing it. Ordering `createdAt desc` + `limit 20` must hold
  on both backends — add a test that inserts 3 change-sets locally and lists them in order.
- Atomicity of approve/revert claims is preserved by `compareAndSet` (one winner). Add a test: two
  concurrent `approveChangeSet` calls on the local store → exactly one applies.
- No behaviour change: the existing four test files must pass unmodified (except import paths).

## Build steps
1. `control-plane.ts` → `tenantDocs()`; keep function signatures. Local test for list order + claim race.
2. `alerts.ts` → `tenantDocs()`; unread filter via list+filter; local tests for record/resolve/mark-read.
3. `mutations.ts` audit append/read → `tenantDocs()`; keep `mutationAuditReadTenants` union read.
4. Remove `import { firestore }` from the three files if nothing else uses it (grep first).
5. `npx tsc --noEmit && npm run test:unit && npx eslint <files>`; report which Firestore paths you
   verified unchanged (list them).

## Gates
`npx tsc --noEmit` · `npm run test:unit` · `npx eslint src/lib/campaigns/{control-plane,alerts,mutations}.ts`.

## Acceptance
- `grep -n "firestore" src/lib/campaigns/{control-plane,alerts,mutations}.ts` → 0 hits (or only the
  `users/{userId}` read in alerts.ts:162 if it is outside the tenant tree — justify).
- New local tests: change-set lifecycle (create→approve→revert) and alert lifecycle pass under
  `LOCAL_DB=true`; claim race test proves one winner.
- Existing control-plane/alert tests unchanged and green.

## Hotspot requests
None. (`control-plane*.ts` is a hotspot owned by THIS WP this wave.)

## Rollback
Revert the commit; no persisted shape changed.
