# Feature + Moonshot Scan — Build & Tooling Config

> Context: ctx_1781547850591_zfe2las
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Make the quality pipeline visible: CI status + quality badges in the README

- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: S (<1d)
- **File**: `README.md:1` (header) + `.github/workflows/ci.yml`
- **Scenario**: This repo is a job-application case study. A reviewer (hiring manager) skims the README first. The project has a genuinely strong pipeline — composite `check` gate, Husky pre-commit, lint-staged, GitHub Actions mirroring `npm run check`, a prove-once LLM gate, Playwright visual regression — yet **none of it is signalled at the top of the README**. The pipeline is the single most impressive engineering artifact here, and it is invisible until you read 170 lines deep.
- **Opportunity**: Add a badge row directly under the H1 in `README.md`: CI status (live shield from the `CI` workflow), Node version, Next.js 16 / React 19 / TypeScript strict, and a custom "LLM gate: prove-once" badge. Add a short "Quality pipeline" section near the top (a 4-line bullet list) that links down to the existing detailed sections, so the engineering rigor is the *first* thing a reviewer sees, not a footnote. Because `on:` in `ci.yml` already fires on `push` and `pull_request`, the GitHub status badge works immediately with zero workflow changes.
- **Impact**: Converts hidden engineering investment into an immediate signal for the exact audience this repo is built for. Near-zero effort, disproportionate payoff for a portfolio piece.
- **Implementation sketch**: Add a `name:` already exists (`CI`) → badge URL `https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg`. Insert badge markdown after line 1 of `README.md`; add a "## Kvalita & CI" section after "## Rychlý start" linking to the existing "Test suite + pre-commit brána" and "Testy (Playwright E2E)" sections. Add static shields for Node 22 / Next 16 / TS strict.

## 2. Run the full gate (Playwright + LLM coverage) in CI, not just typecheck/lint/build

- **Severity**: High
- **Lens**: feature-scout
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `.github/workflows/ci.yml:26` (`npm run check`) + `playwright.config.ts` + `scripts/llm-gate.mjs`
- **Scenario**: `ci.yml` runs only `npm run check` = `typecheck && lint && build`. But the repo's two most distinctive assets — the **deterministic Playwright visual-regression baseline** (`tests/design-system.spec.ts`, explicitly designed to need no API key) and the **static LLM coverage gate** (`npm run test:llm:coverage`, which has no model dependency) — never run on CI. Today they only fire locally via Husky. A contributor on a machine that skips hooks, or a PR from a fork, gets a green CI that didn't actually exercise the project's signature guarantees.
- **Opportunity**: Add CI jobs for the **deterministic, key-free** checks. (a) A `design-system` Playwright job that installs browsers (`npx playwright install --with-deps chromium`) and runs `npm run test:e2e -- design-system`, uploading the HTML report and any diff artifacts. (b) An `llm-coverage` job running `npm run test:llm:coverage` (the static "every call site is tagged + has a test" contract — no real model call). Keep the real-model `test:e2e`/`test:llm` runs out of CI (they need credentials), matching the README's stated design. This closes the gap between "the pipeline exists" and "CI proves it."
- **Impact**: CI now guarantees the visual baseline and LLM-coverage contract on every PR, including forks where Husky never runs. Turns the README's claims into machine-enforced truth — exactly what a senior reviewer probes for.
- **Implementation sketch**: In `ci.yml` add two jobs alongside `check`. For Playwright: cache `~/.cache/ms-playwright`, run `npx playwright install --with-deps chromium`, then `npm run test:e2e -- design-system`; `actions/upload-artifact` for `playwright-report/`. For LLM coverage: just `npm run test:llm:coverage`. Set `E2E_PORT` env to avoid the 3100 default clash if needed.

## 3. Add dependency & supply-chain scanning (Dependabot + npm audit gate)

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: S (<1d)
- **File**: `package.json:21` (deps) + new `.github/dependabot.yml` + `.github/workflows/ci.yml`
- **Scenario**: The repo has zero dependency-hygiene automation. There is no `.github/dependabot.yml`, no `npm audit` step, no `engines`/`.nvmrc` pin (CI hardcodes Node 22 in `ci.yml:20` while `playwright.config.ts` assumes Node-bundled `node:sqlite` from 22.5+/24 — a version contract that lives only in prose in the README). For a case study explicitly about "production-grade vzor pro práci s AI," demonstrating supply-chain awareness is on-brand and cheap.
- **Opportunity**: (a) Add `.github/dependabot.yml` for `npm` (weekly) + `github-actions` ecosystems so the pinned `next 16.2.7` / `eslint-config-next` / Playwright versions get tracked PRs. (b) Add a non-blocking `npm audit --audit-level=high` step (or `audit-ci`) as its own CI job so vulnerabilities surface without breaking unrelated PRs. (c) Codify the Node contract: add `"engines": { "node": ">=22.5" }` to `package.json` and an `.nvmrc` (`22`), so the `node:sqlite` requirement is enforced, not just documented.
- **Impact**: Demonstrates supply-chain and runtime-contract discipline — a differentiator for an "AI Vibecoder" role — and prevents silent drift on the pinned framework versions. Removes the "Node version lives only in the README" footgun.
- **Implementation sketch**: Create `.github/dependabot.yml` with two `updates` entries (`package-ecosystem: npm` and `github-actions`, `schedule: weekly`). Add an `audit` job to `ci.yml` running `npm ci` + `npm audit --audit-level=high`. Add `engines` to `package.json` and a root `.nvmrc`. Optionally feed the Node value from `.nvmrc` into `setup-node` via `node-version-file: .nvmrc`.

