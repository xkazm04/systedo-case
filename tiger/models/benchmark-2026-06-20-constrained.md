---
type: tiger/model-benchmark
date: 2026-06-20
pass: 2 (constrained tools)
matrix: models {haiku, sonnet} × thinking {direct, deliberate} on the 4 constrained tools
judged_by: character criteria — [[eva-content-seo]], [[petra-performance-analyst]], [[robert-eshop-cohorts]], [[hana-leadgen-cro]]
judge_model: opus (neutral; never the model under test)
method: each tool's REAL system prompt + a fixed character-shaped input → subagent at {model} → JSON; the thinking axis is approximated by a "think carefully / verify every figure" directive vs an "answer directly" directive (the Agent tool exposes `model` but not the `effort` knob — only Workflow does); blind-judged A/B/C on the Character's scored 0–5 bar; latency = subagent wall-clock (duration_ms, harness proxy).
---

# Lens-3 benchmark — 2026-06-20 (pass 2: the constrained tools)

Tests the pass-1 hypothesis: *"the constrained tools (output tightly bound by supplied numbers + label constraints) hold quality on Haiku at a fraction of the cost."* Four tools × {haiku-direct, haiku-deliberate, sonnet} = 12 generations, blind-judged 0–5.

## Headline — the hypothesis is HALF right, and the dividing line is sharper than "constrained"
The safe-downgrade property is **not** "output bound by inputs". It is **"requires no arithmetic / numeric reasoning"**. Exactly one of the four — [[keyword-clusters]] (pure set-regrouping with an anti-hallucination guard) — is a clean Haiku win. The other three are **numeric reads**, and Haiku degrades on every one: it **inverted the economics** ([[analysis]]), **fabricated a count** ([[lead-source-diagnosis]]), **mis-stated a ratio** (lead-source), or **corrupted the text** ([[cohort-diagnosis]]). This is the degradation Tiger exists to catch before a cost-driven downgrade ships.

## Per-tool results (quality 0–5 vs the Character bar)

### [[keyword-clusters]] — judged by [[eva-content-seo]] — ✅ DOWNGRADE TO HAIKU
| cell | quality | latency | notes |
|---|---|---|---|
| haiku · direct | **5** | 2.3s | All 6 keywords verbatim/once, correct walnut/almond split, pillars = highest-volume. Ship as-is. |
| haiku · deliberate | **5** | 1.7s | Identical, correct. Thinking adds nothing (already perfect). |
| sonnet | **5** | 4.1s | Identical; labels the almond cluster `transactional` (a defensible judgment call, not better). |
**Recommendation: downgrade to Haiku-class.** Equal quality (all 5/5 ship-as-is), ~2× faster, ~3× cheaper per token. This is pure categorical set-partitioning — no numbers to get wrong — so the cheapest tier suffices. Maps to prod: **safe on Gemini Flash** (current).

### [[analysis]] — judged by [[petra-performance-analyst]] — ❌ KEEP SONNET
| cell | quality | latency | notes |
|---|---|---|---|
| haiku · direct | **0** | 6.4s | **Critical inverted economics:** called PMax's 25,7 % PNO "nejnižší" (it's the highest) and recommended **cutting the best channel (Sklik) to fund the two worst (PMax/Meta)**. Would actively harm the account. |
| haiku · deliberate | **4** | 7.5s | Thinking **fixed the direction** (scale Sklik/Search, cut PMax/Meta) — but a Meta-ROAS slip ("pod 4×" vs 4,2×) + invented thresholds keep it below ship. |
| sonnet | **5** | 14.0s | Correct verdict, accurate numbers, economically right. Ship-ready. |
**Recommendation: keep Sonnet-class.** Haiku-direct is *dangerous* here (confuses high-PNO=bad with good). Deliberate rescues the direction but not to ship grade. The verdict drives budget moves — wrong direction = real money lost.

