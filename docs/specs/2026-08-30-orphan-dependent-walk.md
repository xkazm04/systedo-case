# Spec — dependent-side orphan walk (Wave 3, item 6)

registry: `software-engineering/entity-lifecycle/orphan-reconciliation`
date: 2026-08-30 · status: approved for implementation (Wave-3 brief)

## Current state

The reconciliation machinery walks only the **authoritative** side:

- `src/lib/projects/orphan-sweep.ts` builds its candidates from the durable ledger
  (`orphan-ledger.ts`, scope `__system_orphans`) plus operator-supplied ids
  (`OrphanSweepOptions.projectIds`, orphan-sweep.ts:79-86). Its own comment admits the
  pre-ledger path relies on "an operator [who] knows the id from an old audit record".
- No code enumerates a dependent store and asks whether its owner still exists. Per the
  technique's Direction rule, a sweep pointed parent-first **cannot find an orphan**: an
  orphan whose failed delete predates the ledger *and* whose id nobody kept is invisible
  forever. The registry's own application note (`node--orphan-reconciliation.md`,
  "Where the technique's edges show") records exactly this gap.

## Target shape

A dependent-side walk, `src/lib/projects/orphan-walk.ts`, mirroring the repo's backend
dispatcher convention (`orphan-walk.local.ts` / `orphan-walk.firestore.ts`, lazily
imported on `LOCAL_DB`):

`walkDependentStores(userId, { apply? })` →
`{ applied, checked, findings, orphanCount, ranAt, sweep? }` where a finding is
`{ projectId, status: "alive" | "orphaned", seenIn: string[], ownerUserIds: string[], residue?: string[] }`.

### Enumeration is storage-truth-derived, not a second hand list

- **LOCAL_DB (sqlite)**: introspect `sqlite_master` + `pragma_table_info` for every
  table with a `project_id` column (excluding `projects` itself) → `SELECT DISTINCT
  project_id` (+ `user_id` where the table has one); plus every table with a `tenant`
  column (`campaign_docs`, `tenant_docs`, `microsites` today) parsed via the
  `buildTenantKey` shape `u_{uid}_proj_{pid}[_{suffix}]` (pid never contains `_`).
  A NEW table with a `project_id` or `tenant` column is walked automatically — the
  walk sees the schema, so it also catches stores nobody registered in
  `PROJECT_STORE_DELETERS` (that is the point of walking the dependent side).
- **Firestore (cloud)**: session-scoped by the same doctrine as the orphans route
  ("acts as exactly one user"): `users/{uid}/projectState` doc ids
  (`{projectId}__{key}`), `tenants` doc refs with id prefix `u_{safeUid}_proj_`
  (via `listDocuments()`, which includes missing ancestor docs that still have
  subcollections), and `microsites` rows via a `tenant` prefix range query.
  **Documented limitation**: cloud Family-A root collections (docs keyed only by
  projectId, e.g. `twinArchives`) are not enumerable per-user without a cross-tenant
  scan, so the cloud walk covers the user-attributable namespaces only.

### Candidate discipline (technique checklist)

- Skip demo ids (`isDemoProjectId`), reserved pseudo-scopes (ids starting `__`, i.e.
  `ORPHAN_LEDGER_SCOPE`), and empty ids.
- **Existence-checked**: LOCAL uses an ownerless `SELECT 1 FROM projects WHERE id = ?`
  (Family-A sightings carry no user, and `projects.id` is a global primary key);
  cloud uses `getProject(userId, id)` — every cloud sighting is attributed to the
  session user by construction. Alive → reported, never touched.
- **Report-first**: default invocation deletes nothing. `apply: true` is the only
  destructive mode.
- **Apply reuses the existing machinery**: orphaned ids are handed to
  `sweepProjectOrphans(userId, { projectIds, apply: true })` — the exact
  registry-derived cleanup path (existence re-check, `runProjectCleanup`, ledger
  recording of failures). No second delete path exists.
- **Residue is honest**: after apply, the walk re-enumerates each cleaned candidate;
  sightings that survive (a project-keyed table no registry unit deletes, or another
  user's Family-B rows locally) are reported as `residue` — the walk's witness that
  the deleter registry has a gap, not silently converged over.
- **Idempotent**: report mode touches nothing; a second apply finds no sightings
  (or the same stable residue) and deletes nothing further.

### Surface

`src/app/api/projects/orphans/walk/route.ts` — GET = report, POST = apply, session
authenticated, same doctrine header as the existing orphans route. The existing route
is untouched.

## Out of scope

- Cloud enumeration of Family-A root collections (cross-tenant scan) — recorded
  limitation, revisit if a cloud orphan of that class is ever observed.
- Per-user fan-out in apply mode: cleanup runs as the session user only; local rows
  attributed to another user surface in `ownerUserIds`/`residue` for a re-run as that
  user.
- Any change to `PROJECT_STORE_DELETERS`, the ledger shape, or the existing sweep.
- UI.

## Acceptance checks (test-unit/project-orphan-walk.test.mjs, LOCAL_DB harness)

1. A pre-ledger orphan (project row deleted with NO cascade and NO ledger entry) is
   found by the walk with correct `seenIn`, while the ledger stays empty — the exact
   case the parent-first sweep cannot see.
2. An alive project's data is reported `alive` and never deleted.
3. Demo ids and `__system_orphans` project_state rows are never candidates.
4. Report mode removes nothing (data still present after the walk).
5. Apply removes the orphan's data via the registry path; a second walk reports clean;
   a second apply is a no-op.
6. A project-keyed table OUTSIDE the deleter registry is still enumerated, and after
   apply its sighting surfaces as `residue`.
