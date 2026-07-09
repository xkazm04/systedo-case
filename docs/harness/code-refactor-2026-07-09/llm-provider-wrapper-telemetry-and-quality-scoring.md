# LLM Provider Wrapper, Telemetry & Quality Scoring

> Context #16 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 12

## 1. Provider precedence (`dev ? claude : gemini`) is hand-encoded three times

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/llm/index.ts:152-157`
- **Scenario**: `resolveProviders` builds `dev ? [claudeProvider, geminiProvider] : [geminiProvider, claudeProvider]`. The identical "dev → Claude first, else Gemini first" test is independently re-encoded in `src/lib/ai/status-core.ts:53-68` (`resolveWouldServe`, used to compute the preflight `wouldServe` field) and again inline in `src/app/api/ai/status/route.ts:45-53` (the `providers: dev ? [...] : [...]` array shown in the diagnostic payload). Three separate copies of the same ordering decision, for three different purposes.
- **Root cause**: `resolveProviders` returns live `Provider` objects (closures with a `run()` method) that aren't a fit for a JSON status payload, so when the preflight endpoint needed the same ordering for display it was hand-rolled twice instead of factoring the ordering itself out as data.
- **Impact**: A future change to provider precedence (a third provider, cost-based reordering, etc.) requires editing all three call sites. Missing one leaves the preflight banner reporting the wrong `wouldServe` provider or the wrong per-provider health order — exactly the "why is everything demo?" confusion `status-core.ts`'s own docblock says the endpoint exists to prevent.
- **Fix sketch**: Extract the two-branch order test into one pure helper, e.g. `providerOrder(dev: boolean): ("claude" | "gemini")[]`, and have `resolveProviders` map it to `Provider` instances, `resolveWouldServe` reduce it with availability, and the status route build its `providers` array from it. Place it in `src/lib/llm/models.ts` (already imported by both server and client code, and free of `node:`-module imports) rather than in `index.ts`, so `status-core.ts` — which is imported by the client hook `useAiStatus.ts` and `AiPreflight.tsx` — can keep depending on it safely.
- **Gate impact**: touching `src/lib/llm/index.ts` and/or `src/lib/llm/models.ts` (both `HASHED_FILES`) forces a real-model `llm-gate` re-run.
- **Build risk**: only if the shared helper is placed somewhere that pulls in `node:child_process`/`node:sqlite` (e.g. `claude.ts` or `index.ts` itself) — `status-core.ts` is client-imported, so the helper must stay in a Node-API-free module like `models.ts`.

## 2. `cost.ts`'s RATES table has drifted from the current BYOM default models

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/llm/cost.ts:34-46`
- **Scenario**: `BYOM_DEFAULT_MODELS` in `src/lib/llm/models.ts:88-93` currently defaults `openai` to `"gpt-5.4-mini"` (both tiers), `gemini` to `"gemini-3.5-flash"` / `"gemini-3.1-flash-lite"`, and `openrouter` to `"z-ai/glm-5.2"` / `"deepseek/deepseek-v4-flash"`. None of those six strings are keys in `cost.ts`'s `RATES` table — only the Anthropic BYOM defaults (`CLAUDE_API_MODEL`, `CLAUDE_API_MODEL_FAST`) and the app's own `GEMINI_MODEL`/`GEMINI_MODEL_FAST` are priced; the surviving `"gpt-4o"`/`"gpt-4o-mini"` entries price a model family that is no longer any vendor's default.
- **Root cause**: the two tables are hand-maintained in separate files with no compiler link between them — `BYOM_DEFAULT_MODELS` was bumped to newer model generations without a matching `RATES` update, and `estimateCostUsd` (cost.ts:49) is guarded to fail soft (`console.warn` + return `0`) rather than throw, so the drift produces no visible error.
- **Impact**: `estimateCostUsd` silently reports `$0` for every BYOM call made on an un-overridden `openai`, `gemini`, or `openrouter` key (3 of 4 vendors) — understating real spend exactly where `ByomQualityOverview.tsx`'s `avgCostUsd` and the quality matrix are supposed to give users an evidence-based cost/quality tradeoff. A `$0`-costed default reads as free next to a correctly-priced alternative.
- **Fix sketch**: add `RATES` entries for the current `BYOM_DEFAULT_MODELS` values in `cost.ts`, and once confirmed no persisted user setting still names the old models, drop the now-stale `"gpt-4o"`/`"gpt-4o-mini"` keys. For durability, add a small unit test (or a dev-time assertion) that every `BYOM_DEFAULT_MODELS` value has a matching `RATES` key, so the two tables can't silently re-diverge.
- **Gate impact**: none if the fix stays inside `cost.ts` (not a `HASHED_FILES` entry). Only the stronger cross-check option (importing `BYOM_DEFAULT_MODELS` into a test, or deriving keys from `models.ts`) touches a `HASHED_FILES` module and would force a gate re-run — and only if it edits `models.ts` itself, not a standalone test file.

