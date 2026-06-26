# Ambiguity+Business Fix Wave 6 — "Name the magic numbers"

> 3 commits, 5 findings closed. Theme: undocumented magic numbers → named, documented
> constants — plus one real correctness fix (Ad Strength ignoring its own limits).
> Baseline preserved: tsc 0 → 0 · unit 173 → 173 · 0 regressions.

## Commits

| # | Commit | Finding(s) | Files |
|---|--------|-----------|-------|
| 1 | `2f45469` | ai-tool-forms #2 **+** #4 — Ad Strength ignores limits; magic weights | `src/lib/ad-strength.ts` |
| 2 | `e5b2717` | campaign-model-prompts #3 **+** campaign-console #4 — triage thresholds | `src/lib/campaigns/triage.ts` |
| 3 | `db77989` | trend-channel #5 — pnoTone multipliers | `src/components/dashboard/ChannelTable.tsx` |

## What was fixed
1. **Ad Strength can no longer rate an over-limit set "Excellent" (correctness).** `computeAdStrength` now counts assets over `AD_LIMITS`, caps the score below the "good" floor (65) when any exist, and appends a "within character limits" factor naming the count. Also documented the weights (sum 100) + 85/65/40 cutoffs as a hand-tuned heuristic, not Google's formula.
2. **Triage change-rule thresholds named** — `ROAS_CRATER_RETAINED_MAX` / `SPEND_SPIKE_COST_JUMP` / `SPEND_SPIKE_VALUE_LAG` replace bare `0.6` / `0.5` literals beside the other ratios, and the "pod 60 % cíle" prose is derived from `ROAS_CRITICAL_RATIO` so it can't drift. No behavior change (values identical, string unchanged).
3. **pnoTone multipliers named** — `PNO_TONE_TOLERANCE` (1.05) / `PNO_TONE_ALERT` (1.6) with a note that 1.6 matches the dashboard gauge max.

## Scope decision (deferred)
**dashboard-kpis #3** (a cluster of magic numbers spread across DashboardClient/GoalPacing/DeltaBadge) — deferred as pure clarity spread over several components; logged as a follow-up.

## Verification
tsc 0 · unit 173/173 · LLM gate green (cached; none of these files are hashed).

## Pattern established (catalogue 14)
14. **A documented threshold and its enforcing literal must be one value** — prose like "pod 60 % cíle" beside a `0.6` constant silently lies on retune; derive the prose from the constant (`fmtPct(RATIO)`) and name every rule literal next to its siblings.

## What remains
The gate-locked track only — LLM-wrapper findings whose files are hashed by `llm-gate.mjs`, so committing them runs the real Claude pre-commit suite.
</content>
