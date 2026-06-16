# Campaign Model & AI Prompts — Opportunity Scan

> Total: 5 findings (Critical: 1, High: 2, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Triage diagnosis & deterministic budget moves never reach the AI prompt
- **Severity**: Critical
- **Lens**: Both
- **Category**: feature
- **File**: src/lib/campaigns/report-input.ts (buildCampaignPrompt / buildOverallPrompt) + triage.ts + budget-moves.ts
- **Opportunity**: The rule-based `triage()` reasons and the quantified `recommendBudgetMoves()` output already exist, are pure and deterministic, yet neither is injected into the evaluation prompts. The LLM re-derives "what's wrong" and "what to do" from raw numbers, so it can disagree with the badges and banner the user sees on the same screen, and it can miss flags the rules already caught (paused-but-spending, spend-with-zero-conversions).
- **Value**: Grounding the prompt in the deterministic diagnosis is the single biggest quality + trust lever: the AI report stops contradicting the UI, recommendations become anchored to a concrete "přesun X CZK z A do B" with a simulated ROAS lift, and the demo visibly shows AI *reasoning over* the agency's rules rather than guessing. Differentiates from a generic "ask ChatGPT about my Ads" toy.
- **Effort**: M
- **Fix sketch**: In `buildCampaignPrompt`/`buildOverallPrompt`, call `triage(withMetrics(c))` and `recommendBudgetMoves(rows)`, then emit a "ZJIŠTĚNÉ PROBLÉMY (pravidla)" block from `TriageReason.detail` and a "NAVRŽENÉ PŘESUNY ROZPOČTU" block from `BudgetMove`, instructing the model to validate/refine these rather than invent fresh ones.

## 2. Hard-coded targets and thresholds block per-client configurability
- **Severity**: High
- **Lens**: Both
- **Category**: monetization
- **File**: src/lib/campaigns/types.ts (TARGET_PNO, TARGET_ROAS) + triage.ts (ROAS_CRITICAL_RATIO, PNO_CRITICAL_RATIO)
- **Opportunity**: `TARGET_PNO = 0.18` is a module constant even though its own comment says "agreed with the client" — every client has a different agreed PNO, seasonality target, and risk tolerance, but there is no way to pass one in. The triage critical ratios are likewise frozen.
- **Value**: A configurable `TargetProfile { targetPno, roasCriticalRatio, minSpend }` is what turns a single-client case study into a multi-tenant product, and it is the natural paid axis (per-client target tiers, agency-wide defaults). It also makes the demo honest — agencies immediately ask "can I set my own targets?".
- **Effort**: M
- **Fix sketch**: Introduce a `TargetProfile` type with the current values as the default, thread it as an optional last arg through `deriveMetrics`-consumers, `triage`/`roasMetricTone`/`pnoMetricTone`, `recommendBudgetMoves`, and the prompt `targetLine()`/`header()` so one profile object drives cell colour, badges, budget moves and the AI prompt together.

## 3. Triage rule set is thin and ignores the already-modeled sync-over-sync deltas
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/lib/campaigns/triage.ts (RULES) + types.ts (CampaignChange / ChangesSummary)
- **Opportunity**: Only 4 rules fire, all on the current period. The code comment explicitly anticipates "a drop vs the prior window, once that data is wired" — and `CampaignChange`/`ChangesSummary` shapes already exist in types.ts but feed nothing in triage. Missing high-value rules: efficiency collapse vs prior sync (`roasAfter << roasBefore`), runaway spend (`costDelta` spike), high-spend-low-CTR, near-zero-impression (delivery) campaigns, and CPA-blowout.
- **Value**: "What got worse since last week" is the alert PPC managers actually open the tool for; current triage only says "below target now", which a colour already shows. Trend rules make the banner a reason to return daily (retention), and each new disjoint rule is cheap because the `Rule[]` pipeline was designed for it.
- **Effort**: M
- **Fix sketch**: Add a `triageWithChange(c, change?: CampaignChange)` variant (or extend `Rule.test` to receive an optional prior snapshot) and append rules like `roas_drop` (severity from delta magnitude) and `spend_spike`, reusing `SEVERITY_RANK` so ordering, badges and `summarize()` need no changes.

## 4. No scoring transparency — the 0–100 health score is an unexplained black box
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/lib/gemini.ts (healthScore, EVAL_SCHEMA) consuming report-input.ts prompts
- **Opportunity**: The displayed score is either the LLM's opaque guess or the `healthScore(roas)` fallback, with no factor breakdown. There is no deterministic, auditable component (vs-target, vs-portfolio-rank, spend-weight, trend) the user can inspect, and the prompt never asks the model to justify the number.
- **Value**: A transparent score (e.g. "efektivita 70 % + podíl rizika 20 % + trend 10 %") is a credibility moat for an agency tool — clients distrust a magic number. A pure `scoreCampaign(row, profile): { score, factors[] }` in the campaigns lib would also stabilise the demo (same input → same score) and can be surfaced as a tooltip.
- **Effort**: M
- **Fix sketch**: Add `scoreBreakdown(row, profile)` to the campaigns lib returning weighted factors against `TARGET_ROAS`/rank/spend-share, render its factors as a tooltip, and pass the deterministic score into the prompt as a baseline the LLM must explain rather than overwrite.

## 5. Single fixed evaluation persona — no prompt variants for different stakeholders
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: growth
- **File**: src/lib/gemini.ts (EVAL_SYSTEM) + src/lib/campaigns/report-input.ts (header / closing instruction)
- **Opportunity**: There is exactly one persona ("zkušený český PPC stratég") and one fixed report shape. The same synced numbers could power distinct lenses — an aggressive-growth strategist (scale winners hard), a conservative/CFO lens (protect margin, cut waste first), or a client-facing plain-language summary — each a small prompt/system variant over the identical data.
- **Value**: Persona variants are a cheap, demo-friendly "wow" that shows the data layer is decoupled from the framing, and map naturally to product tiers and to different buyer audiences (PPC manager vs agency owner vs end client). Low marginal cost because the grounding blocks in `report-input.ts` are reused verbatim.
- **Effort**: S
- **Fix sketch**: Parameterise `buildCampaignPrompt`/`buildOverallPrompt` with an `EvalPersona` enum that swaps `EVAL_SYSTEM` and the closing instruction line (risk appetite, tone, audience) while keeping the metric/portfolio blocks unchanged; expose a persona toggle on the eval trigger.
