---
id: article-draft
type: tiger/call-site
modality: text
file: src/lib/ai/tools/article-draft.ts:248
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — ARTICLE_DRAFT_SCHEMA (flat block schema), src/lib/ai/tools/article-draft.ts:82
grounding: 6/7
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
Expands an approved SEO brief into a near-publishable article draft in the app's headless content model — a typed `Block[]` body (p/h2/h3/ul/ol/callout/cta) plus `FaqItem[]`, the exact shape the `/clanek` `ArticleBody` renderer consumes. Entry: `/api/ai` mode `article-draft` → [[article-draft]]. The heaviest tool (can run ~2 min on a cold CLI spawn, `llm/models.ts:33`).

## Prompt & grounding
System `ARTICLE_DRAFT_SYSTEM` (`article-draft.ts:26`) instructs a flat-block emission (a `type` discriminator + the fields each kind uses) because the CLI provider follows a flat shape far more reliably than a deep `anyOf` union. `buildArticleDraftPrompt` (`article-draft.ts:44`) feeds the full approved brief: H1/title, meta description, audience, content type, the **whole outline** (each H2 + its bullet points), keywords (sliced to 12), and the FAQ questions.

REAL context this output *should* use:
1. H1 / title ✓
2. meta description ✓
3. outline (headings + points) ✓ — the article must follow it section-for-section
4. keywords to weave in ✓ (capped at 12, `article-draft.ts:45`)
5. FAQ questions ✓
6. audience + content type ✓
7. brand voice / product catalogue / internal-link targets ✗ — CTA href is hardcoded `/cena` (`article-draft.ts:173`), no real product/link grounding

Grounding **6/7** — strongly grounded because it consumes the *output of [[brief]]* (a chained tool). The only gap is brand/catalogue/link context; the upstream brief is itself only 5/6 grounded, so the chain inherits that ceiling.

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: article-draft` (`article-draft.ts:269`).
- **Schema + normalize + validate + self-repair:** all four, and unusually rigorous. The flat schema is deliberate; `toBlock` (`article-draft.ts:138`) strictly maps each raw block onto the real typed `Block` union, dropping anything malformed (correctness over coverage). `normalize` falls back to the demo body if zero valid blocks survive (`article-draft.ts:254`). `validateArticleDraft` (`article-draft.ts:237`) flags a body with no usable block → one self-repair re-prompt.
- **Prompt bloat:** bounded — keywords sliced to 12, outline is the user's own (intended) content. `temperature: 0.8` (`article-draft.ts:274`).
- **Caching:** `/api/ai` does **NOT** input-hash-cache — and this is the most expensive tool (~2 min), so a recompute of an identical brief is the costliest waste in the cluster. Strong candidate for a dedupe cache. Rate-limit/quota inherited.
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** NO golden snapshot in `test-llm/golden/` (only ads/analysis/brief/campaign-eval/social have one) — but IS in `test-llm/registry.mjs` (real-Claude probe with a lenient ≥3-well-formed-blocks validator).

## Findings
_(stub — to be impact-scored in [[2026-06-20-run]])_