## 4. Performance & accessibility budgets in CI (Lighthouse CI + a11y) — the case study graded against itself

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `.github/workflows/ci.yml` (new `lighthouse`/`a11y` jobs) + `next.config.ts` + README "Proč Next.js" section
- **Scenario**: The README makes explicit performance & SEO *claims* — server-rendered content pages, indexable article with `Article`+`FAQPage` JSON-LD, "interaktivní je jen dashboard a AI nástroj." It's a **marketing-analytics** product whose whole pitch is measurable outcomes (PNO, conversion value). Yet nothing measures the case study's *own* Lighthouse, bundle size, or accessibility. A marketing-analytics portfolio that doesn't instrument itself is a missed thematic open goal.
- **Opportunity**: Add Lighthouse CI (`@lhci/cli`) against a production build, with asserted budgets on Performance / Accessibility / SEO / Best-Practices and a bundle-size budget, run on PRs. Pair it with an automated a11y pass (Playwright + `@axe-core/playwright`) over the deterministic key-free routes (`/`, `/dashboard`, `/clanek`, `/design-system`). Surface the scores **back into the README** as live/last-run badges — so the case study is literally graded on the metrics it preaches. The deterministic, DB-free pages (`/`, `/dashboard`, `/clanek`) and the seeded `performance.json` make this stable to assert against.
- **Impact**: Transforms the build pipeline into a self-referential demo: "this marketing-analytics app measures its own performance, accessibility, and SEO the way it measures the client's campaigns." That narrative is a category-defining differentiator for the role, far beyond a generic green check.
- **Implementation sketch**: Add `lighthouserc.json` with `assert.assertions` budgets + `collect.url` for the static routes; new `lighthouse` job in `ci.yml` (`npm run build` → `npx lhci autorun`). Add `@axe-core/playwright`; a new `tests/a11y.spec.ts` looping the key-free routes asserting zero serious violations; wire it into the Playwright CI job from idea #2. Publish results as a job summary + README badge.

## 5. Extract a reusable "AI Case-Study Starter" template from this pipeline

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: feature
- **Effort**: L (>3d)
- **File**: whole context — `package.json` scripts, `scripts/llm-gate.mjs`, `.husky/pre-commit`, `lint-staged.config.mjs`, `playwright.config.ts`, `.github/workflows/ci.yml`, `.env.example`
- **Scenario**: The genuinely novel, hard-won assets here are not the marketing pages — they're the **tooling primitives**: the prove-once LLM gate (hash-cached real-model tests via `scripts/llm-gate.mjs`), the call-site coverage contract (`// llm-tool:` tags + registry), the dev-Claude-CLI / prod-Gemini provider switch behind one `generateStructured()` chokepoint, the key-free deterministic Playwright visual baseline, and the composite `check` gate mirrored locally (Husky/lint-staged) and in CI. Anyone building an LLM-backed Next.js app would want exactly this scaffolding — and right now it's welded to one Czech marketing case study.
- **Opportunity**: Extract a `create-ai-case-study` (or GitHub **template repo** + `degit` target) that ships the pipeline decoupled from the demo content: the LLM wrapper seam with the provider switch, the `llm-gate.mjs` prove-once mechanism + coverage registry, the Husky/lint-staged/`check`/CI quad, and the deterministic-page Playwright harness — with the four marketing routes replaced by a single example tool. Document the "tagged call site → registry → prove-once" pattern as the headline feature. Optionally publish `llm-gate` as a standalone tiny package since it's already a self-contained `.mjs` with a versioned `.llm-gate-cache.json`.
- **Impact**: 10x force multiplier: the case study stops being one-off and becomes a *platform artifact* others adopt — the strongest possible signal for an "AI Vibecoder" who builds reusable AI-dev infrastructure, not just apps. The prove-once gate alone is a publishable, blog-worthy idea.
- **Implementation sketch**: Create a `template/` branch or sibling repo; parameterize app name and routes; replace `src/lib/gemini.ts` tool layer with one example tool keeping the `// llm-tool:` tag + registry entry. Lift `scripts/llm-gate.mjs`, `test-llm/` scaffolding, `.husky/pre-commit`, `lint-staged.config.mjs`, `playwright.config.ts` (design-system baseline as the example), and `ci.yml` verbatim. Add a generator `README` explaining the provider switch (`.env.example`) and the prove-once cache. Stretch: split `scripts/llm-gate.mjs` into an `npx`-runnable bin.

---

> Notes on grounding: All five ideas build on artifacts verified present — `scripts/llm-gate.mjs`, `tests/{ai-asistent,clanek-anchors,dashboard-comparison,design-system,kampane-triage}.spec.ts` (visual-regression baseline in `design-system.spec.ts`), single `.github/workflows/ci.yml` (Node 22, runs only `npm run check`), Husky `pre-commit` → `lint-staged` + `llm-gate`, and `.env.example` provider config. Confirmed **absent**: any CI badge in README, LICENSE, `.nvmrc`/`engines`, Dependabot/Renovate, Lighthouse/bundle budget, a11y CI, and any CI execution of Playwright or the LLM coverage gate.
