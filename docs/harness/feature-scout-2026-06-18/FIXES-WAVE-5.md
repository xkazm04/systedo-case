# Feature Scout Fix Wave 5 — "AI-assist" (the gated wave)

> 5 commits, 5 findings closed; **5 new LLM tools added and proven against real Claude**.
> Baseline preserved: tsc 0 → 0 · `next build` pass → pass · unit tests 72/72 ·
> eslint 0 · **`llm:gate` real-Claude suite 5 → 10 tools, all green**.
> (Extended from the initial 3-tool batch with `article-draft` and `cohort-diagnosis`.)
> Branch: `vibeman/feature-scout-ai-assist` (off `master` after Waves 1–4 merged).
> The user's pre-existing uncommitted work was folded in only where correct
> (`.llm-gate-cache.json`, which is a committed, generated cache).

## Theme

The deferred high-value items from earlier waves: real AI generation through the
repo's single LLM chokepoint. Earlier waves avoided these because each adds a
**new server LLM tool**, which edits the hashed `api/ai/route.ts` + `registry.mjs`
and triggers the pre-commit **real-Claude gate**. This wave cleared that landmine
deliberately and safely.

## How the gate landmine was handled (the method that made this safe)

1. **Feasibility first.** Before any work, ran `npm run test:llm` — the existing 5 tools passed against real Claude (~96s), confirming the nested `claude -p` path works here (`claude` v2.1.181 on PATH). Without that, the wave would have been aborted (no hook bypass).
2. **Sequential, not parallel.** Every tool edits the shared `route.ts` + `registry.mjs` + `scripts/llm-gate.mjs` (HASHED_FILES), so parallel subagents would collide. Tools were built one at a time, each a full vertical slice.
3. **Prove-once, then commit.** Each subagent ran `npm run llm:gate --force` (runs the real suite incl. its new tool, then caches the pass in `.llm-gate-cache.json`). The subsequent `git commit` re-runs the gate but hits the cache (hash unchanged) → **fast commit, no second model run**.
4. **Atomic per tool.** Because each tool was finished+committed before the next started, each commit cleanly contains only its own slice of the shared files.

## Commits

| # | Commit | Module | Finding | New tool | Files |
|---|---|---|---|---|---|
| 1 | `9a82a39` | speed-lead | speed-lead.md #1 | `lead-reply` | `lib/ai/tools/lead-reply.ts` (new) + ai-types/validation/route/index/registry/llm-gate + `SpeedLeadModule.tsx` |
| 2 | `b61e914` | distribution | distribution.md #1 | `repurpose` | `lib/ai/tools/repurpose.ts` (new) + lib/distribution/generate.ts + ai-types/validation/route/index/registry/llm-gate + `DistributionModule.tsx` |
| 3 | `0e2a040` | local | local.md #2 | `local-review-reply` | `lib/ai/tools/local-review-reply.ts` (new) + `LocalReviews.tsx` (new client child) + lib/local/sample.ts + ai-types/validation/route/index/registry/llm-gate + `LocalModule.tsx` + page |
| 4 | `b922b4b` | content | content.md #1 | `article-draft` | `lib/ai/tools/article-draft.ts` (new) + `ArticleDraftPanel.tsx` (new client child) + ai-types/validation/route/index/registry/llm-gate + `ContentBriefGenerator.tsx` |
| 5 | `47ea1e1` | ltv | ltv.md #4 | `cohort-diagnosis` | `lib/ai/tools/cohort-diagnosis.ts` (new) + `LtvDiagnosisPanel.tsx` (new client child) + ai-types/validation/route/index/registry/llm-gate + `LtvModule.tsx` |

## What was fixed

1. **Speed-lead — AI reply.** `draftReply()` returned one hard-coded paragraph for every lead. The `lead-reply` tool drafts an on-brand Czech reply tailored to the inquiry ({reply, questions}); a "Vygenerovat AI odpověď" button seeds the existing textarea, with the deterministic draft as the demo/fallback.
2. **Distribution — AI repurposing.** `repurpose()` returned hard-coded per-channel templates that ignored the article body. The `repurpose` tool generates one channel-native variant per channel respecting each channel's char limit; a per-card "Přegenerovat AI variantu" button replaces the text, and the Wave-3 UTM links / length counter / copy / push-to-social keep working on the AI output.
3. **Local — review responses.** Reviews were static cards. Added illustrative `recentReviews` + a `local-review-reply` tool (rating-based tone: thanks for 4–5★, de-escalation + offline offer for ≤3★) and a "use client" `LocalReviews` panel with a per-review "Navrhnout odpověď" button + editable draft.

4. **Content — brief→article draft.** The brief stopped at a skeleton while a full typed Article model + renderer existed but nothing produced an article. The `article-draft` tool emits valid `Block[]` (p/h2/h3/ul/ol/callout/cta) + `FaqItem[]` with strict normalize/validate into the real model; a "Rozepsat článek" panel renders the draft via `ArticleBody` (like `/clanek`) with `.md` + Article-JSON export. (Prompt hardened to a block cap + JSON-only after a first-run timeout → now ~25s.) Closes the brief→draft→publish loop.
5. **LTV — AI cohort diagnosis.** Mirrors the existing `analysis` tool: the `cohort-diagnosis` tool reads the real computed cohort metrics (CAC/LTV/LTV:CAC/payback + trend) and returns `{summary, worstCohort, recommendation, risks?}` (validation forces `worstCohort` to a supplied label, so it can't hallucinate a cohort); an "AI rozbor kohort" panel renders it.

Each tool follows the repo convention exactly: a tagged `generateStructured(..., { id })` call site, a `demo()` deterministic fallback (works from a clean checkout / no provider), a `mode` branch in `/api/ai` with the same quota + rate-limit guards, a validator, types, and a lenient structural entry in `test-llm/registry.mjs`.

## Verification

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` | 0 | **0** |
| `next build` | pass | **pass** |
| `npm run test:unit` | 72/72 | **72/72** |
| `eslint` (changed) | 0 | **0** |
| `llm:gate` real-Claude tools | 5/5 | **10/10** (lead-reply, repurpose, local-review-reply, article-draft, cohort-diagnosis added & proven) |

## Patterns established (catalogue, continued)

19. **Clearing the `llm-gate` landmine:** prove feasibility with `test:llm` first → build tools sequentially (shared HASHED files) → each subagent runs `llm:gate --force` to prove+cache → commit hits the cache (fast). Never bypass the hook.
20. **Add the new tool file to `scripts/llm-gate.mjs` `HASHED_FILES`** so future edits to it correctly re-trigger the real test (each tool did this).
21. **Every AI tool ships a `demo()` deterministic fallback** wrapping the prior hard-coded behavior, so a clean checkout / missing provider still renders and the feature degrades instead of breaking.
22. **Keep the real-test assertion lenient/structural** (keys present, non-empty) so genuine model output passes reliably across runs — strictness lives in the schema, not the test.

## What remains (more AI-assist, per INDEX)

Still deferred (each a new tool, same method): content-engine #2 (cluster map from a keyword list), lp-experiments #3 (variant/hypothesis generator), lead-quality #4 (junk-source diagnosis), compare-seo #5 (comparison-page generator), keywords #1 (intent clustering). Plus the non-AI depth/admin backlog (profit SKU margins/trend, competitor tracking, project-settings Theme G).
