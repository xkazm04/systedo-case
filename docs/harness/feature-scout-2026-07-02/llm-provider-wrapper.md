# Feature Scout — LLM Provider Wrapper (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/lib/llm/index.ts, src/lib/llm/models.ts, src/lib/llm/claude.ts, src/lib/llm/gemini.ts

> Scout note on gate scope (verified): `scripts/llm-gate.mjs:29-54` hashes an EXPLICIT file list, not a
> glob — `src/lib/llm/cost.ts`, `src/lib/llm/telemetry.ts`, NEW files under `src/lib/llm/`, and new API
> routes are all gate-free. The chokepoint check only flags `new GoogleGenAI` construction and
> `node:child_process` imports outside the two provider files; importing `claudeAvailable`/`geminiAvailable`
> elsewhere is clean. Three of the five ideas below exploit that seam and need no gate run.

## 1. Add per-tool model-tier routing (fast vs quality)
- **Impact**: 8/10
- **Effort**: 5/10
- **Risk**: 4/10
- **Flags**: [GATE]
- **Category**: feature
- **File**: `src/lib/llm/models.ts:13`
- **Opportunity**: The wrapper runs every one of the 12+ tools on one fixed model per provider (`sonnet` via CLI alias, `gemini-3-flash-preview`). A 3-sentence lead reply and a full article draft pay identical latency (~50–90 s dev cold-spawn) and identical prod token rates. There is no per-call model knob at all — `GenerateArgs` has temperature but no tier.
- **Why valuable**: Light tools (lead-reply, local-review-reply, repurpose, keyword-clusters) become dramatically snappier in dev (haiku-class CLI runs) and cheaper in prod (flash-lite-class rates), while heavy tools (article-draft, campaign-eval) keep full quality. Latency is the single worst UX property of the AI tools today (`useAiTool` budgets 50 s just for the *timer target* in dev).
- **Build sketch**: Add `tier?: "fast" | "quality"` (default `"quality"`) to `GenerateArgs`; in `models.ts` map tier → CLI alias (`haiku`/`sonnet`) and Gemini model tag; thread it through `claudeProvider`/`geminiProvider` (index.ts:82-93) into `CLI_ARGS` (claude.ts:31) and `runGemini`'s `model:` (gemini.ts:34). Add the fast-tier Gemini rate to `RATES` in the un-hashed `cost.ts` so cost tracking stays honest. Opt individual light tools in one by one. Goldens are unaffected (fingerprint = system + schema only), but index/models/claude/gemini + opted-in tool files are hashed → bundle everything into ONE commit / one ~340 s gate run.

