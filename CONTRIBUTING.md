# Contributing to Adamant

Thanks for looking. This is a real product that happens to be open source, so the
bar is "would I want to maintain this in three years", not "does it work on my
machine". That cuts both ways: the conventions below exist so your patch gets
merged rather than bikeshedded.

Honest expectations first: Adamant is maintained by **one person plus agents**,
and issues and PRs are **triaged weekly**. The issue and PR templates under
[`.github/`](./.github/) exist to make that weekly pass fast — a bug report that
states its deploy mode and attaches `npm run doctor` output gets fixed; one that
doesn't gets a round-trip of questions.

## Before you write code

- **Small fix, obvious bug, typo, missing translation** — just open a PR.
- **Anything that changes behaviour, adds a dependency, or touches the LLM layer,
  the store seams, or billing/metering** — open an issue first and let's agree on
  the shape. A rejected 800-line PR is a bad day for both of us.
- **Security issues** — do not open a public issue. See [`SECURITY.md`](./SECURITY.md).
- **Not sure which document covers your task?**
  [`docs/task-index.md`](./docs/task-index.md) routes from a task — changing the
  store, deploying, adding an AI operation, writing user-facing strings — to the
  ADR, runbook or contract that governs it, and lists every ADR by the seam it
  decides. It saves you reading eleven decision records to find the one you need.

## Licensing and the CLA

Adamant is licensed under **AGPL-3.0-only** ([`LICENSE`](./LICENSE)). Two things
follow from that, and it is better to know both up front:

1. **If you run a modified version as a network service, you must offer your
   users its source.** That is the whole point of the AGPL and it is why this
   project can be given away without giving away the ability to sustain it.
2. **Contributions are accepted under a Contributor License Agreement**
   ([`CLA.md`](./CLA.md)). You keep the copyright in your work; you grant the
   maintainer the rights needed to ship it — including under a different licence
   later, which is what makes a commercially-hosted version of this codebase
   possible at all.

If the CLA is a dealbreaker for you, say so in the issue. A patch under
AGPL-only can sometimes still be taken; it just has to be handled deliberately
rather than merged by reflex.

## A note on language

Adamant is Czech-first. The product's home market is Czechia, the UI ships
`cs` + `en`, and **a lot of in-code comments and error strings are in Czech**.
That is not going to change and you are not expected to fix it.

What *is* expected to be English: this file, `README.md`, `SECURITY.md`,
`.env.example`, and everything under `docs/open-source/`. Those are the surfaces
a stranger reads first. If you add a new Czech comment next to code you are
already touching, fine; if you write a new contributor-facing document, write it
in English.

## Development setup

```bash
npm install
npm run seed:local   # once — creates a dev user + sample projects in .data/systedo.db
npm run dev:local    # DEV_AUTH=true LOCAL_DB=true next dev → http://localhost:3000
```

`npm run dev:local` gives you a **fully offline** authenticated product at `/app`:
no Google OAuth, no Firestore, no API key. Requires Node **≥ 22.5** (the local
store uses `node:sqlite`). `npm run dev` is the real-auth mode and needs Google
OAuth + Firestore credentials — you almost certainly do not want it.

There is **no required API key**. With no provider configured, every AI operation
falls back to a deterministic demo result. Degrading without keys is a **product
property**, not a dev convenience, so please don't write code that assumes a
provider is present. `npm run doctor` prints what your `.env.local` actually
switches on.

## The verification gate

Run this before opening a PR. CI runs the same command; a red gate is not a
review comment, it's a blocked merge.

```bash
npm run check:ci   # cheapest first: adr:check + docs:parity + agents:surface
                   #   + checkpoint:check + actions:check + merge-gate
                   #   + contract:ledger:check + context:decay:check
                   #   + review:agent:gate + llm:gate:check + llm:quality:check
                   #   + llm:budget:check + seed:check, then the slow half:
                   #   test:unit, then typecheck + lint + build. Cheapest first all
                   #   the way down: a broken test is reported before the build runs
```

Every one of them prints the **next command** when it fails — the command that
regenerates the artefact, and the file where an exception is recorded when your
change is the legitimate one. `npm run gates` prints that table for the whole
chain before anything goes red.

