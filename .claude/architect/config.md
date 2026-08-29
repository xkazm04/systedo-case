---
product: "Adamant (systedo-case)"
stack: "Next.js 16 App Router + React 19 + TypeScript; Auth.js v5 (Google) + firebase-admin/Firestore in prod, node:sqlite under .data/ in local dev behind the same store interfaces; Vercel serverless; zero-dependency repo tooling (ADR-0008)"
vault: ["C:/Users/kazda/kiro/systedo-case/.architect"]
vault_subdir: Architect
context_map: context-map.json
coverage_context_source: "context-map.json `contexts[].name`"
base_branch: master
worktree_root: .claude/worktrees
active_runs_ledger: ""
knowledge_registry: ../ai-registry
knowledge_domains: [software-engineering, media-generation]
---

# Architect overlay — Adamant

Written 2026-08-29 on the first architect run (theme `data-modeling`). Everything
here was verified against the tree that day; re-verify before trusting a line that
names a file.

## Context sources

Read in this order:

1. `docs/adr/` — **the architecture digest for this repo.** Nine accepted ADRs, each
   owning one seam. Read the ADR for a seam before proposing anything about it;
   several findings a naive scan would "discover" are already decided here, and the
   ADR usually names the test that pins the decision. `docs/adr/README.md` is the index.
