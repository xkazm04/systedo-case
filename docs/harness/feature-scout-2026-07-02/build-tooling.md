# Feature Scout — Build & Tooling Config (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs, lint-staged.config.mjs, playwright.config.ts, .husky/pre-commit, .github/workflows/ci.yml, .gitattributes, README.md, .env.example

## 1. Poison every Node-bound server module with the `server-only` package
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none (scope explicitly excludes the HASHED_FILES set — touching `src/lib/llm/*` or `src/lib/ai/tools/*` would make it [GATE])
- **Category**: functionality
- **File**: `package.json:31` (dependencies — `server-only` absent)
- **Opportunity**: The repo's most-repeated landmine (hit in F2 and again in T2, per harness-learnings) is a `"use client"` file importing a runtime value from a firebase-admin/node:fs/node:sqlite module — tsc and unit tests pass, and the failure only surfaces as a cryptic Turbopack chunk-codegen error in `next build`. Several modules *claim* "server-only" in prose comments (`src/lib/db.ts:1`, `src/lib/campaigns/store.ts:1`, `src/lib/ai/rate-limit.ts:1`) but the `server-only` package is never actually imported anywhere, so nothing enforces the boundary.
- **Why valuable**: Converts a late, cryptic CI-build failure into an immediate, clearly-worded error in `next dev` — the exact class of bug the team has already paid for twice. Also makes the existing `*-types.ts` pure/impure split convention self-enforcing for future waves.
- **Build sketch**: Add the (zero-byte) `server-only` dependency and `import "server-only";` at the top of the non-hashed Node-bound modules: `src/lib/db.ts`, `src/lib/design-tokens.ts`, `src/lib/campaigns/store.ts`, `src/lib/social/store.ts`, and the firestore/images stores. Deliberately skip the HASHED_FILES (`src/lib/llm/*`, `src/lib/ai/tools/*`, the two API routes) to stay commit-safe without a ~340 s gate run — the chokepoint means client code never imports those directly anyway. Verify with one full `next build`; document the convention in README's project-structure section.

## 2. Wire the existing `seed:check` drift guard into CI and lint-staged
- **Impact**: 6/10
- **Effort**: 1/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: automation
- **File**: `package.json:18` (`seed:check`); `scripts/generate-data.mjs:153-154`
- **Opportunity**: `scripts/generate-data.mjs --check` already fails when the committed `src/data/performance.json` no longer matches the seeded-PRNG generator — but nothing ever runs it: not CI (`.github/workflows/ci.yml`), not the pre-commit hook, not `npm run check`. The README's whole "Data: jak vznikají a proč jsou konzistentní" pitch (metrics always reconcile: konverze × AOV = hodnota, náklady/obrat = PNO) rests on this invariant, and dashboard, article snapshot, and M1 microsites all read that JSON.
- **Why valuable**: A hand-edit to `performance.json` (or a generator tweak committed without re-seeding) silently breaks the "čísla vždy sedí dohromady" story the case study sells; today only a human would notice.
- **Build sketch**: Add a "Data drift guard" step to ci.yml after unit tests: `run: npm run seed:check` (deterministic, key-free, <1 s). In `lint-staged.config.mjs`, add a targeted entry `"{scripts/generate-data.mjs,src/data/performance.json}": [() => "npm run seed:check"]` so the guard runs at commit time only when the generator or its output is actually staged. Neither file is in the LLM hash set — commit-safe.

## 3. Add a `check:ci` script so one local command reproduces the full CI gate
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `package.json:16` (`check`); `lint-staged.config.mjs:11`
- **Opportunity**: ci.yml honestly documents that it is "NOT a full mirror" of pre-commit — CI runs `check` + `test:unit` + `test:llm:coverage` + `llm:eval --strict` as four separate steps, while locally there is no single command that runs that set. A dev who wants to know "will CI pass?" must copy step names out of the workflow file. Additionally, lint-staged only covers `*.{ts,tsx}`, so staged edits to the 26 `test-unit/*.test.mjs` files and `scripts/*.mjs` skip ESLint at commit and can fail CI's repo-wide `npm run lint`.
- **Why valuable**: Eliminates the documented "green local commit can still fail CI" gap for everything except the intentionally-local real-Claude run — one command, zero guesswork before pushing.
- **Build sketch**: Add `"check:ci": "npm run check && npm run test:unit && npm run test:llm:coverage && npm run llm:eval -- --strict"` to package.json and replace ci.yml's four run steps with `npm run check:ci` so the two can never drift again (keep them as separate named steps only if per-step CI timing matters — then note in the script's comment they must stay in sync). Widen lint-staged to `"*.{ts,tsx,mjs}": ["eslint --fix"]` (keep the `tsc --noEmit` function on ts/tsx only). Mention `check:ci` in README's Rychlý start block.

