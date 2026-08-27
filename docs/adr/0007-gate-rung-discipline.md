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
