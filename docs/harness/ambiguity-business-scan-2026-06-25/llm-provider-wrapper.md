# LLM Provider Wrapper — Ambiguity + Business scan
> Context: the single `generateStructured()` chokepoint that switches provider by environment (Claude CLI in dev, Gemini in prod), self-repairs, and degrades to a deterministic demo.
> Files analyzed: 4 (src/lib/llm/index.ts, models.ts, claude.ts, gemini.ts) + supporting reads of cost.ts, ai-types.ts, scripts/llm-gate.mjs
> Total findings: 5

> NOTE: every file in this context is in `scripts/llm-gate.mjs` `HASHED_FILES`, so ALL fixes below are **gate-triggering** — editing any of them invalidates `.llm-gate-cache.json` and forces a real Claude-CLI test run at pre-commit (needs a logged-in `claude`). Each finding marks whether the change is pure-doc (lower risk) or behavior-changing.

## 1. Retry/fallback control-flow keys off Czech error substrings, and Gemini malformed JSON is never retried
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: src/lib/llm/index.ts:96 (`RETRYABLE` / `isRetryable`), cross-ref gemini.ts:62, claude.ts:188
- **Problem/Opportunity**: The whole resilience design — "is this error worth one more attempt?" — is decided by `RETRYABLE.some(m => msg.includes(m))` against the cs-CZ substrings `["nevrátil platný JSON", "prázdnou odpověď", "vypršel", "selhal"]`. This couples control flow to the exact localized wording thrown in `claude.ts`/`gemini.ts`. It also creates a silent asymmetry: Claude unparseable output throws `"Claude CLI nevrátil platný JSON."` (retried), but Gemini's `JSON.parse(text)` (gemini.ts:62) throws a native English `SyntaxError` that matches none of the strings — so a malformed Gemini response is NOT retried and immediately drops to the next provider or the demo.
- **Why it matters**: A future copy edit to any Czech error message silently disables retries; and the prod provider (Gemini) gets strictly weaker malformed-output handling than dev — exactly backwards from where reliability matters most.
- **Fix sketch**: **behavior-changing.** Make providers throw a tagged error (e.g. `class LlmError extends Error { retryable: boolean }` or an `err.retryable` flag) instead of relying on prose; `isRetryable` then reads the flag. Wrap gemini.ts:62 `JSON.parse` in try/catch that throws a `retryable` parse error so Gemini matches Claude's behavior. Touches index.ts + claude.ts + gemini.ts → full gate run.

## 2. Production model name and its cost rate are unsourced magic strings; rate-table drift silently reports $0 cost
- **Lens**: 🌀 Ambiguity + 🚀 Business
- **Value**: High
- **Effort**: S
- **File**: src/lib/llm/models.ts:16 (`GEMINI_MODEL = "gemini-3-flash-preview"`), index.ts:207 (`estimateCostUsd`), supporting cost.ts:22-25
- **Problem/Opportunity**: `GEMINI_MODEL` is a hard-coded `-preview` string, and `cost.ts` `RATES` has exactly one entry keyed by that literal with rates marked only "approximate flash-tier pricing" — no source, no date. `estimateCostUsd` returns `0` for any model not in the table (cost.ts:28-29). So the day the preview model GA's or is renamed, the cost lookup misses and every prod call silently reports `estCostUsd: 0` — while the "provider-agnostic, **cost-tracked** LLM layer" is the headline differentiation of this case study.
- **Why it matters**: A cost-tracking selling point that silently zeroes out on a routine model-name bump is worse than no number — it looks credible while being wrong, and there's no recorded reasoning a reviewer can audit.
- **Fix sketch**: **mixed (mostly doc + small guard).** Doc: add a comment on `RATES` recording the price source + as-of date and on `GEMINI_MODEL` why `-preview` was chosen. Behavior: in `estimateCostUsd`, when `usage` is present and the model has no rate, log a warning (or return a sentinel) instead of a clean `0`, so a metered call can't masquerade as free. Both `models.ts` and (transitively) the gate hash change → gate run.

## 3. The dev Claude path emits no token/cost telemetry — the "cost-tracked" story is only half-built
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: M
- **File**: src/lib/llm/index.ts:208-210 (`estCostUsd = 0` for claudeProvider), index.ts:86 (`usage: undefined`)
- **Problem/Opportunity**: The Claude/dev provider reports `usage: undefined` and `estCostUsd: 0` because it rides the subscription. That is honest for billing, but it means the entire telemetry/eval story (`recordLlmCall`, the on-screen meta) shows zero token counts in development — which is the only environment a reviewer of this portfolio piece runs from a clean checkout (prod Gemini needs `GEMINI_API_KEY`). The differentiation demo is therefore blank exactly where it's most likely to be seen.
- **Why it matters**: For a case-study/portfolio asset, "look, real per-call token + cost telemetry" is the wow moment; today it only lights up with a paid key configured.
- **Fix sketch**: **behavior-changing.** Add a rough estimated token count for the Claude path (e.g. `Math.ceil(chars/4)` over prompt+output) surfaced as `usage` with an explicit `estimated: true` flag and keep `estCostUsd: 0` (subscription) but show the token economics. Anchor in index.ts claudeProvider.run / meta assembly. Gate run.

## 4. `claudeAvailable()` caches a failed probe permanently — one transient hiccup disables the primary provider for the whole process
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/llm/claude.ts:41-55
- **Problem/Opportunity**: `_available` is memoized for the process lifetime, including the `false` result. The probe is a `spawnSync` with a 15 s timeout (claude.ts:48); a cold CLI, momentary load, or a slow first spawn yields `status !== 0` → `_available = false` cached forever. Every subsequent `generateStructured` then skips Claude entirely and quietly serves Gemini-or-demo until the server restarts, with no recovery path and no recorded rationale for caching the negative result.
- **Why it matters**: In dev (Claude-preferred) a single flaky probe silently demotes you to the fallback for the rest of the session — a confusing "why is it always demo now?" failure that's invisible from the result envelope.
- **Fix sketch**: **behavior-changing.** Cache only the positive result, or add a short TTL / re-probe on failure (e.g. cache `false` for N seconds). Document the chosen policy inline. claude.ts only → gate run.

## 5. `temperature` is silently ignored on the Claude path and defaults to a high 1.0 on Gemini; demo path drops the locale override
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/llm/gemini.ts:40 (`temperature ?? 1.0`), index.ts:86 (claudeProvider.run drops `c.temperature`), index.ts:159/258 (demo ignores `effectivePrompt`/locale)
- **Problem/Opportunity**: `GenerateArgs.temperature` is documented as a tuning knob, but `runClaude` (claude.ts:181) takes no temperature, so index.ts:86 silently discards it — the knob only works on Gemini. There it defaults to `1.0`, high for strict JSON-schema generation, which raises malformed-output/repair rates (and thus retries + cost). Separately, the demo fallback calls `args.demo()` (index.ts:258) with no locale awareness, so an `locale: "en"` request that degrades to demo returns Czech content while `meta.model` still names a real model.
- **Why it matters**: Three small undocumented behaviors that each surprise a caller: a knob that does nothing on the primary dev provider, an aggressive default that quietly costs retries, and a demo that ignores the requested language.
- **Fix sketch**: **behavior-changing (or pure-doc if only annotating).** Either thread `temperature` into the Claude CLI prompt/flags or document that it is Gemini-only; lower the Gemini default (e.g. `0.7`) with a one-line rationale; note in `withLanguage`/demo docs that the demo is cs-only by design. Lowest-risk variant is pure-doc comments on these three spots — still gate-triggering but no behavior change.
