# AI Generation Tools & API — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. The /api/ai endpoint has no caching or persistence — every generation re-bills the provider and is thrown away
- **Severity**: High
- **Lens**: Both
- **Category**: functionality
- **File**: src/app/api/ai/route.ts (vs. src/app/api/campaigns/analyze/route.ts)
- **Opportunity**: The sibling `/api/campaigns/analyze` route already does input-hash caching (`hashEvalInputs` + `findCachedReport`) and `saveReport` persistence with `?force=1` bypass. The `/api/ai` route (ads/brief/analysis) does none of this: identical requests always re-spawn the paid LLM, and outputs vanish after render. The grounded `analysis` mode is especially wasteful — its input is a deterministic `buildSnapshot(period)` keyed by just `30d|90d|12m`, so at most 3 distinct results exist yet every click re-pays.
- **Value**: Cuts provider spend on the most repeated calls, drops latency from ~tens-of-seconds to instant on cache hits, and unlocks a "saved generations / history" surface that turns one-shot demos into a product (compare drafts, revisit briefs). Demonstrates cost-discipline to the agency client.
- **Effort**: M
- **Fix sketch**: Reuse the campaigns pattern — derive an `inputHash` per mode (for `analysis`, just the period; for `ads`/`brief`, a hash of the validated request) and add a `findCachedAiResult`/`saveAiResult` pair to a small SQLite table; return `{ ...response, cached: true }` and honor a `?force=1` query param exactly as `analyze/route.ts` does.

## 2. Campaign evaluation is a fully-built 4th tool the public /api/ai endpoint never exposes
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/lib/gemini.ts (`generateCampaignEvaluation`) + src/app/api/ai/route.ts (mode switch)
- **Opportunity**: `gemini.ts` ships a complete fourth tool — `generateCampaignEvaluation` with `EVAL_SCHEMA`, `EVAL_SYSTEM`, demo fallbacks and a 0–100 health score — but `AI_MODES` in `ai-types.ts` is hard-capped to `["ads","brief","analysis"]` and the route `switch(mode)` has no `eval` case. It is reachable only through the separate, sync-gated `/api/campaigns/analyze` flow. The generic AI assistant UI therefore advertises 3 pillars when 4 exist.
- **Value**: Surfaces an existing capability as a headline feature with near-zero net-new build — a "score any campaign 0–100 with prioritized next steps" tool is the most sales-ready of the four for an agency pitch, and the score lends itself to a recurring scorecard/report product.
- **Effort**: S
- **Fix sketch**: Add `"eval"` to `AI_MODES`/`AiMode` and a `case "eval"` in `route.ts` that calls `validateEvaluationRequest` then `generateCampaignEvaluation`; or document the deliberate split and merge the two routes behind one `mode` envelope so the four pillars are consistent.

## 3. Token/cost & repair telemetry is computed in AiMeta but never shown — a built-in productization story is invisible
- **Severity**: High
- **Lens**: Both
- **Category**: monetization
- **File**: src/lib/ai-types.ts (`AiMeta`) + src/lib/llm/cost.ts (`estimateCostUsd`)
- **Opportunity**: `generateStructured` already stamps every response with `usage`, `estCostUsd`, `tookMs`, `attempts`, `provider`, `fellBack`, `repaired` and `violations`, and `cost.ts` maintains a per-model rate table — yet a grep of `src/app` finds zero consumers of `estCostUsd`/`usage`/`tookMs`. The "subscription (free dev) vs metered (prod) Gemini" cost story is fully instrumented and entirely hidden.
- **Value**: This is the spine of the monetization narrative for a marketing-analytics product: a visible "this analysis cost $0.0003, 2.1s, self-repaired once" badge plus an aggregate spend meter proves ROI, justifies tiered/usage pricing, and differentiates from black-box competitors. It also makes the rate-limit quotas (finding 5) feel like a fair "plan", not a wall.
- **Effort**: S
- **Fix sketch**: Render the existing `meta.estCostUsd`/`tookMs`/`provider`/`repaired` fields in the result panel, and add a session/day spend rollup; the data already travels over the wire in every `AiResponse`.

## 4. No multilingual or per-client tone/brand control — prompts hard-code Czech and a literal "Mionelo" brand
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/lib/gemini.ts (`AD_SYSTEM`/`BRIEF_SYSTEM`/`ANALYSIS_SYSTEM`/`EVAL_SYSTEM`, `demoBrief`)
- **Opportunity**: Every system prompt mandates "Piš výhradně česky" and the brief demo even bakes in `| Mionelo`. There's no `language` or `brandVoice`/`forbiddenClaims` input on `AdRequest`/`BriefRequest`. A Czech agency serving multi-market e-shops (SK/EN/DE) or multiple brands cannot retarget the tools without code edits, and the brand string leaks into demo output for any client.
- **Value**: Multi-language + per-brand voice turns a single-client case study into a reusable agency platform (every new market/client is a config, not a fork) and is a concrete upsell axis. Removing the hard-coded brand also fixes a credibility bug in the keyless demo.
- **Effort**: M
- **Fix sketch**: Add optional `language` and `brandVoice`/`bannedClaims` fields to the request types + validators, interpolate them into the `*_SYSTEM` strings (replacing the fixed Czech directive), and parameterize the `demoBrief` brand instead of the literal `Mionelo`.

## 5. Rate-limit quotas exist but are framed as anti-abuse only — no quota/plan UX to convert limits into a pricing tier
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: monetization
- **File**: src/lib/ai/rate-limit.ts (`RATE_RULES`, env-tunable) + src/app/api/ai/route.ts
- **Opportunity**: A real per-IP/day quota engine (`aiPerDay` = 80, env-tunable, SQLite-backed) is already in place purely as a budget guard returning bare 429s. There is no surfaced "X of 80 generations left today", no auth/account dimension, and no upgrade path — the infrastructure for usage-based tiers exists but is invisible and anonymous.
- **Value**: Reframing the existing daily counter as a visible quota ("Free: 80 generations/day") is the cheapest possible path from demo to freemium SaaS — same code, new revenue story — and the remaining-count header doubles as honest UX that reduces surprise 429s.
- **Effort**: M
- **Fix sketch**: Return remaining-budget headers (e.g. `X-RateLimit-Remaining`) from `rateLimit`/the route, render a quota meter client-side, and key the `bucket` on an account/API-key instead of `clientIp` to introduce per-plan limits.
