# ADR-0001 — One store interface, two backends

## Status

Accepted (2026-06, seam in continuous use; extended by ADR-0004)

## Context

The hosted product persists to Firestore. That is the right store for a Vercel
serverless deployment, and it is also the reason a contributor could not run the
authenticated product at all: `/app` needed Google OAuth credentials *and* a
Firebase service account before it would render a single project.

Two obvious answers were both wrong for this repo:

- **Mock the store in dev.** A fake that only exists in development drifts from
  the real one, and the drift is discovered in production.
- **Run the Firestore emulator.** It works, but it is a Java process and a
  second thing to install, and it does not help the self-hosting story at all.

## Decision

Every persisted domain exposes **one interface module** that switches on
`LOCAL_DB` at import time, with the two backends beside it as siblings:

```
src/lib/campaigns/activity.ts            ← the interface every caller imports
src/lib/campaigns/activity.firestore.ts  ← cloud backend
src/lib/campaigns/activity.local.ts      ← node:sqlite backend
```

The same triple exists for projects (`src/lib/projects/store.ts`,
`src/lib/projects/store.firestore.ts`, `src/lib/projects/store.local.ts`) and
for every other store that grew a local twin.

The local backend is Node's **built-in** `node:sqlite` (see ADR-0008), so there
is no native build step and no extra dependency; the file lives at `.data/`
and is gitignored. `src/lib/local-mode.ts` owns the flag and is deliberately
framework-free and firebase-free, so importing it on the local path never pulls
`firebase-admin` into the bundle.

`LOCAL_DB` is **hard-gated off when `NODE_ENV=production`**, with exactly one
deliberate exception — an explicit self-hosted install (ADR-0004). A production
deployment therefore cannot silently redirect its data into an ephemeral file.

## The invariants both backends owe

The section above fixes the *mechanism*. It does not say what the two backends
must **mean the same thing by**, and a shared interface does not supply that: an
interface constrains shape, while an invariant is a claim about the states the
store can reach. Two drivers can satisfy the same signature and reach different
state sets — which is how an invariant ends up true in development and merely
likely in production.

So this is the list, kept above both drivers on purpose. It is short; a store
with thirty-odd tables has fewer than a dozen guarantees a caller actually leans
on. Everything not on it is a portability detail. Adding a constrained store
means adding a row here **before** writing the second backend.

| Invariant | Firestore expresses it as | sqlite expresses it as |
|---|---|---|
| The tenant key is *derived, never accepted* (ADR-0002) | `buildTenantKey()` in `src/lib/campaigns/store-keys.ts` — one spelling, both drivers call it | same function |
| At most one project-state row per (user, project, key), and a write may not clobber a concurrent one | `runTransaction` compare-and-swap | one-statement CAS (`UPDATE … AND data = ?`) |
| At most one catalog per (user, project) | the document path *is* the tuple | `ON CONFLICT (user_id, project_id)` |
| At most one cron claim per (tenant, kind, period), and periods advance monotonically | `runTransaction` + `isNewPeriod` | `ON CONFLICT … WHERE period < excluded.period` |
| At most one cache entry per key, and at most N per tool | derived doc id + capped eviction | `ON CONFLICT (cache_key)` + capped delete |
| One contact per (project, normalized email/phone); one lead event per (project, dedup key) | derived keys mirrored as fields | `PRIMARY KEY (project_id, …)` |
| A capped newest-first read returns the **same rows** on both drivers | explicit id tiebreak (implicit `__name__` otherwise) | explicit `, id DESC` tiebreak |
| A user's daily AI quota is never exceeded | `usage.consume()` transaction | **not expressed — see below** |

Three rules follow from the table, and they are the part that is easy to get
wrong:

1. **A derived key is a substitute for a constraint, and it is an *optional*
   guard.** Firestore has no uniqueness declaration, so uniqueness there is a
   property of the address space: the same tuple always addresses the same
   document. That protects the collection only against writers that route
   through the derivation. So a constrained collection gets exactly one writing
   function, and the derivation is unavoidable on the way in.
2. **The two mechanisms fail in opposite directions, and no caller may learn
   which it got.** A declarative constraint makes a duplicate write *fail*; a
   derived key makes it *succeed harmlessly*. Both preserve the invariant. The
   outcome vocabulary is therefore written for the invariant — *already
   recorded*, a `boolean`, a typed conflict error — never for one engine's error
   shape. A `SQLITE_CONSTRAINT` or a Firestore `code` reaching a caller has
   moved the invariant's interpretation into every call site.
3. **Ordering is an invariant, not a formatting preference.** A store with a
   monotonic rowid hands back a stable order for free; one without it returns
   ties in an undefined order. Any read that sorts on a timestamp and then
   *slices to a cap* selects a different set of rows on the two drivers unless
   the tiebreak is explicit and points the same way. `src/lib/twin/archive-store.firestore.ts`
   and `src/lib/ai/response-cache-store.firestore.ts` carry the worked example.

`src/lib/project-state/store.local.ts` and its Firestore sibling are the
reference pair: the invariant is named in the file header, both sides are
genuinely atomic, and the dispatcher converts both outcomes into one typed
error.

**The one invariant with no second implementation is the quota.**
`src/lib/usage.ts` short-circuits on `LOCAL_DB || selfHosted()` and returns
`{ ok: true }` without writing anything, so the metering invariant is enforced
on exactly one driver — and it is the one that cannot easily be in a test loop.
That is a deliberate availability trade (metering would throw on a missing
service account and drop AI generation to a template), not an oversight, but it
means every caller's `ok: false` branch is unreachable offline and in every
self-hosted install. Recorded here so the next person reads it as a known
asymmetry rather than discovering it from a bill.

## Consequences

- `npm run dev:local` gives a fully offline `/app` from a clean checkout, with no
  Google and no Firebase credentials. That is also what the key-free E2E lane in
  CI runs against.
- **Adding a table to `src/lib/db.ts`'s `SCHEMA` is not enough.** `SCHEMA` builds
  *fresh* databases; every pre-existing database is stamped and never re-runs it,
  so a table added only to `SCHEMA` is invisible to any existing install. Every
  new table — **and every new index and column** — also needs an append-only
  migration entry. `test-unit/db-migrations.test.mjs` pins this by diffing a
  fresh-migrated database against a v1-era database carried forward through the
  migrations. Until 2026-08-29 that diff compared table *names* only, and stayed
  green while `idx_projects_user` existed on fresh databases and on no migrated
  one; it now compares the table set, the index set, and each table's column set.
  Columns are compared **order-insensitively** on purpose: `ALTER ADD COLUMN` can
  only append while `SCHEMA` declares columns where they read best, so ordinal
  position forks permanently and unobservably.
- A new store means writing the twin. A domain that ships Firestore-only quietly
  removes a module from offline dev, which is how twelve modules ended up
  Firestore-only before the 2026-07-16 sweep caught them.
- The seam is what made self-hosting cheap: promoting sqlite to a production
  store was a mode flag, not a port.