2. `AGENTS.md` — project rules ("Commands", "Architecture in 10 lines", "Conventions
   that bite"). `CLAUDE.md` includes it by reference.
3. `context-map.json` — 116 contexts / 16 groups, file-to-context authority for area
   scope. **Treat as an index, not an inventory**: `npm run agents:surface` reports
   how many tracked source files no context maps (159 at the 2026-07-30 scan,
   ratcheted). Regenerate with the Personas context scan / `/contexts`.
4. `docs/design-system.md` — tokens, dark mode, the shared `Button`.
5. `docs/i18n/contract.md` — the colocated `TDict` contract (ADR-0006).
6. `.ai/registry-map.json` — the context/registry-subject join. As of 2026-08-23:
   474 pairs, 472 `unknown`. It is a scaffold, not a verdict set; `/conform` fills it.

## Area menu

Derived from `context-map.json` groups (16 groups, 116 contexts):

1. AI & Content (22 ctx) — "AI & Content Engine" + "AI & Content Generation"
2. Campaigns & Ads (15 ctx) — "Campaign Management" + "Campaign & Ads Management"
3. Analytics & Performance (15 ctx) — "Analytics & Reporting" + "Performance & Analytics"
4. Catalog & Projects (10 ctx) — "Project & Catalog" + "Catalog & Inventory"
5. Platform Operations (6 ctx) — stores, crons, tenancy, billing rails
6. App Shell (19 ctx) — "App Shell & Site" + "Authenticated Product Shell"
7. Site & Marketing (9 ctx)
8. Channels (14 ctx) — "Local SEO & Maps" + "Social & Content Publishing" +
   "Social Media" + "Lead & CRM Management"

## Gates

Detected from `package.json` scripts; `npm run check:ci` is what CI runs.

```
baseline:  npm run typecheck ; npm run lint ; npm run test:unit ; npm run sast
step:      npm run typecheck ; npm run lint
final:     npm run check ; npm run test:unit ; npm run sast ; npm run adr:check ; npm run agents:surface
slow:      npm run build (inside `check`) ; npm run test:e2e ; npm run llm:gate:check ; npm run llm:quality:check
```

Rung discipline is **ADR-0007** and it is not optional: a gate is either *blocking*
(passes today, so red is a regression) or *reporting with a ratchet* (prints, and
fails only when a count rises above a baseline in the script). Never move a gate
between rungs as a side effect, and never raise a ratchet baseline — lower it in the
same commit that fixes findings. Ratcheted: `npm run i18n:audit -- --check`,
`npm run agents:surface`.

Two traps:

- **Any commit touching `src/app/api/ai/` or the LLM tool/registry files triggers a
  ~10-minute real-model gate in pre-commit.** Background the commit; it has not hung.
- `npm run test:e2e` needs port 3100 free — kill a stale listener before trusting a run.

## Repo law

Pasted verbatim into every sub-agent brief and enforced at 7g:

- **Pathspec commits only.** `git add <paths>` then `git commit <same paths>`. Never
  `-A`, never `.`, never `-u`, never a bare `git commit`, never `stash` / `reset` /
  `checkout --` on work that is not yours. A second agent (vibeman) runs concurrently
  on this checkout; stage your hunk, not the whole file, and verify the commit builds
  in isolation.
- **Components under 200 LOC.** Part A of `.github/agent-review-rubric.md` blocks a
  component growing past it. Extract sub-components and data hooks. Existing debt:
  `docs/roadmap/component-debt.md`.
- **No `export const dynamic | runtime | revalidate` under `src/app/`.** Blocking.
  The app runs Cache Components (`cacheComponents` + `partialPrefetching`); wrap a
  dynamic read in `<Suspense>` instead.
- **A deleted test or a new runtime dependency needs `Ack: <why>`** in the commit
  message or PR body. There is no flag that turns the rule off. New runtime deps also
  argue against ADR-0008 (zero-dependency tooling) — expect to justify it twice.
- **i18n is colocated and the type system is the parity check.** Each component owns
  `const T = { cs: {...}, en: {...} }` consumed via `useT(T)` / `await getT(T)`. A key
  in one locale column and not the other is a `typecheck` failure. **en is the
  authoring source, cs is transcreated** (flipped 2026-08-05); `DEFAULT_LOCALE=en` is
  split from `HOME_MARKET_LOCALE=cs` — do not re-collapse them, it reprices CZK as USD.
  There is no parity script; do not invent one.
- **Every `generateStructured()` call site carries `// llm-tool: <id>`** with a
  registered test in the gate registry, and every LLM text call goes through that one
  chokepoint (ADR-0003). Accepting a golden needs
  `npm run llm:eval:update -- --reason "..."`.
- **Design tokens, not raw colors** (`ink` / `muted` / `surface` / `brand-*`); dark mode
  is a token override and the rule is about the token's ROLE, not its name. Beware the
  Tailwind v4 cascade trap: unlayered CSS beats `@layer utilities`.
- **Security rules are a gate, not a review note** (`npm run sast`, ADR-0008).
  Exceptions live in `.github/security/sast-allowlist.json` with a written reason;
  there is no in-code opt-out.
- Out-of-scope walls: never edit the generated blocks (below), never commit `.data/`,
  never weaken the `NODE_ENV=production` hard gate on `LOCAL_DB` / `DEV_AUTH`
  (ADR-0001 / ADR-0004).

## Docs vehicles

- **`docs/adr/NNNN-kebab-slug.md` is the primary vehicle** and the one this repo
  actually reads. `npm run adr:check` (blocking, in `check:ci`) enforces: four-digit
  unique numbering, a `# ADR-NNNN — <title>` heading matching the filename, the four
  sections `## Status` / `## Context` / `## Decision` / `## Consequences`, a known
  Status, an entry in `docs/adr/README.md` linking it exactly once, **and that every
  repo path cited in inline code still exists.** That last check is why an ADR here is
  a live artifact: a renamed seam fails the build. An architect decision that changes a
  seam should land as a repo ADR, with the vault ADR as the working record.
- `AGENTS.md` → "## Conventions that bite" for a project-wide convention humans and
  agents need in every session. Keep additions to 3-8 lines; it is already long.
- `docs/design-system.md`, `docs/i18n/contract.md`, `docs/testing/` for their seams.

## Knowledge registry

Local checkout at `../ai-registry` (`.ai/manifest.yaml` `registry.local`); domains
`software-engineering` and `media-generation`. Resolve a subject through
`knowledge/<domain>/index.json` -> `subjects["<slug>"].file`, never by building a path
from the slug.

Theme-to-subject map established on the 2026-08-29 run:

| Theme / area | Governing subjects |
|---|---|
| data-modeling, the dual store | `data-access` (esp. technique `cross-driver-invariant-parity`), `migrations` (esp. `schema-drift-detection`, `idempotent-steps`), `embedded-db` |
| demo vs live data | `demo-data-plane` (`one-interface-many-planes`, `fake-surface-honesty-contract`, `runtime-dispatch-not-build-flag`, `seeded-determinism`) |
| LLM chokepoint, generation | `llm-agent/*` — `model-routing`, `cost-metering`, plus the `media-generation` bundle for image work |
| tenancy, auth, keys | `security/authorization`, `security/credential-vault`, `security/browser-credential-boundary` |
| gates, CI, scans | `engineering-process/*` — `ci-execution-trust`, `codebase-scanning`; `engineering-assessment/conformance-checking` |
| reporting surfaces | `executive-reporting` (the one pair already marked `deviation` for `report-engine`) |

`.ai/registry-map.json` is regenerated with
`node ../ai-registry/scripts/build-registry-map.mjs --project systedo-case`.

## Lint vehicle

**`scripts/sast.mjs`, the `RULES` array — not ESLint.** `eslint.config.mjs` is 18 lines
(`nextVitals` + `nextTs` + `globalIgnores`) with no custom-rule directory, and ADR-0008
forbids adding a dependency to get one. The native shape for a mechanically-enforced
repo invariant is a rule object in `RULES`:

```js
{
  id: "kebab-id",
  title: "One line, what the violation IS",
  why: "Why this repo cares - cite the ADR or the concrete failure it prevents.",
  run: () => files.filter(...).map((f) => ({ path: f.path, line: N, detail: "..." })),
}
```

Two source views are prepared for you: `noComments` (keeps string and template
contents, for a rule that is *about* a template) and `codeOnly` (also blanks literals,
so an identifier rule never fires on prose). Pick deliberately and say which in `why`.

A new rule joins the **blocking** rung only if it passes on the tree today (ADR-0007).
If it does not, either allowlist the existing violations in
`.github/security/sast-allowlist.json` with a written reason each, or ship it as a
counted reporting rule with a ratchet. Default to reporting for a migration.

## Test guard vehicle

`node:test` files at `test-unit/<name>.test.mjs` (360 as of 2026-08-29), run by
`npm run test:unit`. A structural or invariant guard goes here, not beside the source.

The precedent to copy is **`test-unit/db-migrations.test.mjs`** — ADR-0001 names it as
the gate that diffs a fresh-migrated database against a v1-era database carried forward
through the migration chain. Read it before writing any new schema or parity guard; it
is the closest thing this repo has to a convergence test, and a new guard should match
its shape rather than invent one.

For a cross-driver guard, note the existing hand-written Firestore double at
`test-unit/activity-firestore-fake.mjs` (plus `activity-firestore-fake-hook.mjs`), used
by `activity-store-firestore.test.mjs` beside `activity-store-local.test.mjs`.

## Smoke

```bash
npm run seed:local   # once - dev user + sample projects into .data/systedo.db
npm run dev:local    # DEV_AUTH=true LOCAL_DB=true next dev - fully offline /app
```

Then exercise the surface at `http://localhost:3000/app`. Playwright: `npm run test:e2e`
(kill port 3100 first). If a change is UI-affecting and this was not run, **say plainly
that it was not visually verified** — never infer "looks good" from the diff.

Worktree warning: a fresh worktree has no `node_modules`, and a junction or symlink of
the main checkout's copy satisfies `tsc` while breaking Turbopack ("Symlink
[project]/node_modules is invalid, it points out of the filesystem root") and,
separately, the test runner. Re-test **one gate of every class** — typecheck, lint,
unit, build — inside the worktree before trusting it. Given the repo law already
mandates pathspec-only staging, working on the main checkout is often the better trade;
record whichever you chose, and why, in the ADR.

## Baseline exclusions

Never findings, never edited in place — both are generator-owned and pinned in
`.github/agent-surface.lock.json`:

- the `nextjs-agent-rules` block at the top of `AGENTS.md` (rewritten by `next dev`);
- the "## Project Context Map" section of `CLAUDE.md` (rewritten by the Personas scan).

A generator reword is accepted deliberately with
`npm run agents:surface -- --accept "what changed and why it is fine"`, on its own,
never riding along in an unrelated diff.

Also excluded: the 159 unmapped source files `agents:surface` counts (a known ratchet,
not a defect), and the >200 LOC components already catalogued in
`docs/roadmap/component-debt.md`.

## Skill improvement log

- 2026-08-29 — First run. `docs/adr/` is the architecture digest here, not a prose
  digest: nine ADRs, path-checked by a blocking gate. Reading ADR-0001 before Phase 3
  changed the run — the dual-store invariants and the SCHEMA-vs-migration hazard are
  already written down and pinned by a named test, so the useful question was whether
  the pins hold, not whether the seam had ever been thought about. In a repo this
  mature, Phase 1b step 0 should include the repo's own decision records, not only the
  registry's subjects.
- 2026-08-29 - Two sub-agent headline claims failed verification, both historical, not
  structural. `git log -S "<literal>" -- <path>` settled both in seconds. In this repo
  the ordering that matters is: byom_config entered SCHEMA 2026-07-06, the migration
  ledger 2026-07-14 with v1 = `db.exec(SCHEMA)`. Anything already in SCHEMA on
  2026-07-14 is covered by v1; anything added after needs its own migration.
- 2026-08-29 - `npm run sast` was ALREADY RED on master at the start of this run (3
  blocking findings). Baseline every gate by its exit code, never by `| tail`. Backlog:
  `sast-gate-red-on-master`.
- 2026-08-29 - The editor writes CRLF into this repo's LF files. After every commit,
  compare `git show --stat` with `git show --ignore-all-space --stat`; if they differ,
  the file was rewritten. `.gitattributes` pins only `.husky/**` and the tree is mixed,
  so there is no global convention to lean on - restore whatever the file was.
