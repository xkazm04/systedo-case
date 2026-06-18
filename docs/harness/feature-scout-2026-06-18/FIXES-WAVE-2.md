# Feature Scout Fix Wave 2 — "Trustworthy analytics"

> 4 commits, 5 findings closed across 4 modules.
> Baseline preserved & strengthened: tsc 0 → 0 · `next build` pass → pass ·
> unit tests **7 → 21** (+14 new correctness tests, all green) · eslint 0.
> Branch: `vibeman/feature-scout-wave1` (continues from Wave 1). The user's
> pre-existing uncommitted work was left untouched.

## Theme

Where Wave 1 wired up *missing actions*, Wave 2 fixes *misleading or shallow
numbers* — the items where the module showed a figure that was premature,
averaged-away, un-actionable, or un-ownable. Every change is pure compute + UI
(no new LLM tool → no `llm-gate` real-Claude run), and every compute change ships
with unit tests so the math is locked.

## Commits

| # | Commit | Module | Finding(s) | Files |
|---|---|---|---|---|
| 1 | `b039d34` | lp-experiments | lp-experiments.md #1 + #2 | `lib/lp-exp/compute.ts`, `LpExperimentsModule.tsx`, `test-unit/lp-exp.test.mjs` (new) |
| 2 | `bb58047` | ltv | ltv.md #2 | `lib/ltv/compute.ts`, `lib/ltv/sample.ts`, `LtvModule.tsx`, `test-unit/ltv.test.mjs` |
| 3 | `91ca2aa` | profit | profit.md #1 | `lib/profit/compute.ts`, `lib/profit/types.ts`, `ProfitModule.tsx`, `test-unit/profit.test.mjs` |
| 4 | `a73a84f` | compare-seo | compare-seo.md #3 | `lib/seo-compare/compute.ts`, `CompareSeoModule.tsx`, `CompareSeoTable.tsx`, `test-unit/seo-compare.test.mjs` (new) |

## What was fixed

1. **LP experiments — significance you can trust.** The compute scored a fixed-horizon z-test on *every* experiment, so a 60/1500-visitor running test got a winner pill like a finished one, and 3-arm tests over-declared winners. Added a pure `requiredSampleSize()` (two-proportion formula + an inverse-normal `zFor`), a per-experiment `progress`, a winner-pill **gate** behind reaching target N ("Sbírá data — 62 %"), and a **Šidák** alpha correction for >2 variants (surfaced in the UI). +6 tests.
2. **LTV — per-channel CAC & payback.** CAC was blended-only, averaging away which channel actually pays back. Added an optional per-cohort channel breakdown, derived per-channel CAC / payback / LTV:CAC and a **paid-only CAC** beside blended, rendered a spend-weighted channel table, and added a NextSteps link to Kampaně. Cohorts without a breakdown fall back to blended (no regression). +2 tests (channel sums reconcile to blended).
3. **Profit — quantify the fix, not just the problem.** Added a pure `reallocateBudget()` solver (hold each channel's ROAS constant; greedily allocate by marginal profit `roas×margin−1`, capped at 3× current spend, drain loss-makers) and a **"Co kdyby"** panel showing projected net profit vs today with per-channel +/− spend and a strategy toggle. +2 tests (respects budget+cap, never lowers max-profit net, drains loss-makers).
4. **Compare-seo — an ownable opportunity score.** The intent weights and tier cutoffs were hardcoded. Parameterized `scoreQueries(queries, weights = DEFAULT_SCORE_WEIGHTS)`, moved scoring to the client child so a new **„Ladění skóre"** panel re-ranks live, persisted per project in `localStorage`. Default behavior unchanged; the Wave-1 brief-seed handoff preserved. +3 tests.

## Verification (before → after)

| Gate | Wave-1 end | Wave-2 end |
|---|---|---|
| `tsc --noEmit` | 0 | **0** |
| `next build` | pass | **pass** |
| `npm run test:unit` | 7/7 | **21/21** (+14) |
| `eslint` (changed) | 0 | **0** |

## Patterns established (catalogue, continued)

7. **Ship compute changes with tests.** Every pure-function addition (`requiredSampleSize`, `reallocateBudget`, per-channel CAC, weighted `scoreQueries`) got a `test-unit/` test asserting a hand-computed value or an invariant (budget cap, sum reconciliation, default-equivalence). The suite tripled (7→21) and now guards the analytics.
8. **Parameterize with a defaulted argument to stay backward-compatible.** `scoreQueries(queries, weights = DEFAULT)` adds tunability without breaking callers or the existing test — the no-arg path must byte-match prior output (asserted by a test).
9. **Optional data + graceful fallback for "deepen the model" features.** LTV's `channels?` breakdown is optional; cohorts without it degrade to the prior blended behavior, so the feature adds depth without a migration or a regression.
10. **Move scoring to the client when a control must re-rank live**; keep the server component a thin shell that hands raw data + defaults to the client child. Read `localStorage` in a lazy `useState` initializer / effect, never bare during render (React-Compiler lint).

## What remains (next waves, per INDEX)

- **AI-assist wave** (needs a verified Claude CLI for the `llm-gate`): distribution #1, speed-lead #1, local #2, content-engine #2, lp-experiments #3 (variant generator), ltv #4 (AI cohort diagnosis), compare-seo #5 (comparison-page generator).
- **Cross-module handoffs / NextSteps** (Theme B): lp #5 ship-the-winner, audience NextSteps, speed-lead #5 analytics+NextSteps.
- **Deeper analytics** still open: profit #2 (SKU margins), profit #3 (trend), ltv #1 (retention curve) / #3 (horizon slider), keywords #2 (SERP gap), compare-seo #2/#4 (competitor + rank-tracking).
- **Real integrations** (Theme E), **Alerts/trends** (Theme F), **Settings/admin** (Theme G).