The pieces, if you need to run them individually:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # next build
npm run test:unit    # node:test suites in test-unit/
npm run llm:gate     # the LLM proof gate (llm:list shows every call site)
npm run sast         # repo security rules over src/ (its own CI workflow)
npm run review:agent # the rubric review your PR will get (--base origin/master)
npm run docs:parity  # README.md and docs/README.cs.md still agree on shared facts
npm run commit:check # commit-subject rules (rubric A5) over a range or a message
npm run contract:ledger # every rule, what enforces it, what it is absorbing
npm run test:e2e     # Playwright — NOT in CI, run it when you touch a flow
```

**Adding an exception to a fence is a two-line diff.** The ESLint seams and
`.github/security/sast-allowlist.json` are deliberately narrow, and each exception
they hold is counted in [`.github/contract-ledger.json`](.github/contract-ledger.json)
against a `ceiling` — what the list holds today, why those entries are defensible,
and what would make them unnecessary. `npm run contract:ledger:check` (blocking,
inside `check:ci`) fails when a list grows past its ceiling. So the entry and the
raised ceiling land together, next to each other, where a reviewer reads both.
Fixing the cause is still the better move; absorbing it is a choice you make in
writing.

**And so is moving a number a gate compares against.** The same ledger pins every
ratchet baseline (`RATCHET.coverage` in `scripts/i18n-audit.mjs`,
`RATCHET.unmapped` in `scripts/agent-surface.mjs`) and every threshold
(`FLOOR = 6.5` in `scripts/quality-gate.mjs`, `COMPONENT_LOC_LIMIT = 200` in
`scripts/agent-review.mjs`). Each of those is one digit in the file that enforces
the rule, and editing it turns a red gate green without changing anything the
product does — so the same check fails when a number crosses its pin, or when a
new baseline or threshold arrives with no pin at all. Run
`npm run contract:ledger` to see every pin and what the tree holds against it.

**Your commit subject is checked too.** Rubric A5 refuses a subject that narrates
the session instead of naming the change — `fix: Done. Here's what I found and
changed` is a real entry in this log and would now be refused. Write
`fix(campaigns): stop triage double-counting Sklik spend` instead; the rest goes
in the body. Rules and their wording live in
[`scripts/commit-subject.mjs`](scripts/commit-subject.mjs).

**Editing the Czech README?** `README.md` is the source and
[`docs/README.cs.md`](docs/README.cs.md) is transcreated from it. They are not
sentence-for-sentence editions and are not meant to be — but the facts they share
may not contradict each other, and `npm run docs:parity` fails when they do. The
claims it holds in step are declared in [`docs/parity.json`](docs/parity.json),
each with the reason it is there.

Two more things run on your PR that are not in `check:ci`:

- **`.github/workflows/sast.yml`** — the repo security rules (reporting, see the
  note in that file) and the Actions supply-chain policy (blocking), plus
  Semgrep's registry packs (reporting).
- **`.github/workflows/agent-review.yml`** — an automated review of your diff
  against [`.github/agent-review-rubric.md`](.github/agent-review-rubric.md). Its
  mechanical half blocks; two of its six rules are unblocked by writing a
  sentence rather than changing code — put `Ack: <why>` in a commit message or
  the PR body when you delete a test or add a runtime dependency. A sixth (A6)
  refuses a pin in `.github/contract-ledger.json` that got looser without being
  re-dated and re-argued in the same diff; tightening one costs nothing. You do not have
  to go digging for the verdict: it arrives as a named check, as annotations on
  the lines it is about, and as a comment on the PR.

What that review has caught over time is published as a single issue, *Agent
review — what it has been catching*, rewritten weekly by
[`agent-review-history.yml`](.github/workflows/agent-review-history.yml). If a
rule reads as badly drawn, that issue is the evidence to argue with.

### What actually stops a merge

Not everything red is a blocker, and guessing which is which wastes your time
and the maintainer's. So it is enumerated:
[`.github/required-checks.json`](.github/required-checks.json) lists the checks
that must be green before a change lands, each with the reason it earns a red
build. The rubric review of your diff is one of them — this repository's review
is a gate, not a comment.

That file is the source and GitHub's branch-protection settings are a copy of
it — and you do not have to take that on faith either.
[`.github/branch-ruleset.json`](.github/branch-ruleset.json) is the copy, written
down as the ruleset payload it produces, and `npm run protection:verify` asks
GitHub which of those checks it is *actually* enforcing on the default branch.
That answer is appended to the weekly issue above, so whether the review of your
diff can block your merge is something you can read rather than infer.

`npm run merge-gate` runs inside `check:ci` and fails if a listed check is
renamed, stops running on pull requests, or is softened with `continue-on-error`
on a step not declared reporting-rung — so a gate cannot quietly become advice.
The jobs deliberately *not* on that list (Semgrep, `npm audit`, the repo
security rules, the judgment half of the review) are reporting-rung: read them,
they will not block you.

Before you change a seam, read its decision record in
[`docs/adr/`](docs/adr/README.md). Why a check blocks or merely reports is
[ADR-0007](docs/adr/0007-gate-rung-discipline.md).

## The conventions that actually bite

1. **One LLM chokepoint, and it is tagged.** Every LLM text call goes through
   `generateStructured()` in `src/lib/llm/index.ts`. Every call site must carry a
   `// llm-tool: <id>` comment with a registered test in the gate registry.
   `scripts/llm-gate.mjs` (pre-commit + CI) fails on an untagged call site, a
   call that bypasses the chokepoint, or a drifted contract golden. Scaffold a
   new one with `npm run llm:new`; prove it against a real model on demand with
   `npm run test:llm` or `npm run llm:quality`.
