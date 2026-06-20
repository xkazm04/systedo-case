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
quality_score: "—"
recommended_model: "—"
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
- **Caching:** NONE — `/api/ai` rate-limited + quota'd but no input-hash cache; identical period re-pays.
- `temperature: 0.7` high for a strict numeric read.
## Findings
- code/value · uncached `/api/ai` — add input-hash cache mirroring [[campaign-eval]]. (stub — [[2026-06-20-run]])
- code · lower temp toward 0.4. (stub)
