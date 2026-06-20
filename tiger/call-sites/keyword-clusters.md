---
id: keyword-clusters
type: tiger/call-site
modality: text
file: src/lib/ai/tools/keyword-clusters.ts:235
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — KEYWORD_CLUSTERS_SCHEMA, src/lib/ai/tools/keyword-clusters.ts:59
grounding: 3/3
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
Groups a flat list of researched keywords into 2–6 intent + semantic topic clusters, each with one pillar keyword + supporting keywords beneath it — turning a keyword list into content structure (a pillar page + its subpages). Entry: `/api/ai` mode `keyword-clusters` → [[keyword-clusters]]. Wired by the Keywords module (`ClusterBuilder.tsx`).

## Prompt & grounding
System `KEYWORD_CLUSTERS_SYSTEM` (`keyword-clusters.ts:26`) hard-constrains the model to the supplied keywords only ("invent no word; only regroup", literal text). `buildKeywordClustersPrompt` (`keyword-clusters.ts:38`) feeds every supplied keyword with its optional monthly volume and intent, plus an optional main topic.

REAL context this output *should* use (this is a regrouping task, so its universe is small):
1. the user's real keyword list ✓ — the entire input set reaches the prompt verbatim (`keyword-clusters.ts:39-44`)
2. per-keyword search volume ✓ — supplied and used to pick the pillar
3. per-keyword intent ✓ — supplied when present

Grounding **3/3** — this is the model floor for grounding because the task is *anchored* to the user's data by construction: `normalizeKeywordClusters` (`keyword-clusters.ts:157`) drops any returned keyword not in the input set, dedupes across clusters, and sums `totalVolume` from the supplied numbers. The model literally cannot inject ungrounded content. Strength to protect.

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: keyword-clusters` (`keyword-clusters.ts:240`).
- **Schema + normalize + validate + self-repair:** all four, with the strongest anti-hallucination guard in the cluster. Schema tight; `normalize` (`keyword-clusters.ts:157`) enforces the input-set membership via `inputIndex` (`keyword-clusters.ts:97`); `validate` (`keyword-clusters.ts:213`) flags an empty clustering or a pillar that isn't a supplied keyword → one self-repair re-prompt; deterministic `demoKeywordClusters` buckets by head term as the floor.
- **Prompt bloat:** the input list is the legitimate payload (one line per keyword); not whole records. Note the schema's `intent` is documented but not in `required` (`keyword-clusters.ts:83`) — fine, it's optional and validated against `INTENTS`. `temperature: 0.5` (`keyword-clusters.ts:245`) — appropriately low for a deterministic-ish grouping task.
- **Caching:** `/api/ai` does **NOT** input-hash-cache — re-clustering an unchanged keyword list recomputes. A pure-function-of-input tool like this is the *ideal* cache candidate. Rate-limit/quota inherited.
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** contract golden `test-llm/golden/keyword-clusters.json` (C6), enforced by `llm-eval --strict` in the gate + CI; also a real-Claude probe in `test-llm/registry.mjs` asserting every pillar is a supplied keyword.

## Findings
_(stub — to be impact-scored in [[2026-06-20-run]])_