2. **Every generator needs a `demo`.** `GenerateArgs` requires a deterministic
   `demo: () => T` fallback, and the type system will not let you skip it. Never
   remove one, and never make a provider mandatory.
3. **i18n parity is the type system.** Each component owns its own
   `const T = { cs: {...}, en: {...} }` (`TDict`), consumed via `useT(T)` on the
   client or `await getT(T)` on the server. A key added to one locale column and
   not the other is a `typecheck` failure. **There is no parity script — do not
   invent one.** The contract is in [`docs/i18n/contract.md`](./docs/i18n/contract.md).
4. **The dual-store seam is real.** Production data lives in Firestore; local dev
   uses `node:sqlite` under `.data/`. A domain store is a `store.ts` dispatcher
   that lazily imports `store.local` or `store.firestore` so the local path never
   evaluates firebase-admin. New persistence follows that pattern, or rides the
   existing generic seams (`src/lib/tenant-docs/`, `src/lib/campaigns/store/`).
   A Firestore-only module is a module that 500s offline — see
   [`docs/open-source/impact.md`](./docs/open-source/impact.md) for the list we
   already owe.
5. **Design tokens, not raw colours.** `ink` / `muted` / `surface` / `brand-*`,
   with dark mode implemented as token overrides. Shared `Button` lives in
   `src/components/ui.tsx`. Verify new surfaces in **both** themes.
   Conventions: [`docs/design-system.md`](./docs/design-system.md).
6. **Components under 200 LOC preferred.** Extract sub-components and data hooks
   rather than growing a module file. Existing debt is catalogued in
   `docs/roadmap/component-debt.md` — adding to it needs a reason.
7. **Scope your change with the context map.** `context-map.json` maps every file
   to a feature context. Read it at task start and keep your edits inside the
   context you are actually changing.

## Local-first invariants — review criteria, not vibes

Reviewers check every PR against these, so check yours first:

- **No provider ever becomes mandatory.** Degrading without keys is a product
  property (see above), and a PR that breaks it is rejected on that ground alone.
- **No deterministic `demo` fallback is removed.** Same reason.
- **No hosted-only features.** If it can't be useful to a self-hoster, it belongs
  in the ops layer, not this repository.
- **Nothing phones home by default.** No telemetry, update check, or remote
  fetch that a fresh `dev:local` install performs without being asked to.
- **If the hosted version is ever better than this repository, that is a bug.**
  The hosted product is this software plus operations — never this software plus
  extras.

## AI-assisted contributions

Half of this codebase was written with agents, so AI-assisted PRs are welcome —
under the same deal the maintainer holds himself to:

- **You own what you submit.** You ran the verification gate yourself and you
  can explain every line in the diff. "The agent wrote it" is not an answer to
  a review question.
- **Disclose substantially agent-generated PRs** in the PR template's AI
  assistance section. Disclosure is welcome and costs you nothing in review.
- **Drive-by bulk agent PRs are closed without review.** If the PR reads like
  it was aimed at a hundred repositories and happened to hit this one, it will
  be treated that way.

## Commit and PR style

- Present tense, scoped: `billing: unmeter self-hosted installs`.
- One logical change per PR. If your PR needs an "and also" in the description,
  it's probably two PRs.
- Explain **why** in the body. The what is in the diff.

## What is unlikely to be merged

- Changes that make a provider mandatory, or that remove a deterministic demo
  fallback.
- New persistence that only has a Firestore path.
- A key added to `cs` but not `en` (or the reverse), or a hand-rolled parity
  script to paper over it.
- New dependencies that duplicate something already in the tree — especially a
  charting library, since the charts here are deliberately hand-written SVG.
- Reformatting passes bundled with logic changes.
- **Features that only make sense for the hosted deployment.** The hosted product
  is this software plus operations, not this software plus extras; if it can't be
  useful to a self-hoster, it probably belongs in the ops layer.

Deeper guidance for automated agents and humans alike lives in
[`AGENTS.md`](./AGENTS.md), which is the **canonical** guidance document for this
repository — `CLAUDE.md` imports it, this file restates it for humans, and
`.ai/manifest.yaml` declares the precedence under `guidance.canonical`. If two of
them ever disagree, `AGENTS.md` wins and the other is the bug. Its "What you may
do unattended" section is the one to read before you point an agent at this
tree. Its first block is injected and re-injected by
`next dev` itself (see `node_modules/next/dist/server/lib/generate-agent-files.js`)
— that is expected, not a stray edit.
