# Feature Scout — LP experimenty (`/app/[projectId]/experimenty-lp`)

> Module: src/components/app/modules/LpExperimentsModule.tsx
> Project type: app
> Total: 5 ideas

## 1. Sample-size & duration estimator (a "trust gate" before reading results)
- **Category**: functionality
- **Impact**: 9
- **Effort**: 4
- **Risk**: 3
- **Gap today**: `compute.ts` computes a frequentist z-test confidence live on every experiment, including `status: "running"` ones (`evaluate` runs unconditionally; `sample.ts` has no target sample size or start date). There is no notion of "is this experiment even big enough to read yet?" — a running test with 60/1500 visitors gets a confidence pill the same way a finished one does.
- **Proposal**: Add a pure `requiredSampleSize(baselineCvr, mde, alpha=0.05, power=0.8)` helper (standard two-proportion formula, reusing the existing `normalCdf`) and a `progress` field per experiment = `min(visitors)/requiredPerArm`. Add `startedAt` to `LpExperiment` and derive expected days-to-significance from current daily traffic. Render a progress bar + "Potřeba ~N návštěvníků/varianta · odhad X dní" line, and gate the winner pill behind reaching target N (show "Sbírá data — 62 %" instead of a premature "Vede, zatím neprůkazné").
- **User value**: Stops marketers from killing tests early or trusting noise; sets expectations ("come back in ~9 days") instead of refreshing a flickering confidence number.
- **Fit**: Pure-function, JSON-data extension exactly matching the module's existing stats style; directly hardens the CVR-winner promise in the registry blurb.

## 2. Peeking guard + sequential-testing correction
- **Category**: functionality
- **Impact**: 8
- **Effort**: 5
- **Risk**: 4
- **Gap today**: `evaluate` uses a fixed `confidence >= 0.95` threshold (`compute.ts:62`) with a one-shot two-proportion z-test, and it is recomputed on running experiments — the classic "peeking" trap where repeatedly checking a fixed-horizon test inflates false positives. Multi-variant experiments (e.g. `exp-crm` with B and C) also compare each challenger to control with **no multiple-comparisons correction**, so a 3-arm test over-declares winners.
- **Proposal**: For `running` experiments, replace the naïve threshold with an always-valid sequential bound — either an alpha-spending (O'Brien-Fleming-style) adjusted threshold keyed on `progress` from idea #1, or a Bayesian "probability variant beats control" (Beta-Binomial, simulatable purely). Apply a Šidák/Bonferroni adjustment to alpha when `variants.length > 2`. Surface the corrected basis in the UI ("upraveno pro 2 varianty + průběžné čtení").
- **User value**: The "Vítěz" pill becomes statistically honest under real usage patterns (people peek; tests have 3 arms), preventing rollout of a fake winner.
- **Fit**: Lives entirely in `lib/lp-exp/compute.ts` alongside the existing `confidenceBetween`; the `insights/aggregate.ts` "Nasadit vítěze" recommendation (line 76) immediately inherits the more trustworthy gate.

## 3. AI variant & hypothesis generator from keyword clusters
- **Category**: feature
- **Impact**: 8
- **Effort**: 6
- **Risk**: 4
- **Gap today**: The module's own footer admits the gap: "Varianty lze generovat z klastrů klíčových slov (modul Srovnání & SEO + Obsah)" — but nothing generates them. Variants are hand-authored strings in `sample.ts` (`"B · Důraz na šablony"`); there is no link from a keyword cluster to a proposed LP variant or a stated hypothesis.
- **Proposal**: Add an `llm-tool: lp-variant-ideas` that takes a cluster + the project's SEO query data (`lib/seo-compare/sample.ts` is already imported by `insights/aggregate.ts`) and returns 2–3 challenger variant concepts, each as `{label, hypothesis, headline, primaryCTA, rationale}` via `generateStructured` (schema + `demo()` deterministic fallback, per the wrapper contract). Render them as draftable "challenger" cards on a `running`/new experiment, with a "create variant" action.
- **User value**: Turns an empty experiment into a ready-to-run test in one click, grounded in the user's actual ranking keywords — the productive power-user shortcut from cluster → testable LP.
- **Fit**: Uses the single mandated `src/lib/llm` chokepoint and the established structured-generation pattern; realizes the cross-module wiring (Srovnání & SEO + Obsah → LP) that the module text already promises.

## 4. Experiment archive with a searchable learnings library
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 5
- **Risk**: 2
- **Gap today**: There is no history at all — `SAMPLE_EXPERIMENTS` is a flat list and the module renders running + done together with no archive, no "what did we learn", no past-winner memory. A `done` experiment just shows a static bar; its insight evaporates once a new test starts.
- **Proposal**: Split the view into "Běžící" and "Archiv". For archived experiments, capture an outcome record `{winner, upliftAdopted, learning, decision: shipped|inconclusive|reverted, closedAt}` and a one-line learning note (auto-drafted by reusing the AI tool from #3, user-editable). Add a small "Knihovna poznatků" panel that lists past learnings filterable by cluster/decision, so patterns ("kratší formulář vyhrál 3×") surface. Persist to the repo-JSON convention used elsewhere.
- **User value**: Institutional memory — teams stop re-running tests they already answered and can cite a track record of CVR wins.
- **Fit**: Matches the JSON-in-repo data convention and the `status: "done"` lifecycle already in the model; complements idea #1's lifecycle dates.

## 5. Ship-the-winner handoff + NextSteps cross-linking
- **Category**: feature
- **Impact**: 6
- **Effort**: 3
- **Risk**: 2
- **Gap today**: A significant winner is a dead end. The module renders the winner pill and stops; there is no `NextSteps` strip (the shared `NextSteps.tsx` component is unused here), no per-variant LP URL, and no path from "B won" to acting on it — even though `insights/aggregate.ts:77` already emits a "Nasadit vítěze" opportunity that the user can't follow up on inside this module.
- **Proposal**: Add a `winnerUrl`/`variantUrl` field and a `NextSteps` strip on each resolved experiment routing to the relevant downstream module (Obsah to update copy, Srovnání & SEO to expand the winning cluster, Distribuce/Kampaně to push traffic to the new LP). Add a "Promote winner" action that marks the variant as the new control baseline for the next round (compounding optimization), seeding a fresh experiment with the winner as control.
- **User value**: Closes the optimization loop — a winner immediately becomes the next test's baseline and routes the user to the concrete next action instead of a static chart.
- **Fit**: Reuses the existing `NextSteps` cross-linking primitive (the product's core "connected flows" pattern) and honors the keyword-cluster → LP relationship central to the module.
