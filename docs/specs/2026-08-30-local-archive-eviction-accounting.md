# Spec — durable eviction accounting for the LOCAL twin-archive backend (Wave-1 residual)

registry: `software-engineering/entity-lifecycle/change-logging` (accounting shape),
`one-authority-per-vocabulary` (backend parity)
date: 2026-08-30 · status: approved for implementation (Wave-3 brief)

## Current state

- `src/lib/twin/archive-store.local.ts:45-58` — the sqlite backend's cap eviction
  deletes audit records with only a `console.warn`. A deleted audit record cannot
  testify for itself, and a log line is not durable.
- The Firestore twin got durable accounting in commit `10693e1e`
  (`archive-store.firestore.ts`): the same batch that deletes writes a per-project
  tally doc `twinArchiveEvictions/{projectId}` with fields
  `{ projectId, cap, totalEvicted (increment), lastEvictedAt, lastBatch: [{id, archivedAt}] }`.
- The two backends' accounting shapes therefore diverge: one durable, one a warn.

## Target shape

The LOCAL backend records the SAME fields, atomically with the delete:

- **New table** `twin_archive_evictions` (migration v30, plus the base `SCHEMA` block —
  db.ts's contract requires any new table in both places):

  ```sql
  CREATE TABLE IF NOT EXISTS twin_archive_evictions (
    project_id      TEXT PRIMARY KEY,
    cap             INTEGER NOT NULL,
    total_evicted   INTEGER NOT NULL,
    last_evicted_at TEXT NOT NULL,
    last_batch      TEXT NOT NULL   -- JSON [{id, archivedAt}], the last run's victims
  );
  ```

- `archive-store.local.ts` eviction block: select the overflow rows' `(id,
  archived_at)` first, then inside `BEGIN IMMEDIATE … COMMIT` (the
  `diagnoses/store.local.ts` pattern — the sqlite counterpart of the Firestore batch)
  delete them and upsert the tally (`total_evicted = total_evicted + n`). The
  `console.warn` stays — the durable record is in addition, exactly like the twin.
- **Parity witness**: both backends expose `readEvictionAccounting(projectId)` →
  `{ projectId, cap, totalEvicted, lastEvictedAt, lastBatch } | null`, surfaced
  through the `archive-store.ts` dispatcher, so the accounting vocabulary has one
  authority (`src/lib/twin/archive.ts` types) and a test can assert it.

## Out of scope

- No UI, no route; the reader is a support/test surface.
- No backfill of past evictions (unknowable), no change to cap or eviction order.
- No cascade registry entry: the tally is per-project accounting of DELETED audit
  records; `clearArchive` (untrain / project delete) wipes the archive, and the tally
  row is dropped with it via the same `clearArchive` (a deleted project keeps no
  eviction history — the orphan walk/cascade would otherwise report it forever).

## Acceptance checks (extend test-unit/twin-archive-store.test.mjs)

1. Under the cap → no accounting row (`readEvictionAccounting` null).
2. Overflow eviction writes the row: `totalEvicted` equals the evicted count, `cap` is
   `TWIN_ARCHIVE_CAP`, `lastBatch` names exactly the evicted ids (the OLDEST), each
   with its `archivedAt`.
3. A second overflow INCREMENTS `totalEvicted` and replaces `lastBatch`/`lastEvictedAt`.
4. `clearArchive` drops the project's tally row with its archive.
5. Migration contract: fresh-schema and migrated dbs agree on the new table
   (db-migrations.test.mjs table list gains `twin_archive_evictions`).
