# Performance Dataset & Seed — Ambiguity + Business scan
> Context: The reproducible seeded-PRNG generator and the committed JSON "database" (2 years of daily visits/cost/conversions/revenue + channel mix) that drives the dashboard.
> Files analyzed: 2
> Total findings: 5

## 1. Committed JSON has silently drifted from its generator — re-seeding wipes a hand edit
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/data/performance.json:7 (vs scripts/generate-data.mjs:121)
- **Problem/Opportunity**: The generator's own header (generate-data.mjs:8-9) promises "the committed JSON and the generator never drift." Yet commit `126adcc` hand-edited `client.managedBy` from `"Systedo"` to `"Adamant"` in the JSON only — the generator still emits `"Systedo"`. Running `npm run seed` would silently revert the agency name and overwrite the manual change. Nothing in CI or tests asserts that the committed file equals fresh generator output.
- **Why it matters**: The central selling point of this context (reproducibility, no drift) is already broken, and the next innocent `npm run seed` loses an intentional rebrand without warning.
- **Fix sketch**: Make the agency name a single constant in generate-data.mjs (e.g. `const AGENCY = "Adamant"`), re-run the seed so the file matches, and add a guard — a `npm run seed:check` that regenerates to a temp path and `diff`s against the committed JSON (fail on mismatch), wired into the test/CI run.

## 2. `goals.monthlyRevenue` (1.6M Kč) is unfounded and 85% below actual — a goal gauge would peg at 185%
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/data/performance.json:17 (vs scripts/generate-data.mjs:131)
- **Problem/Opportunity**: The seeded trajectory produces 2,966,686 Kč for the last full month (May 2026), but the committed target is `monthlyRevenue: 1_600_000` — actual is **185% of goal**. The constant carries no comment explaining its basis or as-of date, and the growth slopes (generate-data.mjs:65,76) were clearly tuned independently of it. Any "cíl splněn" / goal-progress widget reading these two numbers renders a nonsensical 185% bar. (PNO goal 15% vs 13.5% actual is consistent, by contrast.)
- **Why it matters**: A case study that shows a revenue goal beaten by 85% looks either misconfigured or like a deliberately lowballed target — both undermine the credibility the dashboard is meant to project.
- **Fix sketch**: Either derive `monthlyRevenue` from the generated series (e.g. round the trailing-3-month average down to a defensible target) or add an inline comment recording its origin and as-of month; keep it within ~5-10% of the seeded run-rate so progress widgets read plausibly.

## 3. Turn the hardcoded generator into a config-driven "case-study demo engine" for sales
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: scripts/generate-data.mjs:116-137 (client + goals + channels are all inline literals)
- **Problem/Opportunity**: Everything that makes this dataset specific — client name/domain/segment/currency, growth slopes, seasonality, channel list — is baked into one script. The agency's real, recurring need is bespoke pitch demos per prospect. Lifting the constants into a small config object (or `seed.config.json`) lets the same engine spin up a tailored, internally-consistent case study per prospect segment in minutes.
- **Why it matters**: Converts a one-off portfolio asset into a repeatable pre-sales tool, solving the concrete "we need a credible demo for THIS prospect" problem with no new infrastructure.
- **Fix sketch**: Extract the literals at lines 47-52, 65-80, 97-105, 116-132 into a `CONFIG` object at the top (with seed, segment, growth %, channel mix); accept a `--config <file>` arg; keep the current values as the default `mionelo` preset so existing output is unchanged.

## 4. Seasonality coefficients are commented for "baby-goods" but the client sells superfoods
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: scripts/generate-data.mjs:46 (vs segment at generate-data.mjs:119 / performance.json:5)
- **Problem/Opportunity**: The `SEASON` array is justified by the comment "A Czech baby-goods e-shop peaks before Christmas and in spring, dips mid-summer," yet the client segment is "ořechy, semínka a superpotraviny" (nuts/seeds/superfoods). The 12 monthly multipliers (and `SEASON_CR`) were evidently tuned for a different business, so the dataset's demand curve has no recorded rationale for the business it actually represents. The jitter scales (0.1/0.08/0.06) and floors (`Math.max(300…)`, `Math.max(1…)`) are likewise unexplained, and the seed `20260608` is duplicated at line 33 and line 127.
- **Why it matters**: A reviewer cannot tell whether the seasonality is intentional or copy-pasted, which erodes trust in the "believable story" the generator claims to tell.
- **Fix sketch**: Update the line 46 comment to the superfoods demand pattern (or confirm/adjust the coefficients for it), add one-line notes on the jitter scales and floors, and hoist the seed into a single `const SEED = 20260608` referenced by both mulberry32() and `meta.seed`.

## 5. Channel shares are frozen across two years — the budget-reallocation success story can't be told
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: scripts/generate-data.mjs:97-105
- **Problem/Opportunity**: Channel splits are static ratios applied to every period (comment at lines 93-96), so Meta prospecting's share is identical on day 1 and day 730. The most compelling agency narrative — "we cut inefficient Meta spend and grew efficient Heureka/Search, which is *why* PNO fell" — is invisible because no channel has a time dimension. The headline PNO improves but nothing explains the lever behind it.
- **Why it matters**: Channel-mix evolution is exactly the proof-of-value a prospect looks for; a flat mix leaves the dashboard's improvement story unattributed and less persuasive.
- **Fix sketch**: Give each channel start/end shares (or a small per-channel growth factor) and interpolate by `t` when distributing daily totals, re-normalising to sum to 1 each day (reuse the existing sanity check at lines 108-113); have shares shift toward efficient channels over the series so the PNO drop is causally legible.
