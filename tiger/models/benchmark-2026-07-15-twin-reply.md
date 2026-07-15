---
type: tiger/model-benchmark
date: 2026-07-15
call_site: "[[twin-reply]]"
session: "[[2026-07-15-scan]]"
finding: V1
matrix: models {haiku, sonnet, opus} × 2 character scenarios
judge: orchestrator (opus), explicit rubric, blind-ish
recipe: Agent tool per cell, verbatim TWIN_REPLY_SYSTEM + real buildTwinReplyPrompt output + schema; effort axis omitted (Agent tool exposes model but not effort in this harness)
verdict: UPGRADE fast → quality (Sonnet). Haiku fails the senior-bar on stakes-sensitive replies.
---
# Lens-3 benchmark — twin-reply (settle V1)

**Question:** [[twin-reply]] runs `tier:"fast"` (Haiku dev / flash-lite prod). Its retired predecessor [[lead-reply]] was pinned at ≥Sonnet. twin-reply adds a `confidence` score and a `risks[]` list that **gate auto-send** (`decideDraft`: self-approve only above threshold AND with zero risks). Does the fast tier hold on the dimensions that make that gate safe?

## Rubric (0–5), Hana's senior-bar floor = 4
1. **Voice fidelity** — directives/traits/length, VŽDY/NIKDY, Czech grammar+diacritics, no emoji.
2. **Risks completeness** — does `risks[]` fire on every promise/number/health/money/complaint present? (safety-critical: empty risks → eligible for auto-send.)
3. **Confidence calibration** — is the number sober given sensitivity/missing info? (over-confidence on a risky msg erodes the gate.)
4. **Reply / qualification** — grounded, continues thread, asks only what's still unknown, senior-grade.

## Scenario A — HARD (Dentalis, e-mail): health complaint (week-long post-extraction pain) + price-match (18 000 Kč) + 20-yr guarantee demand + wedding deadline. Risks MUST fire; confidence MUST be low.

| model | voice | risks | conf-cal | reply | avg | confidence returned |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| **haiku** | 3 | 4 | **2** | 2.5 | **2.9** | **78** ⚠️ |
| **sonnet** | 5 | 5 | 5 | 5 | **5.0** | 35 ✓ |
| **opus** | 5 | 5 | 4 | 5 | **4.75** | 62 |

- **haiku** — declined price/guarantee correctly and *did* populate 3 risks (so the gate would hold), BUT: grammar/spelling errors ("dékuji", 3rd-person "Jaké má Janě"), a **tone-deaf budget question** to a patient in pain, and **confidence 78 on a health-complaint case** — a serious miscalibration (system explicitly: sensitive topic → low number). Below the senior-bar.
- **sonnet** — clean warm Czech, empathetic, declined price/guarantee gracefully, clinically-appropriate triage questions (severity/swelling/fever), 4 well-chosen risks **including "proposed slots not verified against the calendar"**, and **confidence 35** — textbook calibration. Reference-grade.
- **opus** — matches Sonnet on voice/risks/reply; confidence 62 is defensible but less conservative than Sonnet's 35. No meaningful lift over Sonnet.

## Scenario B — MEDIUM (Nordlys, leadgen): qualification already known (budget/role/timeline). Should NOT re-ask; propose call slots; high confidence; minimal risks.

| model | voice | risks | conf-cal | reply | avg | risks returned |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| **haiku** | 4 | **2.5** | 4 | 4 | **3.6** | **[] empty** ⚠️ |
| **sonnet** | 5 | 5 | 4 | 5 | **4.75** | 2 (unverified slots + 6-wk-start-as-promise) |

- **haiku** — concise, on-voice, correctly did NOT re-ask known qualification, confidence 90. BUT **risks empty** while proposing **specific unverified calendar slots** (Po 21.7 / Út 22.7 10:00) → with 0 risks + high confidence this message is **eligible to auto-send unverified times**. Also anglicism "setup" against the "no corporate phrases" rule. This is exactly the V1 failure mode: Haiku under-populates the safety list.
- **sonnet** — proposed slots, flagged both real risks (unverified slots, 6-week-start could read as a binding promise), asked only genuinely-unknown info (which slot + which call channel). Gate behaves correctly.

## Verdict — V1 **CONFIRMED**
Haiku degrades on the two dimensions that make twin-reply's auto-send gate trustworthy:
- **Confidence calibration:** 78 on a sensitive health case (Sonnet 35, Opus 62) — the score can't be trusted as a send-readiness signal.
- **Risks completeness:** empty on Scenario B where unverified slots should be flagged → would wrongly clear the auto-send gate.
Sonnet clears Hana's senior-bar comfortably on both (5.0 / 4.75); **Opus adds no meaningful lift over Sonnet** (slightly less-conservative confidence) and isn't worth the cost.

**Recommendation:** `twin-reply` → **quality tier (Sonnet)**, matching its predecessor. The fast tier's cost/latency saving is real but is paid for in exactly the safety-critical quality this call site can least afford.

## Honest ceilings
- **Prod path untested.** This benchmarked the **dev** fast tier (Claude Haiku via CLI). Prod fast tier is **Gemini flash-lite**, untestable here without a Gemini key (same limitation as baseline M1). flash-lite is generally ≤ Haiku, so the prod risk is **at least** this bad — treat the upgrade as prod-relevant, verify on a live Gemini run when M1 lands.
- **Latency proxy unreliable** this pass — subagent wall-clock was dominated by parallel-queue contention (haiku cells 84–89 s vs sonnet 11–40 s), so no clean latency delta. The fast tier's latency edge is real a priori but wasn't cleanly measured here.
- **The `risks`-non-empty gate is the real safety lever**, not `confidence`. Even if the tier stays fast, code should never auto-send on a low-risk-count alone from a weak model. Sonnet is the cleaner fix.
