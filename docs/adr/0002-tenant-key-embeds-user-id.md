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
