# Build & Tooling Config — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Playwright e2e suite exists but never runs in CI — invisible to reviewers
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: `.github/workflows/ci.yml`, `playwright.config.ts`, `tests/*.spec.ts`
- **Opportunity**: Five real e2e specs (`ai-asistent.spec.ts`, `clanek-anchors.spec.ts`, `dashboard-comparison.spec.ts`, `design-system.spec.ts`, `kampane-triage.spec.ts`) and a tuned Playwright config ship in the repo, but CI runs only `npm run check` + `test:llm:coverage`. The single most impressive QE artifact in the project is never exercised by the pipeline and produces no visible signal (no badge, no report artifact).
- **Value**: For a portfolio/case-study repo, a green "E2E" check and an uploaded Playwright HTML report are exactly what a technical reviewer scans for — proof the candidate writes tests that actually run. Right now that effort is dark. Wiring it in is the highest-leverage credibility win in this context.
- **Effort**: M
- **Fix sketch**: Add a second CI job that runs `npx playwright install --with-deps chromium` then `npm run test:e2e` with `GEMINI_API_KEY` from secrets (config already skips model tests when the key is absent, so the structural + timeout tests still run key-free). Upload `playwright-report/` via `actions/upload-artifact`; add an "e2e" badge to `README.md`.

## 2. README ↔ codebase drift: "no database / no auth / Vercel-ready" no longer true
- **Severity**: High
- **Lens**: Business Visionary
- **Category**: differentiation
- **File**: `README.md`, `SETUP.md`, `.env.example`, `package.json`
- **Opportunity**: The README's headline pitch ("Data bez databáze", "Deploy — žádná databáze ani další konfigurace nejsou potřeba", AI key as the only optional env var) contradicts the current dependency set: `next-auth`, `firebase-admin`, `@auth/firebase-adapter`, `node:sqlite`, and Google Ads OAuth — all documented only in a separate `SETUP.md` the README never links. A reviewer reading top-to-bottom sees a clean static-site story, then trips over `AUTH_SECRET`, Firestore, and `.data/systedo.db`.
- **Value**: For a hiring-manager-facing artifact, internal inconsistency reads as carelessness and erodes trust faster than a missing feature. Reconciling the narrative — and framing the auth/Ads layer as a deliberate "production seam" rather than an undocumented surprise — turns a liability into a maturity signal.
- **Effort**: S
- **Fix sketch**: Update the "Proč Next.js" and "Nasazení" sections to acknowledge the optional cloud tier (Auth.js + Firestore + live Google Ads), link `SETUP.md` from the README, and clearly delimit the zero-config static core (`/dashboard`, `/clanek`, `/ai-asistent`) from the stateful `/kampane` + auth path.

## 3. No env-var validation — misconfiguration fails opaquely at runtime
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: `.env.example`, `src/lib/llm/index.ts`, `src/auth.ts`, `src/lib/firebase.ts`, `src/lib/google/*`
- **Opportunity**: Eleven-plus env vars (`GEMINI_API_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_ADS_*`, the `AI_RATE_*` budget knobs) are read directly via `process.env` across ~10 files with no central schema. A typo or missing `AUTH_SECRET` surfaces as a deep stack trace (or silent demo-mode fallback), and the documented numeric rate-limit knobs get no parse/range validation.
- **Value**: A typed env module is a small, recognizably-senior touch: it fails fast with a readable message, documents the contract in code, and gives the `AI_RATE_*` budget controls real guardrails. It also de-risks the Vercel deploy path the README promotes.
- **Effort**: S
- **Fix sketch**: Add `src/lib/env.ts` that parses/validates `process.env` once at boot (Zod or a hand-rolled guard), coercing the `AI_RATE_*` numbers and asserting `AUTH_SECRET` when auth is enabled; import the typed object instead of raw `process.env` in `llm/index.ts`, `auth.ts`, and the rate-limit module.

## 4. No deploy/preview pipeline or live demo link — a case study with no front door
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: growth
- **File**: `.github/workflows/ci.yml`, `README.md` (no `vercel.json`)
- **Opportunity**: The README sells Vercel deployability but there is no preview-deploy workflow and no live URL anywhere in the repo (badges cover stack/quality-gate only). A reviewer must clone and `npm run dev` to see anything — the highest-friction possible path for a portfolio piece whose whole value is "look at the working product."
- **Value**: A one-click hosted demo (plus per-PR preview links) is the difference between a reviewer experiencing the dashboard/AI assistant in 10 seconds versus not at all. This is the top growth/conversion lever for a case study whose audience is busy evaluators.
- **Effort**: M
- **Fix sketch**: Add a Vercel preview-deploy step (Vercel GitHub app or `amondnet/vercel-action`) gated behind the existing `check` job; surface the production URL as a prominent README badge/button and in `NEXT_PUBLIC_SITE_URL`. Static core deploys cleanly; document that `/kampane` needs the stateful tier.

## 5. No performance / a11y / bundle gate — "quality engineering" pitch stops at typecheck
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: `.github/workflows/ci.yml`, `package.json`, `next.config.ts`
- **Opportunity**: The composite `check` gate (typecheck → lint → build) plus the LLM coverage gate is genuinely strong, but for a project explicitly demonstrating front-end craft there is no Lighthouse run, no bundle-size budget, and no automated accessibility pass — despite content (`/clanek`) and dashboards that are natural a11y/perf showcases.
- **Value**: Lighthouse/a11y/bundle gates are exactly the "I care about the things production teams care about" signals that separate a strong case study from a generic one. They are cheap to add and produce shareable scores/badges that reinforce the differentiation story.
- **Effort**: M
- **Fix sketch**: Add a CI job running `treosh/lighthouse-ci-action` against the preview/build (assert perf + a11y budgets in a `lighthouserc.json`), or `@axe-core/playwright` assertions inside the existing e2e specs; optionally wire `@next/bundle-analyzer` into `next.config.ts` behind an `ANALYZE` flag and fail on a size budget.
