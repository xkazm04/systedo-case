---
type: tiger/home
app: Adamant (systedo-case)
---

# 🐅 Tiger — LLM value map (Adamant)

Home / Map-of-Content for the Tiger vault. Open in Obsidian to navigate the graph. Engine: `.claude/skills/tiger.md` · Per-app config: [[config]].

## Call sites (the inventory)
The highest-value surface — every LLM call. See `call-sites/`. Modalities: **text ×16** (generateStructured tools), **image** (Leonardo), **vision** (Gemini scoring), **embedding** (patterns), plus the shared **[[llm-wrapper]]** chokepoint.

## Characters
Representative users who judge the OUTPUTS (UAT method, scoped to LLM). See `characters/`.

## Sessions
Per-run records + backlogs. See `sessions/` — latest: [[2026-06-20-run]].

## Models
Per-model×thinking benchmark rollups. See `models/`.

## Current headline
Baseline run [[2026-06-20-run]] (10 characters, 18 call sites). Text plumbing is gold-standard ([[llm-wrapper]], [[campaign-eval]]); value leaks at the edges: **P0** — fix the [[lp-variant-ideas]] dropped-grounding bug (2/5), add `/api/ai` input-hash caching, and instrument the un-logged non-text calls ([[creative-image-gen]]/[[creative-vision-score]]/[[patterns-embed]]). **Model:** copy/reply tools need ≥ Sonnet ([[benchmark-2026-06-20]]); constrained tools are the next downgrade test. Full backlog → [[2026-06-20-run]].

**Update:** all P0/P1 from the baseline backlog **resolved same-day** (commits `1395a47`, `4d6a280`) — grounding bug fixed, `/api/ai` caching, reply validate gates, embedding cache, non-text telemetry. Still open: V2/V3/V4 grounding, golden snapshots, the constrained-tool Haiku/thinking benchmark. See [[2026-06-20-run]] § Resolved.
