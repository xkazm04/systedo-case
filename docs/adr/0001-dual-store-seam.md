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

## Consequences

- `npm run dev:local` gives a fully offline `/app` from a clean checkout, with no
  Google and no Firebase credentials. That is also what the key-free E2E lane in
  CI runs against.
- **Adding a table to `src/lib/db.ts`'s `SCHEMA` is not enough.** `SCHEMA` builds
  *fresh* databases; every pre-existing database is stamped and never re-runs it,
  so a table added only to `SCHEMA` is invisible to any existing install. Every
  new table also needs an append-only migration entry. `test-unit/db-migrations.test.mjs`
  pins this by diffing a fresh-migrated database against a v1-era database
  carried forward through the migrations.
- A new store means writing the twin. A domain that ships Firestore-only quietly
  removes a module from offline dev, which is how twelve modules ended up
  Firestore-only before the 2026-07-16 sweep caught them.
- The seam is what made self-hosting cheap: promoting sqlite to a production
  store was a mode flag, not a port.
