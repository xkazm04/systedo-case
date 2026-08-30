# ADR-0007 — A check is blocking only if it passes today

## Status

Accepted (in force across CI; named here because it is applied, not documented)

## Context

This repo runs a lot of checks: typecheck, lint, build, a seed drift guard, ~300
unit suites, an LLM contract gate, a key-free E2E lane, a secret scan, a
dependency audit, an i18n audit, static application security rules, and an agent
diff review. Most commits are written by an agent and triaged by one human
weekly, so a check's exit code is very often the *only* thing that reads it.

The failure mode is well known and was hit here before it was named: a check is
switched on as blocking while it still has pre-existing findings, every run is
red, and within a week people are skipping the gate rather than reading it. The
check has then made things worse than having no check.

## Decision

Every automated check sits on exactly one of two rungs, and the rung is chosen by
**measurement, not preference**:

- **Blocking** — the check passes on the tree today. Red means a regression that
  this change introduced. `check:ci`, the secret scan, the LLM gate, the SAST
  rules, and the hard half of the agent review are here.
- **Reporting, with a ratchet** — the check does not pass today. It runs, it
  prints, it writes a job summary, and it exits 0. What it *does* enforce is a
  baseline count committed in the repo: `--check` fails when a count rises above
  it. `npm run i18n:audit` (baseline in `scripts/i18n-audit.mjs`), `npm audit`,
  and the context-map coverage count are here.

Two rules keep the rungs honest:

1. **Fix findings and lower the baseline in the same commit. Never raise it.**
2. **Promote to blocking when — and only when — a clean run is the steady
   state.** Every reporting-rung step carries a comment saying what would have
   to be true to promote it, so the rung is a stated position rather than
   neglect.

Nothing is allowed to sit on a third rung of "runs, prints, and nobody can tell
whether it got worse". A check with neither an exit code nor a baseline is
decoration.

## Consequences

- Red CI means something. That is the whole return on this decision, and it is
  what lets an agent land a change without a human reading the output.
- Some real problems are known and not blocked — 40 i18n coverage gaps, transitive
  advisories, 159 source files outside `context-map.json`. They are visible with a
  number attached, which is a different thing from being ignored.
- Baselines are a ratchet, so they encode debt. A baseline that has not moved in
  months is itself a finding.
- New checks land on the reporting rung by default and earn their way up. That is
  why the first version of a gate is cheap to add and hard to weaponise.

## Consequences observed

_Read back 2026-08-30 against the tree, not against intentions._

- **A third rung appeared anyway, and it is not the one this ADR banned.** It
  banned "runs, prints, and nobody can tell whether it got worse". What exists
  instead is *green by exemption*: `scripts/actions-pin.mjs` carries
  `STRICT = false` and a pinned floor of 0, so the line it prints is "0 of N
  pinned" and the gate passes. Every rule in that file blocks except the one the
  file is named after. A ratchet at zero is a rung this record did not
  anticipate, because it satisfies rule 1 (never raised) while enforcing
  nothing.
- **"Never raise a baseline" has a legitimate exception, and it was taken three
  times without being written down here.** `scripts/quality-gate.mjs` raised
  `unbaked` from 6 to 9 as `local-page`, `lp-variant-draft` and their siblings
  landed: a new AI tool ships with its contract golden and is measured on the
  next full quality bake, so the count rises for a reason that is not debt. The
  rule as stated ("never raise it") is therefore not the rule being followed. The
  honest version is: never raise a baseline for a finding you could have fixed —
  and say, in the baseline's own comment, what will lower it again.
- **Rung discipline made the rungs legible to agents, which is the return that
  showed up.** The gate scripts written since state their rung in their own
  header — `scripts/quality-gate.mjs`, `scripts/actions-pin.mjs` and
  `scripts/i18n-audit.mjs` each say which of the two they are and what would
  promote them — so an agent reading a red run can tell whether it broke
  something or inherited it. That was not a predicted consequence; it is the one
  most visible in day-to-day use.
