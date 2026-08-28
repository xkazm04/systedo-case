# ship-loop overlay - systedo-case (Adamant)

Read by `/ship-loop` at the start of every run. Hand-maintained; the loop proposes edits at CPn.
Written 2026-08-28 (ship-loop 2.1.0 overlay format) during milestone `kanaly-core-path` — the loop
had run Boot->CP10 (2026-07-02/03) and a `/mvp` launch pass (2026-08-04) with **no overlay at all**,
so every one of those runs re-derived the gate ladder from `package.json` by hand.

The rest of `.claude/ship-loop/` (state / backlog / journal / decisions / value-case) stays
gitignored — agent working notes. **This file is the exception and is tracked**, matching the
repo's own rule for shared-skill overlays (AGENTS.md: "Project-specific configuration for a shared
skill lives in its committed overlay, e.g. `.claude/perfect/config.md`").

## Stack
Next.js 16.3.3 App Router (Cache Components on) + React 19 + TypeScript + Tailwind 4 · next-auth v5
beta with the Firebase adapter · firebase-admin · `@google/genai` (Gemini in prod, the Claude Code
CLI in dev, BYOM) behind ONE chokepoint `generateStructured` · Leonardo AI images. Dual store: prod
Firestore, local dev `node:sqlite` under `.data/` (`LOCAL_DB=true`). Authed product at `/app` with
per-project tenancy (tenant key embeds userId, so no classic IDOR); public marketing + demo surfaces
outside it. Harnesses: Playwright (`tests/`), `node:test` (`test-unit/`), the LLM contract gate
(`test-llm/`), `uat/` (Characters x journeys), `tiger/` (LLM call-site lens). Hosted on Vercel —
**push to master IS the release act** (Git integration ships it regardless of CI's verdict), so
`.husky/pre-push` runs `npm run check:ci` before any push to master.

## Cadence
milestone. Ship bar **SELLABLE**, set 2026-08-04 by the operator via `/mvp` run 1 (it had been unset
across all ten of the loop's earlier checkpoints). Monetization = free during validation.
UAT depth: L1 by default; L2 only when a milestone's journey demands live-browser proof.

## Gates (ordered - run top to bottom, sequentially)
`npm run check:ci` chains steps 1-9 in exactly this order and is what CI's `check` job runs, so a
milestone certification runs them individually only to get per-step evidence.

| step | command | ratchet | when / notes |
|------|---------|---------|--------------|
| typecheck | `npm run typecheck` | 0 errors | |
| lint | `npm run lint` | 0 errors | |
| build | `npx next build --webpack` | exits 0 | **`--webpack` in a worktree** — see Conventions. `npm run build` (Turbopack) is the canonical form on the main checkout and in CI. Test-only diffs may skip it. |
| seed | `npm run seed:check` | exits 0 | drift guard on the generated dataset |
| unit | `npm run test:unit` | 0 failed | `node:test` over `test-unit/**` |
| llm-gate | `npm run llm:gate:check` | exits 0 | STATIC + key-free: chokepoint coverage, `// llm-tool:` tags, contract goldens, BYOM rows |
| llm-quality | `npm run llm:quality:check` | exits 0 | floor on the baked scorecard |
| adr | `npm run adr:check` | exits 0 | |
| agent-surface | `npm run agents:surface` | unmapped <= 159 | ratcheted; hard-fails on a mapped `src/` path that no longer exists |
| sast | `npm run sast` | ratcheted | NOT in `check:ci`; own workflow. Exceptions go in `.github/security/sast-allowlist.json` with a reason |
| i18n | `node scripts/i18n-audit.mjs --check` | RATCHET in the script | **reporting rung** — prints, never blocks CI; `--check` fails only on a rise. Lower the baseline in the same commit as the fix; never raise it |
| e2e | `npx playwright test` | green | slow (~11 min serial, `workers: 1`); LAST. CI runs it key-free as the `e2e-smoke` job. Locally in a worktree: `E2E_PORT=3105 E2E_WEB_CMD="npx next dev --webpack --port 3105"` |

Notes: `npm run check` is the first three steps only. `npm run doctor` is env preflight, not a gate.
`npm run test:llm` / `npm run llm:quality` make real model calls — on demand, never in a gate.

## Value journeys (the ledger)
| tag | journey | what the loop certifies | owner Characters | docs |
|-----|---------|-------------------------|------------------|------|
| KAN | **find-free-channels** — the zero-budget core path | a URL (or an existing project) -> a grounded, RANKED plan of 6-9 named Czech-market free channels with fit/effort/rationale/payoff and 2-4 first actions -> the plan is PINNED and a per-channel decision survives a reload -> the same ONE visibility plan reads identically from `/kanaly` and `/klicova-slova` -> keyless is honest (the curated demo says so and is billed as demo; nothing pretends to be tailored) | Standa (pre-launch maker), Radek (bootstrapped consultant), Vojta (indie SaaS maker) | `uat/journeys/find-free-channels.md` · `docs/ship/2026-08-28-kanaly-core-path.md` |
| PPC | **react-to-flagged-campaign** — the paid measure -> triage path | live/seeded campaign data -> a summary that flags every rule breach -> worst-first ordering from the banner CTA -> a budget move applied as a governed, revertible, audited change-set whose ledger reflects the REAL per-move outcome (backlog 33) | Tomáš (PPC specialist), Ondřej (ad-ops manager), Petra (marketing manager) | `uat/journeys/react-to-flagged-campaign.md` · `act-on-budget-safely.md` · `prove-roi-this-month.md` |

- **Backlog tags**: `KAN | PPC | hyg`. Every item carries one. Milestones are the next coherent slice
  of ONE journey; `hyg` items enter a milestone only as blockers for that slice.
- **Hygiene tag convention**: `hyg` is for work that serves no journey directly — CI health, gate
  repair, dependency bumps, context-map drift, docs sync, LOC extraction. An item that makes a
  journey's step real is NOT hygiene, even when it looks like plumbing. When an item serves both,
  tag the journey and note the hygiene effect; when it serves both journeys, tag the one whose
  ledger light it moves. Backlog numbering is append-only — never renumber to fit a tag.
- Journey walk: reuse `uat/characters/*` (28 Characters) and `uat/journeys/*` (26 journeys). The two
  tags above are the journeys the loop tracks a readiness light for; the other 24 are UAT lenses.
- `.claude/ship-loop/value-case.md` (2026-07-02) is the market analysis, not a journey ledger.

## Dimensions (hygiene scorecard)
| # | name | what it means here |
|---|------|--------------------|
| 1 | Build & types | typecheck / lint / build green |
| 2 | Functional completeness | a journey's steps are real, not seeded stand-ins; seeded data says it is seeded |
| 3 | Tests | `test-unit` green + the load-bearing paths actually covered |
| 4 | Simulated UAT | `uat/` L1 runs, and L2 where a journey needs the live browser |
| 5 | Billing value | metering real + server-enforced; every failure actionable in the UI |
| 6 | Auth & security | tenancy, the durable rate limit + spend ceiling, `npm run sast` |
| 7 | UX/UI polish | design-system adoption, both themes, async feedback |
| 8 | Ops readiness | CI green, crons scheduled, serverless-safe stores, `docs/deploy.md` accurate |
| 9 | Value & market reality | `value-case.md`; re-open when positioning changes |

## Conventions
- **Worktree Turbopack deviation.** `node_modules` in `.claude/worktrees/*` is a junction to the main
  checkout's. Turbopack (the Next 16 default) does not survive that, so inside a worktree every dev
  and build invocation takes `--webpack`: `npx next dev --webpack --port 3105`,
  `npx next build --webpack`. `npm run dev` / `npm run build` are correct everywhere else, and CI
  uses the Turbopack form — so a worktree build proving green is evidence about the code, not about
  the bundler CI will use. Never `npm install` in a worktree.
- **Path-scoped commits, always.** `git add <paths>` then `git commit <same paths>`. Never `-A`,
  never a bare `git commit`, never stash or reset work that is not yours — this checkout usually has
  a concurrent agent in it. Prefer an isolated index seeded with `git read-tree HEAD` and keep the
  whole `add`+`commit` in ONE shell invocation.
- **The operator pushes.** A loop session commits; it never pushes and never touches the main
  checkout from a worktree. Pushing master ships to production (see Stack), and `.husky/pre-push`
  will run the full `check:ci` when it happens — so certify on HEAD, hand the operator the result,
  and let them push.
- **The llm-gate warm ritual is RETIRED** (df4c4b96, 2026-08-05). `llm:gate` is static and key-free
  now; touching a shared LLM file no longer triggers a ~10-minute real-model run before a commit.
  `.claude/ship-loop/state.md` CP10 still describes the old warm ritual — that note is stale, do not
  plan a milestone around it. Real-model proving is on demand: `npm run test:llm`,
  `npm run llm:quality`.
- **Components under 200 LOC preferred** — extract sub-components and data hooks. Debt is catalogued
  in `docs/roadmap/component-debt.md`. The agent-review rubric BLOCKS a component growing past 200.
- **A deleted test or a new runtime dependency needs `Ack: <why>`** in the commit message — the
  agent-review rubric has no off switch.
- **i18n parity is the type system** (`TDict`/`Messages`); there is no parity script and inventing one
  is a documented anti-goal. What typecheck cannot see is `npm run i18n:audit`.
- Read `context-map.json` at task start and scope edits to the relevant context's `file_paths`; it is
  an index, not an inventory (159 unmapped `src/` files at the last ratchet).
- Deploy / env / rollback / crons / the known-red ledger: `docs/deploy.md`.
- State dir: `.claude/ship-loop/` — gitignored except this file.

## Lenses
- **Journey lens** (boot + every CP), one per tag above: walk KAN and PPC as their owner Characters
  and record which step is not real yet. This replaces the generic value-market lens; `value-case.md`
  covers the market half and is re-run only when positioning changes.
- **Hygiene lenses** -> `hyg` items: build/CI health (is the `e2e-smoke` job actually green, and is a
  green run proving anything — see History); functionality honesty vs what the marketing surfaces
  claim; test coverage of load-bearing paths; security posture (`sast`, tenancy, the spend ceiling);
  ops path (crons, serverless-safe stores, `docs/deploy.md` accuracy).
- **Coverage-honesty lens** (added 2026-08-28, earned): for any gate reported green, ask what it
  would have to see to fail. Three separate specs were passing or silently skipping while unable to
  resolve a single locator on their own subject.

## History
- **Boot -> CP10, 2026-07-02/03** — 8 milestones, 14 commits, every boot-red dimension turned green;
  UAT L1 baseline (17 Character x journey, 0 pass / 16 conditional / 1 fail) -> backlog 30-39.
  Paused at a natural summit with the ship bar still unset. No overlay existed.
- **2026-08-04, `/mvp` run 1** — ship bar set to SELLABLE; landing/legal/Sentry/CI-unbrick/analytics/
  feedback/key-free-onboarding shipped; five operator-owned follow-ups recorded in the journal.
- **2026-08-05** — `DEFAULT_LOCALE` flipped `cs` -> `en` (22746f17) and the pre-commit real-model
  re-prove was retired (df4c4b96). The first of those quietly took `e2e-smoke` red for 22 days.
- **2026-08-28, milestone `kanaly-core-path`** — the free-channel path got its design record, a UAT
  journey, an e2e spec, the one-visibility-plan artifact, and a marketing surface. Certification of
  that milestone, and the `e2e-smoke` repair, are in `state.md` under 2026-08-28.