## 4. Run the key-free Playwright specs as a CI smoke lane
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: none (explicitly does NOT exercise the LLM provider paths — the gate-locked "prove Gemini in CI" follow-up stays untouched)
- **Category**: automation
- **File**: `playwright.config.ts:26-31` (webServer); `.github/workflows/ci.yml:30-46`
- **Opportunity**: The repo carries a 5-spec Playwright suite (`tests/`) plus `test:e2e` scripts, an HTML reporter, and a CI-aware `reuseExistingServer: !process.env.CI` flag — yet nothing automated ever runs it. Three specs (`clanek-anchors`, `dashboard-comparison`, `design-system`) are fully key-free, and the two keyed ones (`ai-asistent`, `kampane-triage`) already skip their model tests when `GEMINI_API_KEY` is absent, leaving structural + demo-mode + timeout coverage that runs fine without any secret.
- **Why valuable**: This is the only layer that catches whole-page runtime regressions (broken anchors, hydration errors, demo-mode fallbacks) that tsc, unit tests, and even `next build` all miss — the suite exists, it just never fires.
- **Build sketch**: Add an `e2e-smoke` job to ci.yml (needs: check): `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e` with no `GEMINI_API_KEY` in env, uploading `playwright-report/` as an artifact on failure. Suite is serial (`workers: 1`) and the timeout spec deliberately waits out the 60 s ceiling, so budget ~5 min; if that bites, tag the timeout spec `@slow` and grep-invert it in CI. Optionally parametrize `webServer.command` via `process.env.E2E_WEB_CMD` so CI can point it at `next start` after a build instead of the dev server.

## 5. Ship an `npm run doctor` preflight that maps env vars to enabled product surfaces
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: feature
- **File**: `.env.example:6-108` (the seven env sections); `package.json:8-29` (scripts)
- **Opportunity**: The app is really six products behind one env matrix — public site, AI tools (Claude-CLI dev / Gemini prod / demo mode), `/app` workspace (Auth.js + Firestore, or `DEV_AUTH`+`LOCAL_DB` offline), cron+alerts (Resend/webhook), Creative Studio (Leonardo + Gemini vision + RAG), and live Google Ads. `.env.example` documents ~20 variables across seven sections, several with cross-dependencies (vision model defaults to `GEMINI_MODEL`; `LOCAL_DB` needs `seed:local`; Firestore needs `.data/firebase-sa.json` *or* `FIREBASE_SERVICE_ACCOUNT`), but the only way to know what a given `.env.local` actually enables is to read SETUP.md and guess — misconfiguration surfaces as silent demo-mode or a runtime 500.
- **Why valuable**: For a portfolio repo whose reviewers clone-and-run, a one-command "here is what's enabled, here is why the rest is in demo mode" readout is the difference between showing off the cloud product and the reviewer never finding it.
- **Build sketch**: New `scripts/doctor.mjs` (pure Node, no deps) + `"doctor": "node scripts/doctor.mjs"`. Load env via `@next/env`'s `loadEnvConfig` exactly like `playwright.config.ts:6` does, then print a surface × status table: Node version vs `engines` (`>=22.5`, node:sqlite), `claude` CLI present/logged-in (spawn `claude --version`), `GEMINI_API_KEY`/`GEMINI_MODEL`, `AUTH_SECRET`+`GOOGLE_CLIENT_*` pair, `GOOGLE_CLOUD_PROJECT` + service-account file presence, `CRON_SECRET`/`RESEND_API_KEY`, `LEONARDO_API_KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, plus the `DEV_AUTH`/`LOCAL_DB` offline path (and whether `.data/systedo.db` is seeded). Each row ends with the fix hint already written in `.env.example`'s comments — reuse that copy verbatim. Reads env only; touches no hashed file; one line in README's Rychlý start.
