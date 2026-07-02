# Feature Scout — AI Generation Tools & API (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/app/api/ai/route.ts, src/lib/gemini.ts, src/lib/ai-types.ts, src/lib/snapshot.ts

## 1. Keep a per-tool generation history instead of overwriting the last result
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/ai/useAiTool.ts:24`
- **Opportunity**: `useAiTool` persists exactly ONE result per mode (`systedo.ai.result.${mode}`, a single localStorage slot) — every re-run silently destroys the previous generation the user paid quota for. Twelve tools share this hook, so across the whole AI surface there is no way to get back yesterday's brief, compare two ad batches, or recover after an accidental "Vygenerovat znovu". Only ads has an escape hatch (save-to-experiment via `src/lib/ai/experiments.ts`).
- **Why valuable**: Generations cost real quota (`aiEval`) and real model spend; losing prior outputs on regenerate is the single biggest workflow leak in the AI tools. A bounded history also unlocks "compare & pick" — the behavior the ads A/B experiments already prove users want.
- **Build sketch**: In `useAiTool.ts`, replace the single `StoredResult` slot with a bounded list (last ~5 per mode, same `RESULT_SCHEMA_VERSION` guard, evict oldest); expose `history` + `restore(i)` from the hook. Add a small "Předchozí generace" strip to the shared result chrome in `src/components/ai/primitives.tsx` (timestamp + one-line preview + restore), so all 12 panels get it for free. No server change, no hashed file — pure client; the wave must finish with a full `next build` per the [CLIENT] rule.

## 2. Add a "refine with instructions" re-run to the non-hashed tools
- **Impact**: 8/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/lib/ai-types.ts:352`
- **Opportunity**: Every tool is one-shot: there is no way to say "kratší", "více na benefity", "vynech ceny" and re-run. Worse, the 15-min input-hash cache (`src/lib/ai/response-cache.ts:10`) means an unchanged re-submit returns the byte-identical cached result — users literally cannot get a different take without mangling their input. A free-text `refine` note both delivers the iteration loop and naturally busts the cache (it changes `hashAiInput`).
- **Why valuable**: Iterative steering is the expected UX of every AI writing tool in 2026; its absence makes the demo feel one-shot and makes "regenerate" look broken (same output back). Zero gate cost if scoped to the newer tools.
- **Build sketch**: Add optional `refine?: string` to the request interfaces of the NON-hashed tools in `ai-types.ts` (repurpose, lead-reply, local-review-reply, article-draft, lp-variant-ideas, comparison-outline, keyword-clusters, cohort/lead-source diagnosis); accept + length-cap it in `src/lib/ai/validation.ts` (not hashed); append it to the *prompt* (never the system prompt/schema, so the gate fingerprint is untouched) in each tool's prompt builder; add a refine input under the result in the client panels. `ads`/`brief`/`analysis` live in hashed tool files — extend them later in one batched [GATE] commit. Reuse `digest`/`clamp` from `tools/_shared.ts` read-only for capping.

## 3. Consume the typed AiError envelope in the client hook (countdown, auto-retry, quota CTA)
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/ai/useAiTool.ts:121`
- **Opportunity**: The server ships a typed `AiError` (`ai-types.ts:75-86` — `code`, `retryAfter`, `upgradeUrl`, plus a `Retry-After` header), but `useAiTool` reads only `json?.error` and throws the structure away. The contract is half-implemented: producer done, the single shared consumer ignores it, so a 429 renders as a dead-end string.
- **Why valuable**: Rate limits are the most common failure the anonymous demo audience hits; a live "zkuste to za 12 s" countdown with auto-re-enable (and rendering the already-provided `upgradeUrl` link on `code: "quota"`) turns a dead-end into a self-healing wait across all 12 tools at once.
- **Build sketch**: In `useAiTool.ts`, parse the failure body as `AiError` (import the existing type), expose `{ code, retryAfter, upgradeUrl }` alongside `error`; add a countdown state that re-enables `run()` when it hits zero (optionally one auto-retry for `rate_limited`). Surface it once in the shared error rendering in `primitives.tsx`. Purely client-side; no hashed file.

## 4. Expose a preflight GET /api/ai/status (provider mode + remaining budget)
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/ai/rate-limit.ts:102`
- **Opportunity**: The client only learns it is in keyless demo mode *after* a generation completes (`meta.demo`, rendered post-hoc in `primitives.tsx:189`), and has no view of the per-IP budget (`aiPerMin` 8, `aiPerDay` 80) until it slams into a 429. Signed-in users have `/api/usage`; anonymous users — the demo's primary audience — have nothing.
- **Why valuable**: Users fill in a careful product/benefits/audience form and only then discover the answer is canned demo output or that today's budget is gone. A one-call preflight lets every panel warn upfront ("Demo režim — bez API klíče" / "Zbývá 3 generování dnes") and disable submit at zero.
- **Build sketch**: Add a read-only `peekRateLimit(ip, rules)` beside `rateLimit()` in `rate-limit.ts` (same window math, no increments — not a hashed file). New route `src/app/api/ai/status/route.ts` (only `src/app/api/ai/route.ts` itself is hashed, a sibling file is gate-free): returns `{ demo: !claudeAvailable() && !geminiAvailable(), remaining: { perMin, perDay }, usage? }`, reusing `claudeAvailable`/`geminiAvailable` from `src/lib/llm` (import-only) and `getUsage` for signed-in callers. Fetch it once in the shared panel chrome.

## 5. One-click content pipeline: keywords → clusters → brief → article → distribution
- **Impact**: 8/10
- **Effort**: 6/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: automation
- **File**: `src/lib/ai-types.ts:413`
- **Opportunity**: The pairwise hand-offs already exist — `BriefRequest.keywords` carries real keyword metrics, `ArticleDraftRequest` is a typed subset of `BriefResult`, `RepurposeRequest` takes the article title/body, and the `BriefSeed` sessionStorage bridge (`src/lib/projects/brief-seed.ts`) moves work between modules — but each hop is a separate manual visit to a different panel. Nobody has stitched the chain into one run.
- **Why valuable**: "Téma dovnitř → hotový článek + varianty pro kanály ven" is the flagship agency workflow this product exists to sell; automating four existing tools into one wizard multiplies their demo value with zero new server surface or model prompts.
- **Build sketch**: Step 1: a client wizard component that sequentially calls the existing modes via `useAiTool` (`keyword-clusters` → `brief` with the cluster's keywords → `article-draft` from the brief fields → `repurpose` with the draft title/body), mapping fields per the contracts in `ai-types.ts`; Step 2: a progress stepper with per-step result preview/edit before continuing; Step 3: reuse idea #3's retryAfter handling between hops (4 calls fits the 8/min limit) and note the 4× `aiEval` quota cost for signed-in users. No new mode, no hashed file — the route and tools are untouched.