## 3. The Czech JSON-instruction block is copy-pasted from `claude.ts` into the BYOM prompt-embed fallback

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/llm/claude.ts:69-79`
- **Scenario**: `buildCliPrompt`'s trailing three lines (`"Odpověz POUZE jedním JSON objektem..."`, `"JSON musí přesně odpovídat tomuto schématu..."`, `JSON.stringify(schema)`) are reproduced verbatim in `src/lib/llm/byom/adapters.ts:44-54` (`embeddedUserContent`), used when a user-picked OpenAI/Anthropic BYOM model rejects native structured output and the adapter retries with a prompt-embedded schema. `adapters.ts` already imports `extractJson` from this same file for the *output* side (its own docblock says so) but re-typed the matching *input* instruction instead of importing it.
- **Root cause**: the instruction text was copied when the BYOM prompt-embed fallback was built, rather than factored out alongside the already-shared `extractJson`.
- **Impact**: a future wording/format change to the JSON-only instruction (e.g. adjusting the schema-format description) has to be applied in two files; missing the second leaves the BYOM fallback path instructing models in a stale format while the Claude CLI path has moved on, silently widening the two paths' parse-failure rates apart.
- **Fix sketch**: extract the three-line block into one exported helper, e.g. `jsonInstructionBlock(schema: object): string`, in `claude.ts` (or a small shared module `claude.ts` and `adapters.ts` both already depend on), and call it from both `buildCliPrompt` and `embeddedUserContent`.
- **Gate impact**: `claude.ts` is a `HASHED_FILES` entry — even a behavior-preserving extraction changes its content hash and forces a real-model gate re-run.

## 4. Two near-identical AsyncLocalStorage context modules, one still carrying dead code

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/llm/request-context.ts:15-27`
- **Scenario**: `request-context.ts`'s own docblock says it "carr[ies] via AsyncLocalStorage... the exact pattern `byom-context` uses for the provider key." `src/lib/llm/byom-context.ts:11-30` sets up the identical scaffold — one `AsyncLocalStorage` instance, a `get*Context()` reader, an `enter*Context()` callback-free writer — for a second, unrelated per-request value. The two files are structurally the same module written twice. `byom-context.ts` additionally exports `runWithByomContext` (a callback-wrapping `store.run()` form, `byom-context.ts:15`) that `request-context.ts` has no equivalent of — and a repo-wide grep shows `runWithByomContext` is never actually called anywhere; the real call site (`src/lib/llm/byom/request.ts:20,24`) uses `enterByomContext`, the same callback-free shape `request-context.ts` uses. So the two modules aren't just duplicated, they're *inconsistently* duplicated — one carries an extra exported function that turned out unnecessary.
- **Root cause**: the two contexts were added at different times for different features (BYOM key, then request identity attribution) and each got its own hand-rolled `AsyncLocalStorage` module instead of a shared factory.
- **Impact**: low today (both are small and correct), but a third per-request value would copy-paste this a third time, and `runWithByomContext` is dead exported API surface that a reader has to trace before realizing it's unused.
- **Fix sketch**: add a tiny generic factory (e.g. `createRequestContext<T>()` returning `{ get, enter }`, backed by one `AsyncLocalStorage<T | undefined>`) in a small shared module, and reimplement both `request-context.ts` and `byom-context.ts` as one-line instantiations of it — using `request-context.ts`'s simpler enter-only shape as the template, and dropping the unused `runWithByomContext` in the same pass (verify with a repo-wide grep for `runWithByomContext` immediately before deleting it).
- **Gate impact**: none — neither `request-context.ts` nor `byom-context.ts` is in `HASHED_FILES`.
- **Build risk**: none — both modules are server-only (`node:async_hooks`) and consumed only from server call sites (the AI route, `generateStructured`, `byom/request.ts`); consolidating them stays entirely on the server side.

## 5. `ByomUserErrorCode`'s `"invalid"` variant is never constructed

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/llm/errors.ts:9`
- **Scenario**: `ByomUserErrorCode` is `"auth" | "permission" | "quota" | "model" | "invalid"`. A repo-wide grep for `new ByomUserError(` finds every construction site — all six live inside `classifyByomHttp` (`errors.ts:42,44,46,48,50,53`) — and none of them ever pass `"invalid"`; a bare 400 with no model name in the body returns `null` (recoverable, not a user fault) rather than an `"invalid"`-coded error. The sole consumer, `src/app/api/ai/route.ts:456`, maps `err.code === "auth" || "permission" ? 401 : "quota" ? 429 : 400` — `"model"` and the unreachable `"invalid"` both fall through to the same 400 default, so nothing in the codebase distinguishes an `"invalid"` BYOM error from `"model"` either.
- **Root cause**: likely added symmetrically with the unrelated `AiErrorCode` in `src/lib/ai-types.ts` (which does have a real 400/422 `"invalid"` case for non-BYOM request validation) rather than for an actual `classifyByomHttp` branch.
- **Impact**: minimal — an unreachable union member costs a reader a moment tracing where it's produced, and any future exhaustiveness `switch` over `ByomUserErrorCode` would carry a dead branch.
- **Fix sketch**: remove `"invalid"` from the `ByomUserErrorCode` union in `errors.ts:9`; TypeScript will flag any accidental live reference at compile time before the change lands, confirming it's safe.
- **Gate impact**: none — `errors.ts` is not in `HASHED_FILES`.
