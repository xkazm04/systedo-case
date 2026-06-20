---
id: comparison-outline
type: tiger/call-site
modality: text
file: src/lib/ai/tools/comparison-outline.ts:246
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — COMPARISON_OUTLINE_SCHEMA, src/lib/ai/tools/comparison-outline.ts:74
grounding: 4/6
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
From one high-intent comparison query + its intent (vs / alternative / pricing / review) it returns a publish-ready comparison-page scaffold: H1, 4–7 ordered sections (heading + points), comparison criteria, a verdict and a FAQ — intent-aware framing, not a generic SEO brief. Entry: `/api/ai` mode `comparison-outline` → [[comparison-outline]]. Wired by `CompareSeoTable.tsx`.

## Prompt & grounding
System `COMPARISON_OUTLINE_SYSTEM` (`comparison-outline.ts:27`) switches the page structure by intent and explicitly says: if a competitor / your-positioning is given, treat it as real data and name it; if not, stay generic and invent no competitor facts/prices/names. `buildComparisonOutlinePrompt` (`comparison-outline.ts:44`) feeds: query, intent, optional monthly volume, optional competitor name, optional positioning/differentiators, plus a grounded-vs-generic instruction switch (`comparison-outline.ts:66`).

REAL context this output *should* use:
1. target query ✓
2. intent ✓
3. monthly volume ✓ (when supplied)
4. **competitor name** ✓ (optional, `comparison-outline.ts:54`) — real entity grounding when present
5. **your positioning / differentiators** ✓ (optional, `comparison-outline.ts:55`, validated + capped to 600 chars in `validation.ts:420`)
6. the competitor's actual features/pricing/SERP data ✗ — never available; the tool *honestly* tells the model to stay generic without it (the right call, but it caps the ceiling)

Grounding **4/6**: query + intent + volume always land, and competitor + positioning land *when the user fills them in* — but both are optional and frequently empty, so the common path is closer to 3/6. The design is honest about the gap (no invented competitor facts), which is the correct safety posture.

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: comparison-outline` (`comparison-outline.ts:272`).
- **Schema + normalize + validate + self-repair:** all four. Schema tight (nested sections/faq with `propertyOrdering`); `normalize` (`comparison-outline.ts:252`) sanitizes + length-clamps sections/criteria/faq and back-fills from the intent-templated `demoComparisonOutline` when a field is empty; `validateComparisonOutline` (`comparison-outline.ts:228`) flags a hollow scaffold (no h1 / no sections / no faq) → one self-repair re-prompt.
- **Prompt bloat:** none — all bounded short fields. `temperature: 0.7` (`comparison-outline.ts:278`).
- **Caching:** `/api/ai` does **NOT** input-hash-cache — identical query+intent recomputes. Rate-limit/quota inherited.
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** contract golden `test-llm/golden/comparison-outline.json` (C6), enforced by `llm-eval --strict` in the gate + CI; also a real-Claude probe in `test-llm/registry.mjs` (structural validator on the generic path).

## Findings
_(stub — to be impact-scored in [[2026-06-20-run]])_
