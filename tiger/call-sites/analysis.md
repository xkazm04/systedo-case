---
id: analysis
type: tiger/call-site
modality: text
file: src/lib/ai/tools/analysis.ts:152
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — ANALYSIS_SCHEMA, analysis.ts:37
grounding: 5/5
code_score: 4
quality_score: 5  # sonnet ships; haiku-direct 0/5 (inverted economics), per [[benchmark-2026-06-20-constrained]]
recommended_model: "sonnet — KEEP (Haiku inverted PNO economics: recommended cutting the best channel; thinking only partly rescued)"
status: assessed
last_scanned: 2026-06-20
characters: []
---
## What it does
Dashboard performance-analysis card: dataset → client-facing PPC read (headline, summary, wins, risks, 3–4 actions). Entry: `/api/ai` mode `analysis` → `generateAnalysis`.
## Prompt & grounding
- System (analysis.ts:16) hard-pins "Vycházej VÝHRADNĚ z předaných čísel"; demands concrete channels/numbers.
- Prompt built server-side from the **same dataset the dashboard renders**: `buildSnapshot(req.period)` → `snapshotToPromptText` ([[snapshot]], snapshot.ts:82). Only `period` comes from the request — no client-supplied figures.
- Reaches the prompt: totals + period-over-period **deltas with significance**, per-channel revenue/share/PNO/ROAS/delta, the **pacing forecast band**, **dated anomalies** with z-score, and client name/domain/segment. **Grounding 5/5** — richest-grounded site.
## Code quality (wrapping · logging · caching)
- Single chokepoint [[llm-wrapper]]; one tagged call. Telemetry inherited.
- schema + normalize (analysis.ts:59) + validate (analysis.ts:80, flags hollow output) + self-repair: all four present.
- **Golden:** yes (`test-llm/golden/analysis.json`) + live probe.
- **Caching:** input-hash response cache on `/api/ai` (C1, `response-cache.ts`) — identical (mode, locale, input) reuses the result without re-paying the model or spending quota.
- `temperature: 0.4` (C7, was 0.7) — low for a strictly-grounded numeric read; consistent verdicts + better cache reuse.
## Findings
- ✅ code/value · **C1 resolved** — `/api/ai` input-hash cache (mirrors [[campaign-eval]]). [[2026-06-20-run]]
- ✅ code · **C7 resolved** — temperature 0.7 → 0.4. [[2026-06-20-run]]
