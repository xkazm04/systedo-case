# LLM Provider Wrapper — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. No response caching — identical demo prompts re-spend the paid budget every click
- **Severity**: High
- **Lens**: Both
- **Category**: monetization
- **File**: src/lib/llm/index.ts (`generateStructured`), src/lib/ai/rate-limit.ts (existing `getDb()` store)
- **Opportunity**: There is zero memoization. The analysis tool (`generateAnalysis`) and campaign eval (`generateCampaignEvaluation`) are grounded in a *fixed* demo dataset, so for a given period the prompt is byte-identical across every visitor — yet each click spawns a fresh 90s Claude CLI process or a metered Gemini call. Add a content-addressed cache keyed on `hash(system+prompt+schema+model)` in the existing `node:sqlite` store, with a short TTL, returning the cached `{result, meta}` (stamped `cached: true`).
- **Value**: For a public, unauthenticated demo this is the single biggest budget-drain mitigation after rate-limiting, and it turns a 5–30s wait into an instant render for repeat visits — both a cost story and a UX story a technical reviewer will notice. A `cached · 0 $` pill in `ResultMeta` becomes a credibility signal that the author thinks about provider economics.
- **Effort**: M
- **Fix sketch**: Add `src/lib/llm/cache.ts` with `cacheKey()` (stable JSON stringify + sha256) and get/put against a new `llm_cache(key, payload, created_at)` table; in `generateStructured`, check the cache after `providers.filter(available)` but before the loop, and write on success (skip when `demo`). Extend `AiMeta` with `cached?: boolean` and render a pill.

## 2. Cross-provider fallback exists but is unreachable in practice — both providers are rarely configured at once
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: differentiation
- **File**: src/lib/llm/index.ts (`ordered`/`providers` filter), src/lib/llm/gemini.ts (`geminiAvailable`)
- **Opportunity**: The wrapper advertises "Claude→Gemini in dev, Gemini→Claude in prod" fallback, but in dev `geminiAvailable()` is only true if `GEMINI_API_KEY` happens to be set, and in prod the Claude CLI almost never exists — so the much-touted `fellBack` cross-provider path is dead code on a normal deploy and silently collapses to the demo. Either document this as intentional and surface a degraded-mode banner, or make the fallback real by allowing the Gemini key in dev to act as a genuine secondary.
- **Value**: A technical reviewer reading the code will see a fallback chain that can never fire and read it as aspirational rather than engineered. Making it demonstrably exercised (or honestly scoping it) is the difference between "looks resilient" and "is resilient" — a core engineering-credibility signal for a portfolio piece.
- **Effort**: S
- **Fix sketch**: In `generateStructured`, when `providers.length < 2` log/flag a `singleProvider` meta field; add a README note plus one test in `test-llm/` that sets both `GEMINI_API_KEY` and a fake Claude probe to prove the `fellBack: true` branch and provider ordering actually execute.

## 3. Per-call cost/usage is computed then thrown away — no aggregate spend or observability surface
- **Severity**: High
- **Lens**: Business Visionary
- **Category**: feature
- **File**: src/lib/llm/cost.ts (`estimateCostUsd`), src/lib/llm/index.ts (meta assembly), src/lib/ai/rate-limit.ts (db pattern)
- **Opportunity**: Each call produces `usage`, `estCostUsd`, `attempts`, `tookMs`, `provider`, `repaired` and `fellBack` — rich telemetry — but it lives only in the single response and is never persisted or aggregated. There is no way to answer "what has this demo cost today / which tool is most expensive / what's the p95 latency / how often does self-repair fire?". Persist one row per non-demo call to an `llm_calls` table and expose a tiny `/api/llm/stats` + a small admin/status card.
- **Value**: Turns invisible per-call data into a live "AI ops" panel — exactly the kind of cost-awareness and observability instinct that impresses a technical reviewer evaluating production-readiness, and it gives the demo owner a real guardrail on the public budget (today only rate-limits cap spend; nothing reports it).
- **Effort**: M
- **Fix sketch**: In `generateStructured`, after building `meta`, fire-and-forget an insert (`tool` inferred from the `// llm-tool:` marker, `provider`, `tookMs`, `estCostUsd`, `usage`, `attempts`, `repaired`, `fellBack`); add `src/lib/llm/telemetry.ts` and an aggregate query (`SUM(est_cost)`, `AVG(took_ms)`, repair rate) rendered in a status card reusing `ResultMeta` styling.

## 4. No streaming — every tool blocks on a single all-or-nothing response up to 90s
- **Severity**: Medium
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/lib/llm/claude.ts (`runCli`/`extractJson`), src/lib/llm/gemini.ts (`runGemini`), src/components/ai/primitives.tsx (`LoadingTimer`)
- **Opportunity**: The whole pipeline is request/response: `LoadingTimer` shows a faux progress ring while the user stares at nothing for up to the 90s CLI ceiling / 30s client timeout. Both providers support streaming (Claude CLI `--output-format stream-json`, already partly handled in `extractJson`; Gemini `generateContentStream`). Stream partial fields (e.g. headlines as they arrive) so results paint progressively instead of in one blocking thud.
- **Value**: Perceived latency is the #1 UX lever for an LLM demo, and "watch the ad copy stream in" is a far more impressive first impression than a 15s spinner — strong differentiation for a portfolio piece whose entire point is showcasing the AI product. Also reduces the felt impact of the occasional slow Claude spawn.
- **Effort**: L
- **Fix sketch**: Add an optional `stream` provider method returning an async iterator; have the `/api/ai` route switch to a streamed `Response` (SSE/ReadableStream) when requested; client consumes incrementally and only finalizes (`normalize`/`validate`) on close. Keep the current blocking path as the default so structured-output guarantees are preserved.

## 5. `validate`/self-repair is opt-in and only wired to two of four tools — no schema-shape repair
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/lib/gemini.ts (`generateAnalysis`, `generateCampaignEvaluation` omit `validate`), src/lib/llm/index.ts (`buildRepairNote`)
- **Opportunity**: The elegant self-repair loop only runs when a tool passes a `validate` fn — and only the ads and brief tools do. Analysis and campaign-eval pass none, so a malformed/empty list (e.g. zero `actions`, an out-of-range `score`, missing `recommendations`) is silently clamped by `normalize` with no re-prompt and no `violations` surfaced to the user. There is also no *structural* validation: if the model returns the wrong shape entirely, `normalize` just yields empty arrays and the UI shows a hollow result that looks "live, model-generated".
- **Value**: This is a correctness-and-trust gap at the product's core promise ("never free text we parse heuristically"). Adding minimal `validate` fns (required-array-length, score range) to all four tools and a generic schema-shape check makes outputs visibly self-correct and flags real degradation instead of masking it — directly improving the demo's believability and the engineering-quality signal.
- **Effort**: S
- **Fix sketch**: Add `validateAnalysis`/`validateReport` (flag empty `wins`/`risks`/`actions`, `score` outside 0–100, missing `recommendations`) and pass them into the two tools' `generateStructured` calls; optionally add a shared `schemaShapeViolations(parsed, schema)` in the wrapper run before the tool `validate` so wrong-shape output triggers the same single re-prompt.
