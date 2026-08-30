# ADR-0008 — Node built-ins and repo-local scripts before a dependency

## Status

Accepted (in force since the first tooling script)

## Context

The runtime dependency list is eleven packages. The dev list is thirteen. That is
unusual for a Next.js app of this size, and it is a choice rather than an
accident.

`SECURITY.md` states the stake: this repo holds live advertising credentials, so
"someone else's code runs in our build" is a real threat and not a hypothetical.
Every added package is also a Dependabot PR stream, a transitive advisory
surface, and a thing an agent has to learn before it can change the file.

## Decision

Reach for a Node built-in or a repo-local script first, and take a dependency
only when the built-in genuinely cannot do the job. In practice:

- **Storage** — `node:sqlite` (Node ≥ 22.5) instead of `better-sqlite3`. No
  native build step, and it is what pins the container base image (ADR-0005).
- **Tests** — `node:test` for the ~300 unit suites, no Jest and no Vitest.
- **Tooling** — everything in `scripts/` is a zero-dependency `.mjs` module. The
  secret scanner, the seed drift guard, the i18n audit, the LLM gate, the SAST
  rules and the agent review all run on a bare `node`, which is why they also run
  in a container, in a pre-commit hook, and in a checkout with no
  `node_modules` installed.
- **Diffing / fingerprinting** — `scripts/lib/` holds the shared primitives
  (`scripts/lib/fingerprint.mjs`, `scripts/lib/diff-lines.mjs`) rather than a
  diff package.

The rule has an explicit exception for things where a dependency is clearly the
lower risk: the framework itself, the auth library, the provider SDKs, the
browser automation.

## Consequences

- CI installs fast and `npm audit` has a small surface to report on.
- The gate scripts are readable end to end, which matters because an agent
  changing a gate has to understand it in one file.
- The cost is written code: a hand-rolled line differ and a hand-rolled secret
  scanner exist that a package would have provided. Both are small, both are
  unit-tested (`test-unit/diff-lines.test.mjs`), and both encode rules this repo
  cares about rather than a vendor's defaults.
- Where a vendor's rules are genuinely better, the repo runs the vendor tool
  *alongside* the local one rather than instead of it: `gitleaks` in CI backs the
  local secret scanner, and Semgrep's registry packs back `scripts/sast.mjs`.

## Consequences observed

_Read back 2026-08-30 against the tree, not against intentions._

- **The count in the Context section is already out of date, and that is the
  finding.** The dev list is still thirteen; the runtime list is twelve, not the
  eleven recorded here, and the twelfth entry is a types-only package sitting in
  `dependencies`. Nothing was wrong with the addition — what it shows is that
  "the list is small" is a claim nobody re-measures, which is why rubric A4
  blocks a new runtime dependency without an `Ack:` line rather than trusting the
  sentence.
- **Zero-dependency tooling paid off in the place it was not argued for.** The
  reason given here was supply chain and install time. The return actually
  collected is that every gate runs in a checkout with no `node_modules` — which
  is what lets an offline agent session, a pre-commit hook and a container all
  run the same gate. The strongest argument for this decision is one it did not
  make.
- **The written code is holding, and the sharing is thinner than the record
  implies.** No script in `scripts/` has been replaced by a package since. But
  `scripts/lib/` holds four modules and the two named here
  (`scripts/lib/fingerprint.mjs`, `scripts/lib/diff-lines.mjs`) have exactly one
  caller between them — `scripts/llm-eval.mjs` — plus a unit test. They are
  extracted primitives, not yet shared ones. The "cost is written code" line has
  not compounded, and neither has the reuse that would justify the extraction.
