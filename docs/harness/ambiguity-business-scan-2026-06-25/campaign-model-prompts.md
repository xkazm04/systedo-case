# Campaign Model & AI Prompts — Ambiguity + Business scan
> Context: Framework-free campaign domain (types/derived metrics/aggregation), rule-based triage/severity, and the prompt builders that ground per-campaign + portfolio AI evaluation in synced numbers.
> Files analyzed: 3 (types.ts, triage.ts, report-input.ts) + 2 adjacent imports read for types (targets.ts, metrics/ratios.ts)
> Total findings: 5

## 1. The "critical" ROAS and PNO thresholds are not actually equivalent
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/lib/campaigns/triage.ts:14
- **Problem/Opportunity**: The header (lines 4-6) promises "the badge, the cell colour and the banner can never disagree," and lines 12-17 present `ROAS_CRITICAL_RATIO=0.6` and `PNO_CRITICAL_RATIO=1.6` as the *same* line expressed two ways ("…or equivalently…"). They are not. `roasMetricTone` (line 29) goes red at `roas < TARGET_ROAS*0.6 = 3.333×` ⟺ PNO > 30.0% (= 1.667× target), while `pnoMetricTone` (line 36) goes red at `pno ≥ TARGET_PNO*1.6 = 28.8%` ⟺ ROAS ≤ 3.472× (= 0.625× target). A campaign with PNO in [28.8%, 30.0%) shows a **red PNO cell but a neutral ROAS cell**, and triage `roas_critical` (line 121) does not fire — the row earns only a "Sledovat"/warning badge.
- **Why it matters**: This is exactly the cross-surface contradiction the module was built to prevent, and it propagates into the AI prompt: `triageLines` feeds the LLM "below target/warning" for a campaign whose PNO cell is screaming red, so the grounded evaluation can diverge from the screen.
- **Fix sketch**: Make one ratio the source and derive the other (e.g. `PNO_CRITICAL_RATIO = 1 / ROAS_CRITICAL_RATIO`, giving 1.667), or pick a single agreed boundary and assert `Math.abs(1/ROAS_CRITICAL_RATIO - PNO_CRITICAL_RATIO) < ε` in a unit test. Pure triage.ts edit — commit-safe (not in the llm-gate list).

## 2. Spending-with-no-revenue renders identically to a never-ran campaign in the prompt
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/lib/campaigns/report-input.ts:41
- **Problem/Opportunity**: `metricsLine` shows `ROAS …` only when `c.roas > 0` and `PNO …` only when `c.pno > 0`, else "—" (lines 41-43). Because `safe()` (ratios.ts:8) returns 0 for any zero denominator, a campaign that burned budget with **zero conversion value** (cost>0, value=0) prints `ROAS —, PNO —` — byte-for-byte identical to a paused zero-spend campaign. The prompt then orders the model to reason "VÝHRADNĚ z uvedených čísel" (line 90), but the worst case is hidden behind the same dash as the harmless one.
- **Why it matters**: This is the precise zero-spend/zero-revenue/division edge case grounding is supposed to eliminate; the triage line rescues severity, yet the metrics block under-states it, inviting an over-generous score the cap on line 90 then has to fight.
- **Fix sketch**: Distinguish "no spend" from "spend, no return": when `c.cost > 0 && c.conversionValue === 0`, render PNO/ROAS as e.g. `∞ (bez návratnosti)` instead of "—". Pure report-input.ts edit — commit-safe.

## 3. Threshold magic numbers are duplicated as prose and buried as un-named literals
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/campaigns/triage.ts:123
- **Problem/Opportunity**: The `roas_critical` detail hardcodes the string "pod 60 % cíle" (line 123), duplicating `ROAS_CRITICAL_RATIO=0.6`; retune the constant and the Czech sentence silently lies. Meanwhile the change-rules embed bare literals with only inline comments and no recorded rationale — `roasAfter < roasBefore * 0.6` (40% loss, line 162) and `costDelta >= 0.5` / `valueDelta < costDelta * 0.5` (line 174) — even though the module's whole thesis is "single source of truth for thresholds."
- **Why it matters**: The named-constant discipline that keeps cells/badges/banner in sync is abandoned exactly where the most consequential "crater"/"spike" alerts are defined, and the prose-vs-constant drift is a latent correctness bug the moment a target is tuned.
- **Fix sketch**: Derive the "60 %" text from `ROAS_CRITICAL_RATIO` via `fmtPct`, and promote `ROAS_CRATER_RATIO=0.6`, `SPEND_SPIKE_RATIO=0.5`, `VALUE_LAG_RATIO=0.5` to named exports beside the other ratios with a one-line "why this number" each. Pure triage.ts edit — commit-safe.

## 4. The prompt builders hard-bake one client + one target, blocking a "grade your own account" lead magnet
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/lib/campaigns/report-input.ts:32
- **Problem/Opportunity**: `CLIENT_LINE` is a literal "Klient: Mionelo (mionelo.cz)…" (line 32) and `targetLine()` reads the single global `TARGET_PNO` (lines 48-50). The builders are otherwise pure, parameterized functions — so the only thing tying them to this one case study is the hardcoded identity and target. For a marketing agency, the most natural growth play is a self-serve "Ohodnoť svůj Google Ads účet" tool: paste/connect numbers, get the same grounded AI report, capture the lead.
- **Why it matters**: Real, feasible lead-gen for the agency (not an in-app paywall on a portfolio piece): the deterministic-triage + budget-moves grounding is a genuine differentiator vs generic "ask ChatGPT about my ads," and it's gated only by two hardcoded values.
- **Fix sketch**: Thread a `client: { name; domain; descriptor }` and `targetPno` through `buildCampaignPrompt`/`buildOverallPrompt`/`header`, defaulting to today's Mionelo/`TARGET_PNO` constants so nothing on the case-study site changes. Pure report-input.ts/types edit — commit-safe.

## 5. The score cap and "must agree with triage" are instructions to the LLM, never validated
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/lib/campaigns/report-input.ts:90
- **Problem/Opportunity**: Both prompts assert hard invariants in prose — "kampaň s kritickým nálezem nemůže dostat skóre zdraví nad 50" (line 90) and "Doporučení musí vycházet z triáže… a nesmí jim odporovat" (line 158). Nothing downstream checks the model honored them. A returned score of 80 on a `roas_critical` campaign would render straight onto the page beside a red badge — the exact contradiction the deterministic grounding exists to kill.
- **Why it matters**: The product's credibility rests on the AI never disagreeing with the visible rule-based diagnosis; an un-enforced cap means one stray response undermines the whole "grounded, trustworthy" claim.
- **Fix sketch**: After parsing the AI response, clamp `score = min(score, 50)` when `triage().severity === "critical"` (or flag a mismatch for retry). Export a tiny `maxScoreFor(severity)` helper from triage.ts (commit-safe) and call it in the AI route — **gate-triggering** (the route under `src/app/api/.../ai` is in the llm-gate hash list).