### [[cohort-diagnosis]] — judged by [[robert-eshop-cohorts]] — ❌ KEEP SONNET
| cell | quality | latency | notes |
|---|---|---|---|
| haiku · direct | **4** | 8.3s | Clean, correct worstCohort (2025-03), grounded — but misses the senior touch (doesn't flag 2025-02 as also sub-target) and a too-cautious "wait for M4–M5" on an already-loss-making cohort. |
| haiku · deliberate | **2** | 8.3s | **Output corruption:** leaked Chinese characters (`která媒体/segment`) and broken Czech ("dort tu je, jenom jej nabíraní neplní"). Correct diagnosis, unshippable text. |
| sonnet | **5** | 16.9s | Best — flags 2025-02 too, PMF-risk caveat, cash-flow note. Ship-ready. |
**Recommendation: keep Sonnet-class.** Haiku is either sub-senior (direct) or *corrupted* (deliberate). Note the **thinking axis backfired** here — the opposite of analysis.

### [[lead-source-diagnosis]] — judged by [[hana-leadgen-cro]] — ❌ KEEP SONNET
| cell | quality | latency | notes |
|---|---|---|---|
| haiku · direct | **3** | 4.9s | Coherent (mis-targeting), names the concrete peer — but a factual error: "**dvakrát** vyšší CPQL" when 738/210 = 3,5×. |
| haiku · deliberate | **3** | 5.7s | Sharpest label reasoning — but **fabricated** "cca 229 SQL místo 130" (at CPQL 210 the real figure is ~457). |
| sonnet | **4** | 10.1s | Defensible (spam), all peer math correct, no fabrication. Only cell to clear the bar. |
**Recommendation: keep Sonnet-class.** Even on a tightly-bounded diagnostic, both Haiku cells shipped a numeric error. (The classification itself is genuinely ambiguous spam/mis-targeting — all three are coherent there; Haiku's failure is the *arithmetic*, not the judgment.)

## Cross-cutting insights
- **The real split is categorical vs numeric, not "constrained vs creative".** keyword-clusters (categorical) → Haiku-safe. analysis / cohort / lead-source (numeric) → Haiku degrades. The pass-1 backlog lumped all four as "the downgrade prize"; only one is.
- **Thinking/effort is an unreliable lever on Haiku.** It rescued analysis (0→4, fixed the inverted direction) but *backfired* on cohort (4→2, introduced CJK corruption) and was a wash on lead-source. Don't count on a thinking bump to make a cheap model numerically safe.
- **Latency: Haiku is consistently ~2× faster** (kw 2s vs 4s; analysis 7s vs 14s; cohort 8s vs 17s; lead-source 5s vs 10s). **Cost: Haiku ~3× cheaper per token** (≈ $1/$5 vs $3/$15 per MTok). For these short outputs the absolute spend is tiny; the ratio matters at volume.
- **Prod mapping (this is the actionable bit — prod runs Gemini Flash on everything).** keyword-clusters is safe on the cheapest tier. The three numeric tools showed exactly the failure mode a too-small model produces — so **Flash is a real risk for analysis/cohort/lead-source**; quality-check Flash on those three and **consider Gemini Pro** for them (mirrors the pass-1 [[lead-reply]]/[[ads]] → don't-go-below-Sonnet finding). Ties into M1.
- **Method caveat:** the thinking axis was approximated via prompt directive, not the real `effort` knob (the Agent tool doesn't expose it; a Workflow run with `effort: low|high` would measure it precisely). Treat the thinking-axis rows as indicative, the model-axis rows as solid.

## Deltas vs pass 1
Pass 1 (copy/reply tools) said "constrained tools are the untested downgrade prize." Pass 2 tests them and finds the prize is **one tool, not four** — the categorical one. Net model map after both passes: copy/reply (lead-reply, ads) → ≥ Sonnet; numeric reads (analysis, cohort-diagnosis, lead-source-diagnosis) → ≥ Sonnet; **only keyword-clusters → Haiku/Flash-safe**.
