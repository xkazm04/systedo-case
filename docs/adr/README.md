# Architecture decision records

Short records of the decisions that shape this repo's seams — why the shape is
what it is, what was rejected, and what breaks if you undo it.

**Why these exist.** Almost every commit here is written by an agent, and an
agent scoping a change reads `context-map.json` and the docs tree — not `git
log`. The reasoning behind the dual-store seam, the `SELF_HOSTED` mode and the
LLM chokepoint used to live only in commit bodies and inline comments, which is
exactly the place it is invisible at the moment it would prevent a mistake.
These records put it where the reader already is.

**They are not a design doc.** An ADR is one decision, its context, and its
consequences. The long-form designs stay where they are —
[`docs/open-source/self-hosting.md`](../open-source/self-hosting.md),
[`docs/i18n/contract.md`](../i18n/contract.md),
[`docs/deploy.md`](../deploy.md),
[`docs/design-system.md`](../design-system.md) — and the ADRs link to them.

## The record

| # | Decision | Status |
|---|---|---|
| [0001](0001-dual-store-seam.md) | One store interface, two backends: Firestore in the cloud, `node:sqlite` locally and self-hosted | Accepted |
| [0002](0002-tenant-key-embeds-user-id.md) | The tenant key embeds the user id, so cross-user access is structurally impossible rather than checked | Accepted |
| [0003](0003-single-llm-chokepoint.md) | Every LLM text call goes through one wrapper, enforced by a tag gate rather than a convention | Accepted |
| [0004](0004-self-hosted-third-deploy-mode.md) | `SELF_HOSTED` is a third deploy mode, not a loosening of the dev guards | Accepted |
| [0005](0005-container-base-and-standalone-output.md) | Node 24 Alpine base, and `output: "standalone"` only under `ADAMANT_DOCKER_BUILD` | Accepted |
| [0006](0006-colocated-i18n-dictionaries.md) | Translations are colocated with their component and typed for parity; there is no parity script | Accepted |
| [0007](0007-gate-rung-discipline.md) | A check is blocking only if it passes today; everything else reports against a ratchet | Accepted |
| [0008](0008-zero-dependency-tooling.md) | Repo tooling uses Node built-ins and repo-local scripts before it takes a dependency | Accepted |
| [0009](0009-free-channels-lead-the-onboarding-checklist.md) | Free channels lead the onboarding checklist, and are required for the types with no ad budget | Accepted |
| [0010](0010-project-reads-union-of-account-tenants.md) | A project reads the union of its per-account tenants; the key stays per-account, sources are tagged, report sections blend on read | Accepted |
| [0011](0011-required-checks-are-enumerated-in-the-repo.md) | What may stop a change is enumerated in `.github/required-checks.json` and verified by a gate, not remembered in a settings page | Accepted |

## Writing one

Copy the shape of an existing record. `npm run adr:check` (part of `npm run
check:ci`) enforces the parts that can be enforced:

- the filename is `NNNN-kebab-slug.md` and the number is unique;
- the first heading is `# ADR-NNNN — Title`;
- the record has `## Status`, `## Context`, `## Decision` and `## Consequences`,
  and Status is one of Accepted / Proposed / Superseded / Deprecated;
- the record is linked from this index exactly once;
- **every repo path the record cites in `inline code` still exists.** This is the
  one that earns its keep: an ADR describing a file that has since been renamed
  is worse than no ADR, and a rename is exactly when nobody thinks to look here.

Superseding beats editing. When a decision is reversed, add a new ADR, and set
the old one's Status to `Superseded by ADR-NNNN`.
