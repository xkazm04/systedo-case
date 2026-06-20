---
id: lead-source-diagnosis
type: tiger/call-site
modality: text
file: src/lib/ai/tools/lead-source-diagnosis.ts:233
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LEAD_SOURCE_DIAGNOSIS_SCHEMA, lead-source-diagnosis.ts:89
grounding: 4/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---
## What it does
Root-causes one under-performing lead source (spam vs mis-targeting vs pricing vs volume vs ok) + one action. Entry: `/api/ai` mode `lead-source-diagnosis` → `generateLeadSourceDiagnosis`.
## Prompt & grounding
- System (lead-source-diagnosis.ts:26) defines each cause precisely and pins data-only + "name a concrete better peer source by its numbers".
- Prompt (lead-source-diagnosis.ts:48) carries the source's real leads/qualified/won/qualRate/winRate/spend/CPL/CPQL, the **allowed cause labels**, and — when the caller passes `req.peers` — a **peer-comparison block**.
- **Grounding 4/5**: full single-source economics reach the prompt, but the comparative dimension (peers) is **optional/caller-dependent** (5/5 with peers, 3/5 without) — the prompt instructs naming a concrete peer it may not have been given.
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. schema + normalize + validate + self-repair: all present. `likelyCause`/`severity` **coerced to known sets**; deterministic `pickCause` floor mirrors the prompt rules.
- **Caching:** NONE (`/api/ai`).
- **Golden:** live probe only — **no golden snapshot file**, and the probe fixture omits peers, so the comparative path is untested.
- `temperature: 0.6`.
## Findings
- value · always pass `peers` so the budget-shift recommendation is grounded (4/5→5/5). (stub — [[2026-06-20-run]])
- code · add golden snapshot incl. a peers fixture; add `/api/ai` cache. (stub)
