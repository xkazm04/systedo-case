# Feature + Moonshot Scan — Campaign Model & AI Prompts

> Context: ctx_1781547850569_pw4bdzh
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. User-tunable target & rule thresholds (configurable triage)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/lib/campaigns/triage.ts:RULES` + `src/lib/campaigns/types.ts:TARGET_PNO`
- **Scenario**: `TARGET_PNO = 0.18` and `ROAS_CRITICAL_RATIO = 0.6` / `PNO_CRITICAL_RATIO = 1.6` are hard-coded module constants. In the case study the agreed client target is fixed, but a real PPC manager negotiates a different PNO per client (15 % for one e-shop, 25 % prospecting for another) and wants to decide how far below target counts as "critical" vs merely "watch". Today changing any of these means editing source.
- **Opportunity**: Introduce a `TriageConfig` object (`{ targetPno, roasCriticalRatio, pnoCriticalRatio }`) threaded through `triage()`, `summarize()`, `roasMetricTone()`, `pnoMetricTone()` and `triageWeight()`, defaulting to today's constants so nothing breaks. Surface it as a small "Cílové PNO a prahy" settings popover above `CampaignTable` (or in `TriageBanner`), persisted to `localStorage` like the existing sort state (`SORT_STORAGE_KEY` pattern). The prompt builders read the same config so the AI's `targetLine()` always matches what the table colours show.
- **Impact**: Turns a single baked-in demo target into a believable, reusable tool; the same case-study UI now demonstrates adaptability across clients, which is exactly the "we tune to your goals" story a marketing agency sells.
- **Implementation sketch**: Add `TriageConfig` + `DEFAULT_TRIAGE_CONFIG` to `triage.ts`; make every threshold function take an optional `cfg = DEFAULT_TRIAGE_CONFIG`. Add a `useTriageConfig` hook in `CampaignTable.tsx` mirroring `loadSort`/`useEffect` persistence. Pass `targetPno` into `report-input.ts:header()`/`targetLine()` and into `gemini.ts` (`TARGET_PNO`/`TARGET_ROAS` references) so colours, badges, banner and prompt stay one source of truth.

## 2. Trend-aware rules using period-over-period deltas

- **Severity**: High
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: L (>3d)
- **File**: `src/lib/campaigns/triage.ts:RULES` (+ `connector.ts`, `store.ts`, `report-input.ts`)
- **Scenario**: The rules file already flags a TODO seam — *"New rules (e.g. a drop vs the prior window, once that data is wired) slot in here without touching callers."* All four current rules are point-in-time (status, zero conversions, ROAS bands). A campaign whose ROAS halved week-over-week but is still above target reads as "V pořádku" today, even though that decay is the single most actionable PPC signal.
- **Opportunity**: Add a prior-period snapshot to the model (`Campaign` gains an optional `prev?: Pick<Campaign, raw metrics>`, or a parallel `CampaignWithTrend`), wire `connector.fetchCampaigns` to also pull the preceding equal-length window and `store.ts` to persist it, then add trend rules: `roas_dropping` (ROAS down >X % vs prior with material spend), `cost_surge_no_value` (cost up sharply while conversionValue flat), `recovering` (informational positive). Feed the deltas into `metricsLine()`/`buildCampaignPrompt()` so the AI evaluates *direction*, not just level.
- **Impact**: Moves triage from "snapshot scoring" to genuine early-warning, the defining feature of tools like Optmyzr the file comments reference. Both the badge and the AI report gain a time dimension, dramatically raising the perceived intelligence of the demo.
- **Implementation sketch**: Extend `types.ts` with prior-window fields + a `deriveTrend()` helper (delta ratios via the existing `safe()`). Add 2-3 `Rule`s referencing `c.prev` in `triage.ts` (disjoint from existing ROAS bands). Extend `sample.ts` to emit a plausible prior window so the demo shows trends out of the box. Add a delta clause to `metricsLine()` in `report-input.ts` using `fmtSignedPct` (already imported in `gemini.ts`).

## 3. Few-shot + benchmark grounding in the evaluation prompts

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/lib/campaigns/report-input.ts:buildCampaignPrompt` / `buildOverallPrompt`
- **Scenario**: The prompts ground the model in real numbers and the agreed target, but give it no scoring calibration beyond the score-band sentence in `EVAL_SYSTEM` (`gemini.ts`). Across re-analyses the 0–100 score and verdict tone can wobble for identical inputs, and the model has no channel-type benchmarks (a 3× ROAS is great for Display prospecting but weak for brand Search), so its strengths/weaknesses can be generically wrong.
- **Opportunity**: Enrich both prompt builders with (a) one or two compact few-shot exemplars — a "good" and a "bad" campaign line plus the expected score/verdict — to anchor calibration, and (b) per-`CampaignType` benchmark bands (typical ROAS/PNO ranges, e.g. Search brand vs Performance Max prospecting) injected into the type-context section. This pairs naturally with the shared `healthScore()` math already in `gemini.ts`, which can seed the exemplar scores so demo and live stay consistent.
- **Impact**: More stable, defensible scores and channel-aware critique — the difference between "AI summarised my numbers" and "AI judged my campaign like a senior strategist". Directly strengthens the case study's central claim of grounded AI.
- **Implementation sketch**: Add a `CAMPAIGN_TYPE_BENCHMARKS: Record<CampaignType, {roas:[lo,hi]; note:string}>` to `types.ts`; render a "Typické pásmo pro tento typ" line in `buildCampaignPrompt`. Add a `FEW_SHOT` block (1 good + 1 bad exemplar via `metricsLine`) before the instruction line in both builders, reusing `healthScore()` for the exemplar scores. No schema/route change needed.