## 2. Expose a pre-flight AI health endpoint + demo-mode pre-warning
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/llm/claude.ts:44`
- **Opportunity**: Provider availability is only discoverable *after* burning a generation: the demo badge in `primitives.tsx:189` appears on the result. There is no endpoint or UI that says up front "no provider is configured — you will get canned demo output" or "Claude CLI probe failed, Gemini will serve". A clean-checkout reviewer (the portfolio's main audience) silently gets demo content and may think it's the real product.
- **Why valuable**: Turns the wrapper's best resilience story (graceful demo degradation) into a *visible* feature instead of a silent surprise, and gives operators a one-call diagnosis of "why is everything demo?".
- **Build sketch**: New gate-free route `src/app/api/ai/health/route.ts` importing `claudeAvailable`/`geminiAvailable` + `isDevEnvironment` (imports are chokepoint-safe; do not write the wrapper-call literal in comments — the coverage grep matches text) returning `{ dev, providers: [{model, available}], wouldServe: "claude"|"gemini"|"demo" }`, plus demo-rate over recent `listLlmTelemetry()` entries (telemetry.ts is un-hashed). Fetch it once in the AI tool panels and show a small pre-flight hint line ("Poběží ukázkový režim — není nakonfigurován žádný AI poskytovatel") next to the submit button; reuse the existing `demoMode` copy keys in `primitives.tsx`. Client-component edits → run a full `next build`.

## 3. Propagate client aborts to the providers (kill the zombie generations)
- **Impact**: 7/10
- **Effort**: 5/10
- **Risk**: 4/10
- **Flags**: [GATE]
- **Category**: functionality
- **File**: `src/lib/llm/claude.ts:69`
- **Opportunity**: `useAiTool` aborts the fetch on timeout/reset/re-run, but nothing reaches the server: the Claude CLI child keeps burning for up to `CLAUDE_TIMEOUT_MS` (150 s) and Gemini runs to completion, each holding one of only `AI_MAX_CONCURRENT = 4` process-wide slots (`acquireSlot`, rate-limit.ts:44). Two impatient users double-clicking can starve the whole box while paying for output nobody will read.
- **Why valuable**: Frees the scarce concurrency slots and stops paying (metered Gemini tokens / minutes of CLI time) for abandoned generations — a direct cost and availability win on a public, unauthenticated endpoint.
- **Build sketch**: Add optional `signal?: AbortSignal` to `GenerateArgs`/`ProviderCall`; in `runCli` listen and `child.kill()` + reject (the timeout timer at claude.ts:77 is the pattern); pass `abortSignal` into the `@google/genai` config in `runGemini` (supported by the SDK; if the installed version lacks it, at minimum kill the Claude child and skip retries on abort); make `isRetryable` treat aborts as non-retryable. The route (`src/app/api/ai/route.ts`) passes `request.signal` down through the tool functions. index/claude/gemini + route + tool signatures are hashed → one bundled gate run.

## 4. Pace the loading timer per tool from real telemetry
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/ai/useAiTool.ts:48`
- **Opportunity**: The loading progress target is a single global constant (`AI_TIMER_TARGET_MS` = 18 s prod / 50 s dev, consumed at `primitives.tsx:331`) for every tool — but the wrapper's own telemetry already records real per-tool `avgTookMs` (`aggregateTelemetry`, telemetry.ts:80). A lead reply (~10 s) and an article draft (~120 s) show the same fictional progress pacing, so heavy tools look hung and light ones look done-but-stuck.
- **Why valuable**: Honest per-tool "obvykle ~N s" expectations and a progress bar that actually lands near completion — the cheapest possible perceived-latency win for the flagship AI tools, powered by data the wrapper already collects and mostly discards.
- **Build sketch**: Serve per-tool `avgTookMs` from the idea-2 health endpoint (or a tiny `/api/ai/latency` route; both gate-free — telemetry.ts is un-hashed, `/api/eval/telemetry` is auth-gated so don't reuse it for anonymous users). `useAiTool(mode)` fetches once, passes an `expectedMs` (fallback: today's constants) into the timer component; show "obvykle ~N s" in the loading copy. Pure client + new-route work → full `next build` on the wave.

## 5. Roll AI usage/cost + contract-drift alerts into the weekly digest cron
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: integration
- **File**: `src/lib/llm/telemetry.ts:80`
- **Opportunity**: `llmTelemetry` records per-call cost, latency, demo flag, repairs, and a `drifted` contract fingerprint per tool — but the only consumer is the auth-gated `/api/eval/telemetry` JSON rollup nobody is pushed to look at. Meanwhile `/api/cron/digest/route.ts` already emails/webhooks a weekly performance recap. The two are never connected. (Distinct from the deferred M3 in-app dashboard: this is the proactive operator loop, not a UI.)
- **Why valuable**: The operator learns *without opening anything* when AI spend jumps, when the demo-rate spikes (= a provider silently went down, exactly the failure mode the permanent `claudeAvailable` cache can cause), or when a tool's prompt contract drifted between deploys.
- **Build sketch**: Add a small `listLlmTelemetrySince(iso)` reader next to `listLlmTelemetry` (telemetry.ts is un-hashed) and reuse `aggregateTelemetry`. In the digest route (un-hashed), append an "AI provoz" section — calls, total est. cost USD, demo-rate, repair count, and a warning line per `drifted: true` tool — to the existing `kpis`/HTML assembly, plus `recordAlert`/`sendWebhook` when demo-rate > threshold. Server-only, no hashed files, no client components.
