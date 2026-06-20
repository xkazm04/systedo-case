---
id: lead-source-diagnosis
type: tiger/call-site
modality: text
file: src/lib/ai/tools/lead-source-diagnosis.ts:233
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LEAD_SOURCE_DIAGNOSIS_SCHEMA, lead-source-diagnosis.ts:89
grounding: 5/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: improved
last_scanned: 2026-06-20
characters: []
---
## What it does
Root-causes one under-performing lead source (spam vs mis-targeting vs pricing vs volume vs ok) + one action. Entry: `/api/ai` mode `lead-source-diagnosis` → `generateLeadSourceDiagnosis`.
## Prompt & grounding
- System (lead-source-diagnosis.ts:26) defines each cause precisely and pins data-only + "name a concrete better peer source by its numbers".
- Prompt (lead-source-diagnosis.ts:48) carries the source's real leads/qualified/won/qualRate/winRate/spend/CPL/CPQL, the **allowed cause labels**, and — when the caller passes `req.peers` — a **peer-comparison block**.
- **Grounding 5/5** (was 4/5): full single-source economics reach the prompt, AND the comparative peer block now always arrives — **V4 fixed** the validator (`validateLeadSourceDiagnosisRequest`) which was silently dropping the `peers` array the client already built (best-first, self excluded). Same validator-strip class as V1. The "name a concrete better peer by its numbers" instruction is no longer blind.
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. schema + normalize + validate + self-repair: all present. `likelyCause`/`severity` **coerced to known sets**; deterministic `pickCause` floor mirrors the prompt rules.
- **Caching:** NONE (`/api/ai`).
- **Golden:** contract golden `test-llm/golden/lead-source-diagnosis.json` (C6), enforced by `llm-eval --strict` in the gate + CI. The registry probe fixture now **includes a peers block** (C6), so the live real-Claude run exercises the comparative "name a concrete better peer" path V4 enabled.
- `temperature: 0.6`.
## Findings
- ✅ value · **V4 resolved** — `peers` now threaded through the validator so the budget-shift recommendation is grounded (4/5→5/5). [[2026-06-20-run]]
- ✅ code · **C6 resolved** — contract golden + peers probe fixture added, eval enforced in gate + CI. [[2026-06-20-run]]
- code · add `/api/ai` cache. (open — C1 covered the deterministic-input tools)
