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
Baseline run [[2026-06-20-run]] (10 characters, 18 call sites). Text plumbing is gold-standard ([[llm-wrapper]], [[campaign-eval]]); value leaks at the edges: **P0** — fix the [[lp-variant-ideas]] dropped-grounding bug (2/5), add `/api/ai` input-hash caching, and instrument the un-logged non-text calls ([[creative-image-gen]]/[[creative-vision-score]]/[[patterns-embed]]). **Model:** copy/reply tools need ≥ Sonnet ([[benchmark-2026-06-20]]); the constrained-tool test ran ([[benchmark-2026-06-20-constrained]]) — only [[keyword-clusters]] downgrades to Haiku/Flash, the numeric reads keep ≥ Sonnet. Full backlog → [[2026-06-20-run]].

**Update:** the whole baseline backlog is **worked through** — P0/P1 same-day (grounding bug, `/api/ai` caching, reply validate gates, embedding cache, non-text telemetry), then V2 (refuted) / V3 / V4 grounding, C5 (repurpose body digest), C6 (contract goldens for all 14 tools + gate/CI enforcement), C7 (analysis temp 0.4), and M2 (constrained-tool benchmark). Still open: **M1** prod follow-through (Flash quality-check + Gemini-Pro trial on the 5 ≥Sonnet tools — needs a live Gemini run) + minor value ceilings. See [[2026-06-20-run]] § Resolved.
