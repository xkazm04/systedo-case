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
npm run check:ci   # typecheck + lint + build + seed:check + test:unit + llm:gate:check
```

The pieces, if you need to run them individually:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # next build
npm run test:unit    # node:test suites in test-unit/
npm run llm:gate     # the LLM proof gate (llm:list shows every call site)
npm run test:e2e     # Playwright — NOT in CI, run it when you touch a flow
```

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
[`AGENTS.md`](./AGENTS.md). Its first block is injected and re-injected by
`next dev` itself (see `node_modules/next/dist/server/lib/generate-agent-files.js`)
— that is expected, not a stray edit.
