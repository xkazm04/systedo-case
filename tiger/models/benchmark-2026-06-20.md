---
type: tiger/model-benchmark
date: 2026-06-20
matrix: models {haiku, sonnet, opus} × thinking {default}
judged_by: character criteria ([[hana-leadgen-cro]], [[petr-ppc-copywriter]])
method: each tool's REAL system prompt + a fixed character input → subagent at model tier → JSON; judged blind on the Character's scored criteria; latency = subagent wall-clock (proxy); cost = relative output-token tier
---

# Lens-3 benchmark — 2026-06-20 (first pass)

Two high-value, quality-sensitive tools across model tiers. Quality 0–5 vs the Character bar. (Thinking-level sweep deferred to the next pass — this pass varies model only.)

## [[lead-reply]] — judged by [[hana-leadgen-cro]] (human · on-channel · 2–3 BANT · no invented prices)
| model | quality | latency | notes |
|---|---|---|---|
| haiku | **3.5** | ~5s | Sendable but **corporate filler** ("věnujeme maximální pozornost") the system prompt forbids; **doesn't echo the lead's specifics** (300 m² / 2× týdně); weakest, clunkiest BANT question. |
| sonnet | **4.5** | ~7s | Echoes the specifics, "do jednoho pracovního dne", sharp BANT (timing/start/budget), clean signature placeholders. (1 typo "Dobrá den".) |
| opus | **4.5** | ~13s | Echoes specifics, thorough BANT (scope incl. windows/carpets + #workstations). No business-quality lift over Sonnet. |
**Recommendation:** **keep Sonnet.** Haiku **degrades** (generic, misses context — Hana's "robotic fails"); Opus adds latency, not quality. Don't run this tool below Sonnet-class.

## [[ads]] — judged by [[petr-ppc-copywriter]] (≤30/≤90/≤25 limits · ≥5 distinct angles · specific · no hype)
| model | quality | latency | notes |
|---|---|---|---|
| haiku | **2.5** | ~8s | **Char-limit violations**: multiple headlines >30 ("Zdravá pozice při dlouhých pracovních hodinách" ~46) and descriptions ~175 chars (>90). Relies entirely on the app's clamp/self-repair → truncates mid-word, loses content. |
| sonnet | **4.0** | ~12s | Headlines all ≤30, good angle variety, relevant keywords; 1 description slightly over 90 (clamp handles it). |
| opus | **4.5** | ~59s | Cleanest limit compliance (self-validated), distinct angles; but ~5× latency. |
**Recommendation:** **keep Sonnet.** Haiku's raw output is non-compliant (leans on the clamp = content loss → fails Petr's "upload as-is" bar); Opus's marginal compliance gain isn't worth 5× latency.

## Cross-cutting model insight
- **Quality-sensitive tools (copy, replies) need ≥ Sonnet.** Haiku breaks two ways: it drops grounding/specificity (lead-reply) and it ignores hard constraints (ads char limits). This is the **degradation** Tiger exists to catch before a cost-driven downgrade ships.
- **The real downgrade opportunity is the CONSTRAINED tools** (next benchmark): [[keyword-clusters]] (pure regrouping + anti-hallucination guard), [[analysis]] / [[cohort-diagnosis]] / [[lead-source-diagnosis]] (output tightly bound by supplied numbers + label constraints). Hypothesis: these hold quality on Haiku at a fraction of cost — test next.
- **Prod runs Gemini Flash** (`cost.ts`: $0.075/$0.30 per MTok) — far cheaper than Sonnet-class. Given lead-reply/ads need Sonnet-class quality, **quality-check Gemini Flash on these two**; consider Gemini Pro for the copy/reply tools while keeping Flash on the constrained ones.
- **Next axis:** thinking/effort sweep (low→high) on the survivors, and the constrained-tool Haiku test.
