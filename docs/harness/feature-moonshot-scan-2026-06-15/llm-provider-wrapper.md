# Feature + Moonshot Scan — LLM Provider Wrapper

> Context: ctx_1781547850520_3re6k1a
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Fallback chain + bounded retries inside `generateStructured`

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/lib/llm/index.ts:generateStructured` (+ `claude.ts:runClaude`, `gemini.ts:runGemini`)
- **Scenario**: A reviewer opens the live case study and the single AI call hits a transient failure — Claude CLI prints garbage on one run (`runClaude` throws "Claude CLI nevrátil platný JSON"), the CLI times out at `CLAUDE_TIMEOUT_MS`, or Gemini returns an empty body (`runGemini` throws "Model vrátil prázdnou odpověď"). Today the error propagates straight to a 5xx and the feature looks broken — even though a second attempt, or the *other* provider, would have succeeded. The wrapper already knows about two providers but only ever tries one.
- **Opportunity**: Turn the chokepoint into a resilient chain. (a) Wrap each provider call in a bounded retry (2 attempts, short backoff) specifically for the recoverable failure modes already enumerated in the code: unparseable JSON, empty response, timeout. (b) Add cross-provider fallback so that when the environment-selected provider is unavailable *or fails after retries*, the other configured provider is tried before degrading to `args.demo()`. The current `if (dev) {...} else if (geminiAvailable) {...}` branch silently falls through to demo whenever the dev branch's `claudeAvailable()` is true but `runClaude` throws — fallback closes that gap. Stamp `meta` with which provider actually served the result and the attempt count.
- **Impact**: The flagship "single chokepoint" feature becomes genuinely robust instead of single-shot. Demo degradation becomes a true last resort rather than a same-provider hiccup, and the case study survives flaky CLI output — the exact failure that makes a portfolio demo look amateur in front of a hiring manager.
- **Implementation sketch**: Add a `runWithRetry<T>(fn, {attempts, retryOn})` helper in `index.ts`; classify retryable errors by matching the thrown messages from `runClaude`/`runGemini`. Restructure `generateStructured` into an ordered provider list (`[claude, gemini]` in dev, `[gemini, claude]` in prod) filtered by each provider's `*Available()`, iterate with retry, and only return `args.demo()` once every provider is exhausted. Extend `AiResponse.meta` (in `../ai-types`) with `provider`, `attempts`, and `fellBack: boolean`.

## 2. Token + cost accounting and timing captured in the result envelope

- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/lib/llm/index.ts:generateStructured`, `gemini.ts:runGemini`, `claude.ts:runCli`/`extractJson`
- **Scenario**: This is a *case study about an engineering chokepoint*, and the wrapper already stamps `model` and `tookMs` into `meta` — but it throws away the richest evidence of the design: how many tokens each call burned and what it would cost. A visitor reading the case study has no way to see that the dev path runs free on a Claude subscription while the prod path is metered Gemini. The data is right there and discarded: Gemini's `generateContent` response carries `usageMetadata`, and the Claude CLI emits `usage` in its stream-json envelope lines that `extractJson` already parses past.
- **Opportunity**: Capture per-call token usage and a derived cost estimate into `meta`. For Gemini, read `response.usageMetadata` (prompt/candidates/total tokens) in `runGemini`. For Claude, extend the stream-json scan in `extractJson` (it already iterates envelope lines looking at `obj.result`/`obj.content`) to also pull `obj.usage` / `total_cost_usd` when present, and request `--output-format stream-json` so usage is emitted. Multiply token counts by a small per-model rate table (a sibling to `models.ts`) to produce `estCostUsd`, and tag the dev/subscription path as `costUsd: 0` to make the "subscription vs metered API" story explicit. Surface it in the same UI badge that already shows the model.
- **Impact**: Converts an invisible architectural decision into a visible, quantified product story — the single most on-theme upgrade for a case study whose whole thesis is the provider chokepoint. Also gives the author real observability into what each AI feature costs.
- **Implementation sketch**: Add `rates.ts` next to `models.ts` (`{ [model]: { inPerMTok, outPerMTok } }`). Change `runGemini` to return `{ parsed, usage }`; change `runClaude` to thread usage out of `extractJson`. Add `usage?: { inputTokens; outputTokens }` and `estCostUsd?: number` to `AiResponse.meta`; compute in `generateStructured` where `tookMs` is already set.

