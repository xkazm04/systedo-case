---
type: tiger/home
app: Adamant (systedo-case)
---

# 🐅 Tiger — LLM value map (Adamant)

Home / Map-of-Content for the Tiger vault. Open in Obsidian to navigate the graph. Engine: `.claude/skills/tiger.md` · Per-app config: [[config]].

## Call sites (the inventory)
The highest-value surface — every LLM call. See `call-sites/`. **24 active** (+1 retired). Modalities: **text ×20** (generateStructured tools), **image** (Leonardo), **vision** (Gemini scoring), **embedding** (patterns), plus the shared **[[llm-wrapper]]** chokepoint.

## Characters
Representative users who judge the OUTPUTS (UAT method, scoped to LLM). See `characters/`.

## Sessions
Per-run records + backlogs. See `sessions/` — latest: [[2026-07-15-scan]] · baseline: [[2026-06-20-run]].

## Models
Per-model×thinking benchmark rollups. See `models/`.

## Current headline
Latest scan [[2026-07-15-scan]] (24 active sites, +7 since baseline). The 7 new call sites — [[channel-research]] [[chat]] [[local-diagnosis]] [[monthly-recap]] [[onboarding-scan]] [[twin-reply]] [[twin-style]] — are all **code_score 5** with **excellent grounding** (6/7 land ≥5/6; [[onboarding-scan]] avoids the URL-hallucination trap by injecting real fetched page text). The baseline's patterns (validate-gate, demo-floor, effective-grounding-versioned cache) propagated cleanly; new high-water marks in [[monthly-recap]] (two-layer cache) and [[twin-style]] (do/dont double-defense). **[[lead-reply]] retired** → absorbed into [[twin-reply]].

**One sharp finding (V1, HIGH) — ✅ BENCHMARKED & CONFIRMED:** [[twin-reply]] runs `tier:"fast"` (Haiku), replacing [[lead-reply]] (pinned ≥Sonnet). [[benchmark-2026-07-15-twin-reply]] (haiku/sonnet/opus × 2 scenarios) shows **Haiku 2.9/5 vs Sonnet 5.0** on stakes-sensitive replies — Haiku miscalibrates `confidence` (78 on a health complaint vs Sonnet's 35) and leaves `risks` empty while proposing unverified slots, both of which erode the auto-send gate. **Action ready:** set `twin-reply` `tier:"fast"`→`"quality"` (twin-reply.ts:196 + registry.mjs:165), re-run LLM gate. Opus adds no lift over Sonnet. **V2 (MED):** [[twin-style]] is high-leverage (feeds 3 tools) but has no quality score. Full backlog → [[2026-07-15-scan]].

**Baseline (resolved):** the whole [[2026-06-20-run]] backlog was worked through (grounding bug, `/api/ai` caching, reply validate gates, embedding cache, non-text telemetry, contract goldens, constrained-tool benchmark). Still open there: **M1** prod follow-through (Flash quality-check + Gemini-Pro trial — needs a live Gemini run).
