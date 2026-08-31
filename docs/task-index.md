# Which document answers this task?

This repository has a lot of documentation and it is kept honest — the bilingual
pair is held in step by `npm run docs:parity`, every ADR's cited paths are checked
by `npm run adr:check`, and the rubric and the required checks are enumerated
rather than remembered. What it did not have is the lookup that happens *first*:
**a reader — usually an agent, at the start of a run — knows the task and has to
guess the document.** Guessing costs a wrong assumption on a seam, or a
re-derivation of something already written down.

So this is the index, keyed by the task rather than by the audience. It is not a
summary of any of these documents and never restates their content: it routes,
and the destination is the source.

**Read [`AGENTS.md`](../AGENTS.md) first regardless.** It is canonical
(declared in [`.ai/manifest.yaml`](../.ai/manifest.yaml) under
`guidance.canonical`); this file is a routing table, not a second opinion. Where
the two disagree, `AGENTS.md` wins and this file is the bug.

Held live by `test-unit/docs-task-index.test.mjs`: every path below must exist,
every ADR must be routed to from the table at the bottom, and the entry points
must link here. That test runs inside `npm run test:unit` → `npm run check:ci` →
`.husky/pre-push`, so a document that moves or an ADR that lands without a route
is a red build, not a dead link somebody finds later.

## Starting a run

| The task | Open | What it settles |
|---|---|---|
| Orienting before any change | [`AGENTS.md`](../AGENTS.md) | The commands, the seams, the conventions that bite, and what you may do unattended |
| Finding which files a feature owns | [`context-map.json`](../context-map.json) | Every file's feature context; scope your edits to the relevant context's `file_paths`. An index, not an inventory |
| Picking up a run that was stopped | [`.agent/README.md`](../.agent/README.md) | Why checkpoints exist, the two hook blocks that make them involuntary, and how to read one. Run `npm run checkpoint` before you start |
| Working out what will stop your change | [`.github/required-checks.json`](../.github/required-checks.json) | Every check that must be green, each with the reason it earns a red build (ADR-0011) |
| Working out what a review will say about your diff | [`.github/agent-review-rubric.md`](../.github/agent-review-rubric.md) | Part A is mechanical and blocks; Part B is judgment and comments |
| Deciding whether a new check should block | [`docs/adr/0007-gate-rung-discipline.md`](adr/0007-gate-rung-discipline.md) | Blocking if it passes today; ratcheted reporting otherwise |

## Changing the product

| The task | Open | What it settles |
|---|---|---|
| Adding or changing an AI operation | [`AGENTS.md`](../AGENTS.md) § Conventions that bite, then [`test-llm/budget.json`](../test-llm/budget.json) | The `// llm-tool:` tag contract, the golden's provenance ledger, and the input-cost ceiling a new operation must record |
| Judging whether a model change made answers worse | [`docs/testing/llm-quality-matrix.md`](testing/llm-quality-matrix.md) | The LLM-as-judge benchmark, its cost, and the baked scorecard floor |
| Touching anything that calls a model | [`docs/adr/0003-single-llm-chokepoint.md`](adr/0003-single-llm-chokepoint.md) | Why there is exactly one `generateStructured`, and why a lint fence guards it |
| Reading or writing tenant data | [`docs/adr/0001-dual-store-seam.md`](adr/0001-dual-store-seam.md) and [`docs/adr/0002-tenant-key-embeds-user-id.md`](adr/0002-tenant-key-embeds-user-id.md) | One store interface over two backends; the tenant key that makes cross-user access structurally impossible |
| Reading a project's data across several ad accounts | [`docs/adr/0010-project-reads-union-of-account-tenants.md`](adr/0010-project-reads-union-of-account-tenants.md) | Why the key stays per-account and the union happens on read |
| Building or restyling UI | [`docs/design-system.md`](design-system.md) | Tokens, dark mode, the shared `Button`, the conventions a new component inherits |
| Extracting a component that grew too big | [`docs/roadmap/component-debt.md`](roadmap/component-debt.md) | The catalogued debt, so you extend the list instead of rediscovering it |
| Writing or changing user-facing strings | [`docs/i18n/contract.md`](i18n/contract.md) | Colocated `TDict`s, `useT`/`getT`, which locale is the source, what typecheck can and cannot see |
| Choosing the Czech or English wording | [`docs/i18n/style-cs.md`](i18n/style-cs.md), [`docs/i18n/style-en.md`](i18n/style-en.md), [`docs/i18n/glossary.md`](i18n/glossary.md) | Register, tykání/vykání, and the terms that are already decided |
| Why there is no i18n parity script | [`docs/adr/0006-colocated-i18n-dictionaries.md`](adr/0006-colocated-i18n-dictionaries.md) | The type system is the parity check; do not invent a second one |
| Working on leads / CRM | [`docs/leads/design.md`](leads/design.md) | The lead entity layer and where its rows live |
| Working on headless outreach | [`docs/headless-outreach/design.md`](headless-outreach/design.md) | The free-channel loop, its vault, and the review gate a draft passes through |
| Reaching for a new dependency or a new tool | [`docs/adr/0008-zero-dependency-tooling.md`](adr/0008-zero-dependency-tooling.md) | Node built-ins and repo-local scripts first; a runtime dependency needs an `Ack:` line |
| Changing the onboarding checklist | [`docs/adr/0009-free-channels-lead-the-onboarding-checklist.md`](adr/0009-free-channels-lead-the-onboarding-checklist.md) | Why free channels lead it, and for which project types they are required |

## Running it

