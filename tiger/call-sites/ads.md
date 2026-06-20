---
id: ads
type: tiger/call-site
modality: text
file: src/lib/ai/tools/ads.ts:134
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — AD_SCHEMA, src/lib/ai/tools/ads.ts:48
grounding: 4/7
code_score: 4
quality_score: 4.0  # sonnet, per [[benchmark-2026-06-20]]
recommended_model: sonnet  # keep — Haiku violates char limits (relies on clamp); Opus +5x latency
status: benchmarked
last_scanned: 2026-06-20
characters: ["[[petr-ppc-copywriter]]"]
---

## What it does
Generates a full set of Czech search-network PPC ads (8 headlines, 4 descriptions, 4 callouts, 8 keywords, 1 long headline, rationale) for Google Ads / Sklik from a campaign brief. Entry: `/api/ai` mode `ads` → [[ads]] via the `adsSkill` Skill plugin (`src/lib/ai/tools/ads.ts:121`). Surfaced in the Creative Studio / ads UI.

## Prompt & grounding
System `AD_SYSTEM` (`ads.ts:18`) is a fixed Czech PPC-copywriter persona with the platform char limits inlined from `AD_LIMITS`. `buildAdPrompt` (`ads.ts:28`) feeds: platform, product, benefits/USP, audience, tone — five free-text fields the user types.

REAL context this output *should* use:
1. product/service ✓ reaches prompt
2. USP / benefits ✓
3. audience ✓
4. tone ✓
5. platform (drives the right char limits) ✓ — but counts as a parameter, not user data
6. the brand's real voice / past winning ad copy / banned phrases ✗ — never supplied
7. the campaign's actual keywords / landing page / price points ✗ — keywords are *invented* by the model, not grounded in the user's Keyword Planner data (unlike [[brief]], which accepts a `keywords` block)

Grounding **4/7**: the four typed fields land, but there is no link to the user's keyword research, landing page, or brand corpus. The closely related [[brief]] tool already accepts real Keyword-Planner volumes; ads does not — its `keywords` output is pure model invention. Cite `ads.ts:54` (schema asks for "8 keyword suggestions", `buildAdPrompt:43`).

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean. Routed through [[llm-wrapper]] `generateStructured` via `skillToGenerateArgs(adsSkill, req)` (`ads.ts:135-137`), tagged `// llm-tool: ads`. One tagged call.
- **Schema + normalize + validate + self-repair:** all four present. `AD_SCHEMA` is tight with `propertyOrdering`; `normalizeAdResult` (`ads.ts:62`) clamps every field to `AD_LIMITS` as a guaranteed floor; `validateAds` (`ads.ts:78`) flags over-limit copy so the wrapper does one self-repair re-prompt (`llm/index.ts:178`). Strong example of the repair loop actually being wired.
- **Prompt bloat:** none — bounded short fields only. `temperature: 1.0` (`ads.ts:127`) is high for limit-sensitive copy but the clamp/repair backstop covers it. No explicit `maxTokens` (inherited from provider defaults).
- **Caching:** `/api/ai` does **NOT** input-hash-cache — every identical `(product, benefits, audience, tone, platform)` recomputes a paid call. Worth a dedupe cache. Rate-limit/quota via `src/lib/ai/rate-limit.ts` + `src/lib/usage.ts` (per-IP + per-user `aiEval`).
- **Telemetry:** inherited from [[llm-wrapper]] (`recordLlmCall`, `llm/index.ts:213`).
- **Golden coverage:** YES — `test-llm/golden/ads.json`; also in `test-llm/registry.mjs` (real-Claude probe).

## Findings
_(stub — to be impact-scored in [[2026-06-20-run]])_
