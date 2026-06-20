---
id: brief
type: tiger/call-site
modality: text
file: src/lib/ai/tools/brief.ts:177
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — BRIEF_SCHEMA, src/lib/ai/tools/brief.ts:61
grounding: 5/6
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
Produces a Czech SEO content brief (title tag, meta description, H1, slug, 5–7-section H2 outline, FAQ, related keywords, internal-link anchors, rationale) for a web/e-shop page. Entry: `/api/ai` mode `brief` → [[brief]]. Surfaced in `ContentBriefGenerator.tsx`, which seeds the optional keyword grounding from the keyword-research tool.

## Prompt & grounding
System `BRIEF_SYSTEM` (`brief.ts:16`) inlines `SEO_LIMITS` and enforces the primary keyword landing in title + meta + first H2. `buildBriefPrompt` (`brief.ts:28`) feeds: content type, topic, primary keyword, audience, **and an optional real Keyword-Planner block** (`brief.ts:29-39`) — `req.keywords` with monthly volume + competition, capped at 12, with an instruction to prioritise high-volume / low-competition terms.

REAL context this output *should* use:
1. topic ✓
2. primary keyword ✓
3. audience ✓
4. content type ✓
5. **real keyword demand data** (volume + competition) ✓ — this is the standout: actual user data reaches the prompt (`brief.ts:34-37`), wired from the UI's grounding state (`ContentBriefGenerator.tsx:307`)
6. brand voice / existing site structure / competing SERP pages ✗ — the demo hardcodes a brand ("Mionelo", `brief.ts:151`) but the live prompt has no brand grounding and no SERP/competitor signal

Grounding **5/6** — the best-grounded tool in this cluster because it ingests real Keyword-Planner numbers. Only missing piece is brand/SERP context.

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: brief` through [[llm-wrapper]] (`brief.ts:178`).
- **Schema + normalize + validate + self-repair:** all four. `BRIEF_SCHEMA` tight (nested outline/faq objects with `propertyOrdering`); `normalizeBriefResult` (`brief.ts:99`) clamps title/meta to `SEO_LIMITS`, filters malformed outline/faq entries; `validateBrief` (`brief.ts:131`) flags over-limit title/meta → one self-repair re-prompt.
- **Prompt bloat:** none — the keyword block is explicitly sliced to 12 (`brief.ts:29`), a digest not a record dump. `temperature: 0.9` (`brief.ts:184`).
- **Caching:** `/api/ai` does **NOT** input-hash-cache — identical brief requests recompute. Rate-limit/quota inherited (`rate-limit.ts`, `usage.ts`).
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** YES — `test-llm/golden/brief.json`; also in `test-llm/registry.mjs`.

## Findings
_(stub — to be impact-scored in [[2026-06-20-run]])_