| The task | Open | What it settles |
|---|---|---|
| Starting the app locally with no keys | [`README.md`](../README.md) § Two-minute local start | `npm run seed:local` then `npm run dev:local` — fully offline `/app` |
| Connecting real Google sign-in and Ads | [`SETUP.md`](../SETUP.md) | The cloud-connected walkthrough. Partly stale — it predates the offline path |
| Deploying, env names, crons, rollback, host rename | [`docs/deploy.md`](deploy.md) | The Vercel runbook, and the delivery contract that makes a push the release act |
| Getting a bad change back out | [`docs/runbooks/revert-drill.md`](runbooks/revert-drill.md) | The measured drill, so the answer is a number and not a hope |
| Running it on your own machine or server | [`docs/open-source/self-hosting.md`](open-source/self-hosting.md) | The self-hosted design, its operator password, and what it deliberately does not need |
| Why `SELF_HOSTED` is not just "dev mode in production" | [`docs/adr/0004-self-hosted-third-deploy-mode.md`](adr/0004-self-hosted-third-deploy-mode.md) | The third deploy mode, and the guards it does not loosen |
| Changing the container image or the build output | [`docs/adr/0005-container-base-and-standalone-output.md`](adr/0005-container-base-and-standalone-output.md) | Node 24 Alpine, and `output: "standalone"` only under `ADAMANT_DOCKER_BUILD` |

## Landing it

| The task | Open | What it settles |
|---|---|---|
| Opening a pull request as a human | [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Setup, the gate, the conventions — the same rules `AGENTS.md` states, for a person |
| Signing the contributor agreement | [`CLA.md`](../CLA.md), [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | Why a CLA, and the behaviour expected in the tracker |
| Writing the commit subject | [`scripts/commit-subject.mjs`](../scripts/commit-subject.mjs) | The rules themselves, with the reason each one exists. Audit history with `npm run commit:check -- --range <range>` |
| A gate went red and you do not know what to run | [`scripts/gate-remedy.mjs`](../scripts/gate-remedy.mjs) | The next command for every stage of `check:ci`, in the order they run — `npm run gates`, or read it off the failure itself |
| Proving the model still behaves, off a schedule | [`scripts/llm-drift.mjs`](../scripts/llm-drift.mjs) | The weekly real-model prove, what it asserts, and where its dated verdicts are published |
| Reporting a vulnerability | [`SECURITY.md`](../SECURITY.md) | Never a public issue; what is in scope |
| Getting past a security rule you believe is wrong | [`.github/security/sast-allowlist.json`](../.github/security/sast-allowlist.json) | The only exception mechanism — an entry with a written reason. There is no in-code opt-out |
| Adding or changing a required check | [`docs/adr/0011-required-checks-are-enumerated-in-the-repo.md`](adr/0011-required-checks-are-enumerated-in-the-repo.md) | Why the list lives in the repo and is verified by a gate |
| Keeping the bilingual README pair honest | [`docs/parity.json`](parity.json) | The shared claims both editions must state. Never delete a rule to go green |

## Understanding why

| The task | Open | What it settles |
|---|---|---|
| What the product is, for whom | [`PRODUCT.md`](../PRODUCT.md) | The product profile |
| Why anyone would pay for it | [`docs/value-case.md`](value-case.md) | The value case, in the terms an operator judges it by |
| Where the project came from | [`docs/case-study.md`](case-study.md) | The original brief and task write-ups, preserved unchanged |
| What going open source was expected to cost and buy | [`docs/open-source/impact.md`](open-source/impact.md) | The impact map |
| What is planned, and what is known debt | [`docs/roadmap/`](roadmap/) | Backlogs, retired directions, and the moonshot deck |
| What a specific work package was supposed to do | [`docs/specs/`](specs/) | One spec per WP, written before the build |
| What previous agent sweeps learned | [`docs/harness/harness-learnings.md`](harness/harness-learnings.md) | What the automated scans have actually produced, and what to stop repeating |
| Reading this in Czech | [`docs/README.cs.md`](README.cs.md) | The Czech product overview — the derived edition of `README.md` |

## Every ADR, by the seam it governs

An ADR is the document you want when a change would make a seam behave
differently. Each one is listed here so "is there a decision about this?" is
answerable without opening eleven files; [`docs/adr/README.md`](adr/README.md)
is the record's own index and explains how to write one.

| Seam you are about to change | ADR |
|---|---|
| The store — Firestore in the cloud, `node:sqlite` locally | [ADR-0001](adr/0001-dual-store-seam.md) |
| Tenancy and cross-user isolation | [ADR-0002](adr/0002-tenant-key-embeds-user-id.md) |
| The LLM chokepoint and its tag gate | [ADR-0003](adr/0003-single-llm-chokepoint.md) |
| Deploy modes, and what `SELF_HOSTED` does not loosen | [ADR-0004](adr/0004-self-hosted-third-deploy-mode.md) |
| The container base and the build output | [ADR-0005](adr/0005-container-base-and-standalone-output.md) |
| Where translations live, and why no parity script | [ADR-0006](adr/0006-colocated-i18n-dictionaries.md) |
| Whether a check blocks or reports against a ratchet | [ADR-0007](adr/0007-gate-rung-discipline.md) |
| Taking a dependency, or reaching for a formatter | [ADR-0008](adr/0008-zero-dependency-tooling.md) |
| The onboarding checklist's order | [ADR-0009](adr/0009-free-channels-lead-the-onboarding-checklist.md) |
| Reading one project across several ad accounts | [ADR-0010](adr/0010-project-reads-union-of-account-tenants.md) |
| What may stop a change, and where that is written | [ADR-0011](adr/0011-required-checks-are-enumerated-in-the-repo.md) |
