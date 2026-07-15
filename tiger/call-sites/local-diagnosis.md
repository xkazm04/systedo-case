---
id: local-diagnosis
type: tiger/call-site
modality: text
file: src/lib/ai/tools/local-diagnosis.ts:250
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet (quality tier) / gemini quality tier
schema: yes — LOCAL_DIAGNOSIS_SCHEMA, src/lib/ai/tools/local-diagnosis.ts:114
grounding: 5/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-07-15
characters: []
---
## What it does
Grounded local-SEO diagnosis for the `local` project type (demo "Dentalis"): reads a project's resolved local-visibility figures (coverage/gaps, map-pack ranking ladder, review sentiment, location roster) → concise Czech diagnosis — one coverage gap to close first (`worstGap`), one `recommendation`, optional `risks`. `generateLocalDiagnosis` (local-diagnosis.ts:250). Route: `POST /api/ai` case `"local-diagnosis"` (route.ts:545-547) → `buildLocalDiagnosisRequest` (src/lib/diagnoses/local-request.ts:38); UI `LocalDiagnosisPanel.tsx`/`LocalModule.tsx`.

## Prompt & grounding
System (`localDiagnosisSystem`, :25-38) — Czech local-SEO persona, hard `antiFabrication("předaných spočítaných čísel")` (:29), `worstGap` must be exactly one supplied gap label (:30). Prompt (`buildLocalDiagnosisPrompt`, :94-112) is assembled purely from computed figures, no free-text passthrough:
- Coverage + allowed-gap list (`coverageLines` :41-55): coveragePct, withPage/trackedCombos, gapVolume, each gap `label: monthlyVolume`.
- Ladder rollup (`ladderLine` :58-73): in-pack/tracked, top1, avgRank, 30-day trend, tagged `[zdroj: živá data | ukázková data]` via `l.live`.
- Reviews rollup (`reviewsLine` :76-83): total/avg/positive/neutral/negative + live-vs-sample tag.
- Locations rollup (`locationsLine` :86-92): total / attention / unanswered.
All five families originate from resolved data in local-request.ts; the model gets numbers only, live-vs-sample provenance passed honestly. **Grounding 5/5.**

## Code quality (wrapping · logging · caching)
- Single-chokepoint `generateStructured` (index.ts:267), id matches `// llm-tool:` tag (:256-257); native schema + `normalize` + `validate` + `demo` (:262-264). temperature 0.6 (:261) — consistent with sibling `cohort-diagnosis`/`lead-source-diagnosis`. No `tier` → quality (correct; only light `local-review-reply` opts fast).
- `validateLocalDiagnosis` (:170-184) flags hollow output + off-list `worstGap` → self-repair; `normalizeLocalDiagnosis` (:143-165) hard floor via `worstGapOf` highest-volume pick + `demoLocalDiagnosis`. abortSignal threaded (:253,:266).
- Telemetry via chokepoint. Caching via `cachedRespond` (route.ts:84), global-spend refund on hit, BYOM-bucketed.
- `demoLocalDiagnosis` (:188-248) fully data-driven → honest keyless card w/ `demoTail`.
- Golden test-llm/golden/local-diagnosis.json (promptHash `61e66c9eda9838fa`); registered registry.mjs:529.

## Findings
- **best-in-class exemplar** — no defects. Same wrapping + temperature + validate→repair→normalize→demo + domain-limited-enum discipline as its diagnosis siblings. [[2026-07-15-scan]]
- **code (info, cosmetic)** — golden/registry `system` string (registry.mjs:531-532) is a hand-shortened paraphrase of runtime `localDiagnosisSystem()`; gate keys on promptHash so harmless, but can mislead a reader diffing the two. [[2026-07-15-scan]]
