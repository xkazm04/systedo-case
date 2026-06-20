---
id: social
type: tiger/call-site
modality: text
file: src/lib/ai/tools/social.ts:141
wrapper: generateStructured
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — SOCIAL_SCHEMA, src/lib/ai/tools/social.ts:63
grounding: 4/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---

## What it does
Generates a platform-tailored caption per requested network (Facebook, Instagram, LinkedIn, TikTok) from a topic + tone, with performance grounding and brand voice. Entry: the dedicated `/api/social/draft` route (`ai: true`) → [[social]] — its **only** route. Deterministic `draftPosts` templates are the demo/per-platform floor. Surfaced in `src/components/social/SocialClient.tsx`, `WeekPlanner.tsx`, `CreativeStudio.tsx`.

## Prompt & grounding
`socialSystem(brand)` (`social.ts:20`) is parameterised by brand — when a brand voice is supplied it tells the model to stick to that brand's products/tone/vocabulary; otherwise the brand is described as "given in the brief". `buildSocialPrompt` (`social.ts:41`) feeds: topic, tone, the per-platform style guide + char limit, and — crucially — an **optional `grounding` block** ("CO TEĎ FUNGUJE", `social.ts:52`) telling the model to lean on real channels/themes/numbers, not generic ideas.

REAL context this output *should* use:
1. topic ✓
2. tone ✓
3. **brand voice** ✓ (optional `brand`, `social.ts:84`) — wired from the UI brand field (`SocialClient.tsx:310`, `WeekPlanner.tsx:183`, `CreativeStudio.tsx:253`)
4. **"what's actually working" performance grounding** ✓ (optional `grounding`) — built from the real dashboard snapshot by `perfGrounding()` (`/api/social/draft` route `:33`): top ROAS channels + revenue delta for the actual client
5. the brand's full product catalogue / past top-performing posts ✗ — only a compact digest, not the corpus

Grounding **4/5** — the best-grounded text tool, because it feeds real per-client performance data and brand voice. **V2 REFUTED (adversarial verify, 2026-06-20):** the baseline finding alleged an ungrounded `/api/ai mode=social` path that degrades to ~2/5. That path **does not exist** — `src/app/api/ai/route.ts` has **no `social` case** (modes: ads, brief, analysis, lead-reply, repurpose, local-review-reply, article-draft, cohort-diagnosis, keyword-clusters, comparison-outline, lp-variant-ideas, lead-source-diagnosis). The tool is reachable **only** through `/api/social/draft`, which always adds `perfGrounding()` server-side and forwards `brand` (`SocialClient.tsx:302,310`; WeekPlanner equivalently). There is no degraded path to fix; grounding stays 4/5 (ceiling is the missing full catalogue/post corpus, item 5).

## Code quality (wrapping · logging · caching)
- **Wrapping:** clean, single tagged call `// llm-tool: social` (`social.ts:142`).
- **Schema + normalize + validate + self-repair:** all four, defined inline. `normalize` (`social.ts:101`) clamps each post to `PLATFORM_LIMITS`, keeps one post per requested platform and fills skipped platforms from `draftPosts`; `validate` (`social.ts:124`) flags over-limit posts → one self-repair re-prompt.
- **Prompt bloat:** none — the grounding block is a pre-built compact digest (top-2 channels), not raw records. `temperature: 0.9` (`social.ts:149`).
- **Caching:** neither `/api/ai` nor `/api/social/draft` input-hash-caches — and the grounding digest changes only when the dashboard data changes, so identical (topic, tone, platforms, grounding) calls recompute. Rate-limit/quota inherited on both routes.
- **Telemetry:** inherited from [[llm-wrapper]].
- **Golden coverage:** YES — `test-llm/golden/social.json`; also in `test-llm/registry.mjs`. (Both the golden + probe exercise the un-grounded path — topic only — so the grounding/brand wiring is not gate-covered.)

## Findings
- ❎ value · **V2 REFUTED** — no ungrounded `/api/ai mode=social` path exists; the only route (`/api/social/draft`) always passes grounding + brand. No code change. [[2026-06-20-run]]
- code · the grounded path is gate-covered only on its un-grounded probe (golden + registry exercise topic-only); a grounded fixture would close that gap. (open)
