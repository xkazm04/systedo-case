---
id: cohort-diagnosis
type: tiger/call-site
modality: text
file: src/lib/ai/tools/cohort-diagnosis.ts:209
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — COHORT_DIAGNOSIS_SCHEMA, cohort-diagnosis.ts:81
grounding: 5/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---
## What it does
Unit-economics diagnosis: names the single worst acquisition cohort + the one lever to pull first. Entry: `/api/ai` mode `cohort-diagnosis` → `generateCohortDiagnosis`.
## Prompt & grounding
- System (cohort-diagnosis.ts:21) is **e-shop vs SaaS aware** and pins data-only + LTV:CAC≥3 goal.
- Prompt (cohort-diagnosis.ts:56) carries portfolio summary (blended CAC, avg LTV:CAC, avg payback), the **cohort trend**, and a full per-cohort line. Numbers are the already-computed LTV-module figures. Passes the **allowed cohort labels** and constrains `worstCohort` to them. **Grounding 5/5.**
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. schema + normalize + validate + self-repair: all present, with **best-in-class constraint discipline** — `worstCohort` rejected unless a real label, deterministic lowest-LTV:CAC floor.
- Data-driven demo (cohort-diagnosis.ts:154).
- **Caching:** NONE (`/api/ai`).
- **Golden:** live registry probe only — **no golden snapshot file**.
- `temperature: 0.6`.
## Findings
- code · add a golden snapshot (drift on the constrained worstCohort would be invisible today). (stub — [[2026-06-20-run]])
- code · uncached `/api/ai`. (stub)
