---
id: lp-variant-ideas
type: tiger/call-site
modality: text
file: src/lib/ai/tools/lp-variant-ideas.ts:164
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LP_VARIANT_IDEAS_SCHEMA, src/lib/ai/tools/lp-variant-ideas.ts:60
grounding: 2/5
code_score: 4
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
From a topic / keyword context (an LP experiment's cluster + name + keywords) it returns 2–3 distinct CHALLENGER landing-page variant concepts to A/B test against the control — each a testable hypothesis with a headline draft, primary CTA and a one-line rationale. Entry: `/api/ai` mode `lp-variant-ideas` → [[lp-variant-ideas]]. Turns the LP-experiments module's hand-authored variant strings into AI-drafted concepts.

## Prompt & grounding
System `LP_VARIANT_IDEAS_SYSTEM` (`lp-variant-ideas.ts:26`) is a CRO/copywriter persona: 2–3 *distinct* hypotheses, each different from the control, never reuse a proven loser, beat the control CVR, invent no numbers. `buildLpVariantIdeasPrompt` (`lp-variant-ideas.ts:37`) is *designed* to feed: topic, keywords, control label, control description, **control CVR to beat**, and **already-tested losing angles**.

REAL context this output *should* use:
1. topic / cluster ✓
2. keywords ✓
3. control label ✓ (so challengers differ from control)
4. **control description** ✓ (the angle to differ from)
5. **control CVR to beat** ✗ — DROPPED on the way in (see below)
6. **already-tested losing angles** (`losers`) ✗ — DROPPED on the way in

Grounding **2/5** of the *commonly-reaching* signals, and a concrete bug caps it: the UI **already sends** `controlCvr` + `losers` — `LpExperimentsModule.tsx:70-77` computes them from the real experiment (control CVR + the variants whose uplift went negative) and `LpVariantIdeasPanel.tsx:77-78` puts them on the `/api/ai` request body. The prompt builder is ready to use them (`lp-variant-ideas.ts:47` controlCvr, `lp-variant-ideas.ts:39,50` losers). But **`validateLpVariantIdeasRequest` silently drops them** — `src/lib/ai/validation.ts:425-453` only copies topic/keywords/controlLabel/controlDescription onto the validated `value` (and `LpVariantIdeasRequest` declares both fields, `ai-types.ts:602,604`). So the two highest-value experiment signals — the bar to beat and the angles already disproven — are sent by the client, then thrown away server-side before they ever reach the prompt. The system prompt promises behaviour the request layer makes impossible.

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: lp-variant-ideas` (`lp-variant-ideas.ts:169`).
- **Schema + normalize + validate + self-repair:** all four. Schema tight; `toVariant` (`lp-variant-ideas.ts:93`) drops concepts missing a label or hypothesis and clamps each field; `normalize` clamps to 3 and falls back to `demoLpVariantIdeas`; `validate` (`lp-variant-ideas.ts:126`) flags a hollow set → one self-repair re-prompt.
- **Prompt bloat:** none — bounded short fields; keywords de-duped + capped to 20 in `validation.ts:437`. `temperature: 0.8` (`lp-variant-ideas.ts:174`).
- **Caching:** `/api/ai` does **NOT** input-hash-cache. Rate-limit/quota inherited.
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** NO golden snapshot in `test-llm/golden/` — but IS in `test-llm/registry.mjs` (real-Claude probe; note the probe input also omits controlCvr/losers, so the dropped-grounding bug is invisible to the gate).

## Findings
_(stub — to be impact-scored in [[2026-06-20-run]]. Headline: wire `controlCvr` + `losers` through `validateLpVariantIdeasRequest` → grounding 2/5 → 4/5.)_
