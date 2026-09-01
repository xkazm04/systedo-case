# ADR-0002 — The tenant key embeds the user id

## Status

Accepted (per-project boundary since 2026-06-20; superseded the earlier
per-user-only key)

## Context

Adamant holds live advertising credentials and the account data pulled through
them. The classic failure in a multi-tenant product is IDOR: a handler reads an
id off the wire, forgets to check ownership, and returns another tenant's data.
Ownership checks are the standard answer, and they fail the standard way — the
one handler that forgets is the vulnerability.

## Decision

**The tenant key is derived, never accepted.** `buildTenantKey()` in
`src/lib/campaigns/store-keys.ts` is the single source of truth and composes
`u_{userId}_proj_{projectId}` (optionally suffixed per ad account) from the
*session's* user id. It is pure and framework-free so the keying rules are unit
tested without touching Firestore, and every component is passed through
`safeKeyComponent()` so a `/` in an id cannot break out of a Firestore document
path into a nested collection.

Guessing another user's id therefore buys nothing: reading their data would
require forging a session, not knowing an id.

The residual risk is the *other* direction, and it is why
`src/lib/projects/api-guard.ts` exists. An unverified `projectId` on the wire
does not fail — it silently mints a **fresh empty tenant**, which reads as "no
data yet" and leaves an orphan the delete cascade can never reach. So handlers
that take a project id call `rejectUnknownProject()` / `requireOwnedProject()`
*before* composing a key.

## Consequences

- Cross-user IDOR is structural, not checked. A new handler cannot leak another
  tenant by omission.
- The failure mode a new handler *can* hit is the phantom tenant, and it is
  quiet. That is what the route-guard rule in `scripts/sast.mjs` blocks: a new
  route under `src/app/api/` must reference a guard helper or be listed, with a
  written reason, in `.github/security/sast-allowlist.json`. Two routes are
  listed today.
- Changing the key format is a data migration, not a refactor — existing
  documents are addressed by it. `SKLIK_TENANT_SUFFIX` is the worked example of
  extending the key without orphaning history.

## Revisit when

- **A legitimate read has to cross users.** An agency seat, a shared workspace or
  an org-level report needs rows this key makes unaddressable without a second
  index. That is the price of structural isolation, and the day it is charged is
  the day this shape is a decision again rather than a free win.
- **A handler composes a key from an id it did not verify.** The residual risk is
  a minted empty tenant, not a leak; `src/lib/projects/api-guard.ts` is the guard,
  and a route reaching `buildTenantKey()` without it means the seam has stopped
  being the only way in.
- **A component of the key stops being an opaque id.** `safeKeyComponent()` makes
  a `/` harmless; a key that starts carrying user-supplied text needs the argument
  made again, not extended.

## Consequences observed

_Read back 2026-08-30 against the tree, not against intentions._

- **The migration this ADR feared was avoided rather than paid.** ADR-0010
  (2026-08) had to make a project read across several ad accounts — exactly the
  change that "changing the key format is a data migration" predicts as
  expensive. The answer was to keep the key per-account, tag the sources, and
  blend on read. The prediction held; the way out was to stop treating the key as
  the place to express a new relation.
- **The exception list is the number that moved.** This record says "two routes
  are listed today" in `.github/security/sast-allowlist.json`; there are five
  now, and four of them are deliberately anonymous machine endpoints (a feed
  puller, a webhook, a pre-sign-in scan claim) rather than handlers that forgot a
  guard. The structural claim is intact; what grew is the class of route the rule
  was not written for. The count is therefore the wrong thing to watch — whether
  each entry still states a reason is the right one.
- `buildTenantKey()` in `src/lib/campaigns/store-keys.ts` is still the single
  spelling, and both drivers still call it (ADR-0001's invariant table).
