# ADR-0004 — `SELF_HOSTED` is a third deploy mode, not a loosened dev guard

## Status

Accepted (2026-08; design in `docs/open-source/self-hosting.md` §1)

## Context

The repo is AGPL and people should be able to run it themselves. Everything a
self-hosted install needs already existed — the sqlite store (ADR-0001), a
keyless local model path, per-user model keys — but all of it was reachable only
through guards written as `NODE_ENV !== "production"`.

The tempting change was to loosen those expressions. It is also the dangerous
one: the *same* expressions guard `DEV_AUTH`, which bypasses login entirely.
Loosening the family to unlock the sqlite store would risk re-opening a login
bypass in production, and that class of mistake is not recoverable by a later
patch — someone's install is already on the internet.

## Decision

Add a **third mode**. `src/lib/deploy-mode.ts` is framework-free and importless,
and exposes `deployMode()` returning `"cloud" | "self-hosted" | "dev"`.
`SELF_HOSTED=true` is an explicit operator decision that is honoured in
production, and each consumer opts in at its own seam by adding `|| SELF_HOSTED`
rather than by relaxing a shared predicate. So:

- it legalises `LOCAL_DB` in a production build (`src/lib/local-mode.ts`);
- it selects the operator-password Credentials flow in `src/auth.ts`;
- it unmeters the install, because the metering is cost control on the
  operator's own provider bill and a self-hoster pays that bill themselves;
- it does **not** enable `DEV_AUTH`, which stays dev-only, forever.

It fails closed at boot. `selfHostBootError()` refuses to start a production
self-hosted build with no `ADAMANT_OPERATOR_PASSWORD` unless the operator sets
`ALLOW_OPEN=1`. "I put it on the internet with no password" has to be a
decision, never an accident.

## Consequences

- Three modes to reason about instead of two, and every new guard has to decide
  which of the three it belongs to. That cost is deliberate.
- `SELF_HOSTED` is now part of the security contract. `SECURITY.md` documents
  the configuration states an operator owns — unset secrets, the fail-open AI
  ceiling, `TRUSTED_PROXY` — precisely because those are the ones the app cannot
  decide for them.
- The container image (ADR-0005) *is* a self-hosted deployment: it sets
  `SELF_HOSTED=true` and `LOCAL_DB=true` in the runtime stage, so the mode is
  exercised by the packaging rather than only described.
- The unmetering is per-mode, which is why the pure half of the decision takes
  the deploy env as an argument (`src/lib/plans.ts`) rather than reading
  `process.env` directly — that is what makes the mode testable without setting
  globals (`test-unit/self-host-unmeter.test.mjs`). `src/lib/usage.ts` composes
  it with `LOCAL_DB` at the store seam.