## 3. In-process response cache keyed on system+prompt+schema+model

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: automation
- **Effort**: S (<1d)
- **File**: `src/lib/llm/index.ts:generateStructured`
- **Scenario**: The case study is deterministic content — the same sections, the same prompts, rendered on every page load and during builds. Each render re-shells the Claude CLI (a ~tens-of-seconds `spawn` bounded by `CLAUDE_TIMEOUT_MS = 90_000`) or re-bills a Gemini call, for output that won't meaningfully change. A reviewer clicking around pays full latency repeatedly for identical generations.
- **Opportunity**: Add a content-addressed cache at the chokepoint. Hash `(system + prompt + JSON.stringify(schema) + activeModel)` into a key; on hit, return the cached `{result, meta}` immediately (with `meta.cached = true`). Because `generateStructured` is the *single* entry point, one cache here covers every AI feature in the app for free. Make it a small TTL'd in-memory map surviving HMR via `globalThis` (the same singleton-survival pattern the broader codebase already relies on), with an opt-out flag on `GenerateArgs` for the rare call that must be fresh.
- **Impact**: Near-instant repeat renders, dramatically fewer CLI spawns during local dev and builds, and zero duplicate Gemini spend in prod — all from one well-placed map because the architecture already funnels everything through one function.
- **Implementation sketch**: Add `cacheKey()` using `node:crypto` `createHash('sha256')`. Store `globalThis.__llmCache ??= new Map<string,{value;expires}>()`. At the top of `generateStructured`, compute the key (skip when `args.noCache`), check/return on hit, and populate before returning on miss. Set `meta.cached` accordingly. Demo results should not be cached (so a later-configured provider supersedes them).

## 4. Streaming structured generation with a parse-on-complete contract

- **Severity**: Medium
- **Lens**: moonshot-architect
- **Category**: feature
- **Effort**: L (>3d)
- **File**: `src/lib/llm/index.ts` (new `generateStructuredStream`), `claude.ts:runCli`, `gemini.ts:runGemini`
- **Scenario**: Every AI feature today is a black-box wait: `generateStructured` resolves only after the *entire* JSON object is produced and parsed. For a case study that wants to *show off* its AI engineering, a section that visibly streams in — tokens arriving live, then snapping into validated structure — is a far stronger demonstration than a spinner. The plumbing is already half there: `runCli` accumulates `child.stdout` chunk-by-chunk, and `extractJson` already understands Claude's `stream-json` envelope; Gemini's SDK exposes `generateContentStream`.
- **Opportunity**: Add a streaming sibling, `generateStructuredStream`, that yields incremental raw text for live UI rendering while guaranteeing the same typed contract on completion (run `extractJson` / `JSON.parse` + `normalize` only at the end). Provider switch and demo fallback stay identical to the non-streaming path, so the chokepoint invariant holds. Expose it via an async iterator or a callback (`onToken`) plus a final `Promise<AiResponse<T>>`. This is the natural moonshot extension of the existing design rather than a new subsystem.
- **Impact**: Transforms the case study from "AI happened, here's the result" into a live, visible demonstration of the streaming-LLM craft — a category-defining differentiator for a portfolio piece, while preserving the deterministic-demo and provider-abstraction guarantees that make the wrapper trustworthy.
- **Implementation sketch**: In `runCli`, optionally forward `child.stdout` chunks to an `onChunk` callback as they arrive. Add a Gemini `generateContentStream` path in a new `runGeminiStream`. In `index.ts`, add `generateStructuredStream(args & {onToken})` mirroring the provider/demo branching of `generateStructured`, parsing+normalizing only once the stream closes and stamping `meta` the same way.

## 5. Extract a provider-agnostic structured-output SDK (`structured-llm`)

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: whole context — `src/lib/llm/index.ts`, `models.ts`, `claude.ts`, `gemini.ts`
- **Scenario**: This context is already, in miniature, a clean and genuinely reusable design: one `generateStructured<T>()` entry point, a `GenerateArgs` contract (prompt/system/schema/normalize/demo), pluggable providers behind `*Available()` + `run*()`, a Google-GenAI-`Type`-shaped schema that's *native to Gemini and embedded into the Claude prompt*, robust JSON extraction (`extractJson` handles direct/fenced/stream-json/balanced-brace), and a deterministic demo fallback. That combination — provider-agnostic structured output with a no-key offline mode — is exactly what most small Next.js apps reinvent badly. Right now it's trapped inside one case-study repo.
- **Opportunity**: Promote the wrapper into a standalone, zero-dependency-core package (`structured-llm`) with a provider-registry interface (`{ name, available(), run(args) }`) so Claude CLI and Gemini become first-party adapters and others (OpenAI, Anthropic API, Ollama) drop in without touching the core. Keep the killer features that distinguish it from existing libraries: the deterministic `demo()` escape hatch for clean checkouts / CI, the single-schema-two-providers trick, and the model-stamped `AiResponse` envelope. Folding in opportunities 1–4 (fallback chain, cost accounting, caching, streaming) makes it a complete, observable structured-output runtime. The case study then becomes the SDK's reference implementation and showcase — the portfolio piece *and* the open-source artifact reinforce each other.
- **Impact**: A force multiplier and category move: the case study stops being a one-off demo and becomes the public face of an extractable, genuinely useful library — platform potential, ecosystem credibility, and a far stronger job-application narrative ("I shipped the abstraction, here's the repo that uses it").
- **Implementation sketch**: Define `LlmProvider` and `LlmRegistry` interfaces; refactor `claude.ts`/`gemini.ts` into adapters implementing them, and reduce `index.ts` to environment-driven registry selection + the retry/fallback/cache/cost orchestration. Move `models.ts` rates/tags into per-adapter config. Carve the core (`generateStructured`, `extractJson`, types) into `packages/structured-llm/` with no Next.js or app imports; have the app consume it via a workspace dependency. Ship the deterministic-demo provider as a built-in adapter so the package works key-less out of the box.