## 4. Configurable rules-engine + target framework (moonshot)

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/lib/campaigns/triage.ts:Rule` / `RULES` (data-driven refactor)
- **Scenario**: Triage is a hard-coded `Rule[]` of four closures. Ideas #1 and #2 each widen it, but the transformative end state is a *framework the user composes themselves* — choose metrics, operators, thresholds and severities, save named rule sets ("Brand Search", "Prospecting"), and apply different sets per campaign type. That converts a portfolio-specific demo into a reusable PPC alerting product.
- **Opportunity**: Promote `Rule` from a closure to a serialisable spec: `{ id, metric: 'roas'|'pno'|'cpa'|'ctr'|'convRate'|'cost'|'roasTrend', op: '<'|'>'|'between', value | ratioOfTarget, severity, label, detailTemplate }`. Build a pure `evaluateRule(spec, row, cfg)` interpreter (reuse `MetricTone`/`SEVERITY_RANK`). Ship the current four as the default ruleset, then add a visual rule builder over `CampaignTable` and persist user rulesets (`localStorage`, later the existing `node:sqlite` store via a `triage_rules` table). Because every consumer already calls `triage()`/`summarize()`, the UI inherits custom rules for free — and the rule definitions can be serialised straight into the AI prompt so the model evaluates against *the user's own policy*.
- **Impact**: Category move: the case study stops being one client's dashboard and becomes a configurable "rules + targets" engine — the headline differentiator for an analytics product, and a force multiplier because the same specs drive colours, badges, banner counts and AI grounding from one definition.
- **Implementation sketch**: Refactor `triage.ts` to a `RuleSpec` model + `evaluateRule()` (detail via a template-substitution helper using `fmtCZK`/`fmtMultiple`/`fmtPct`); keep `triage()`/`triageWeight()`/`summarize()` signatures, swapping their internals to take an optional ruleset. Add `serializeRulesetForPrompt()` and inject it into `header()` in `report-input.ts`. Add a `RuleBuilder` panel + `useRuleset` persistence hook in the campaigns components; optionally a migration for a `triage_rules` table alongside `store.ts`.

## 5. Closed-loop "recommend → simulate → measure" engine (moonshot)

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: `src/lib/campaigns/report-input.ts` + `triage.ts` + `store.ts` (report history)
- **Scenario**: The system already produces prioritised AI recommendations (`recommendations` with `high/medium/low` in `gemini.ts`) and already stores a *score-over-time* history (`store.ts:getReportHistory`). But the loop is open: a recommendation like "navýšit rozpočet o X" is never tied to an expected outcome, and the next sync can't tell whether following advice actually helped. The pieces for a feedback loop exist but aren't connected.
- **Opportunity**: Close the loop. (a) Add a pure `simulateBudgetShift(rows, moves, cfg)` to the model that projects portfolio ROAS/PNO if spend is reallocated from low-ROAS to high-ROAS campaigns (linear first cut), so a recommendation can show "očekávaný dopad: PNO 18 % → 16 %". (b) On the next sync, diff actual vs the simulated projection using the existing report history and trend deltas (idea #2), and surface a "doporučení splněno / nesplněno" verdict. Feed both the projection and the realised delta back into `buildOverallPrompt` so the AI critiques its *own* prior advice.
- **Impact**: Transforms a reporting dashboard into a self-evaluating optimisation loop — the strongest possible proof point for "grounded, accountable AI" and a true 10x story: the product doesn't just advise, it scores whether its advice worked.
- **Implementation sketch**: Add `simulateBudgetShift()` + a `BudgetMove[]` type to `types.ts`/a new `simulate.ts`, built on `aggregate()`/`deriveMetrics()`. Persist projected targets next to reports in `store.ts` (extend the reports row or a sibling table). In `report-input.ts`, add a "PŘEDCHOZÍ DOPORUČENÍ A JEJICH DOPAD" prompt section fed from history + trend. Render the projected-vs-actual verdict in `ReportView`/`CampaignTable`'s expanded report row.
