---
id: campaign-eval
type: tiger/call-site
modality: text
file: src/lib/ai/tools/campaign-eval.ts:230
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — EVAL_SCHEMA, campaign-eval.ts:39
grounding: 5/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---
## What it does
Single-campaign OR whole-portfolio health report (score 0–100, verdict, summary, strengths, weaknesses, prioritized recommendations). Entry: `/api/campaigns/analyze` → `generateCampaignEvaluation`.
## Prompt & grounding
- System (campaign-eval.ts:30) pins data-only + a score rubric + priority-tagged recs.
- Prompts built server-side from **synced campaign data** via `buildCampaignPrompt` / `buildOverallPrompt` ([[report-input]]): per-campaign metrics, cost/revenue share + ROAS rank + same-type aggregate, portfolio totals vs TARGET_PNO/ROAS, the **deterministic triage** the UI shows, and the **quantified budget-move simulation** (report-input.ts:139-148).
- Overall scope is **RAG-grounded**: account's own winning patterns ranked by semantic relevance (route.ts:113-128 → `getPatternLines`, see [[patterns-embed]]). **Grounding 5/5.**
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. schema + normalize + validate + self-repair: all present.
- **Caching: YES — credit it.** `/api/campaigns/analyze` input-hash caches (`hashEvalInputs` + `findCachedReport`, route.ts:89-97), `?force=1` bypass, persists report + history. **Quota counts only a real (non-cached) call** (route.ts:99-111). Best-engineered site in the set.
- **Golden:** yes (`test-llm/golden/campaign-eval.json`) + live probe.
- `temperature: 0.6`.
## Findings
- strength-to-protect · cache + quota-on-real-call + triage/budget grounding + RAG patterns — **the reference standard** the other tools should copy. (stub — [[2026-06-20-run]])
