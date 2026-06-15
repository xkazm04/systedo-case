# Feature + Moonshot Scan — AI Generation Tools & API

> Context: ctx_1781547850527_pmgj9w1
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Stream every tool's output token-by-token through `/api/ai`

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/app/api/ai/route.ts` (POST handler) + `src/lib/llm/index.ts` (`generateStructured`)
- **Scenario**: A visitor clicks "Generate ads" and stares at a spinner for 5–90 s (`CLAUDE_TIMEOUT_MS = 90_000`). The whole structured payload arrives at once via `Response.json(await generateAds(...))`. For a case-study app meant to *demonstrate* a polished marketing product, a dead spinner is the weakest possible first impression — and the Claude CLI already emits incremental `stream-json` lines that `extractJson` in `claude.ts` reassembles after the fact.
- **Opportunity**: Add an opt-in streaming path. When the request carries `Accept: text/event-stream` (or `body.stream === true`), return a `ReadableStream`/SSE instead of buffered JSON. In `claude.ts` the spawn already streams stdout chunks (`child.stdout.on("data", ...)`); forward each chunk as a `progress` SSE event, then emit one final `result` event with the normalized object. For Gemini, switch `generateContent` to `generateContentStream`. Keep the existing buffered JSON path as the default so nothing breaks.
- **Impact**: Perceived latency drops from "90 s of nothing" to "text appearing in <2 s." Turns the single most-demoed interaction into something that *feels* like a modern AI product — the entire point of a portfolio case study.
- **Implementation sketch**: Extend `GenerateArgs` with an optional `onChunk?(text: string)` callback; thread it through `runClaude`/`runGemini`. Add a `generateStructuredStream` variant in `llm/index.ts` that yields chunks. In `route.ts`, branch on `Accept` header: build a `new ReadableStream` controller, enqueue `data: {type:"progress",text}` per chunk and a closing `data: {type:"result",...}`. Client switches the existing fetch to an `EventSource`/`fetch`-reader.

## 2. Output caching + persistence for ads / brief / analysis (mirror the reports table)

- **Severity**: High
- **Lens**: feature-scout
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `src/app/api/ai/route.ts` + `src/lib/db.ts` (`SCHEMA`) + new `src/lib/ai/store.ts`
- **Scenario**: The campaign-eval tool already persists every run to the `reports` table via `saveReport` (`src/lib/campaigns/store.ts`) and renders a score-over-time timeline. The three `/api/ai` tools (ads, brief, analysis) are fire-and-forget: identical inputs re-bill Claude/Gemini every click, and a generated ad set vanishes on reload. The infrastructure asymmetry is glaring — half the AI surface remembers nothing.
- **Opportunity**: Add a `generations` table (`mode`, `input_hash`, `payload`, `model`, `demo`, `prompt`, `took_ms`, `created_at`) alongside the existing `reports` table. In `route.ts`, compute a stable hash of `{mode, validated request}`, return a cached row when fresh (e.g. < 24 h) with a `cached: true` meta flag, otherwise generate and persist. Surface a lightweight "recent generations" history per tool, exactly as the campaign reports timeline already does.
- **Impact**: Cuts paid-provider spend on repeat demo clicks to near zero, makes shared/bookmarked results stable, and gives the ads/brief tools the same "history" credibility the campaigns tool has. Reuses a pattern the codebase already proved.
- **Implementation sketch**: Extend `SCHEMA` in `db.ts` with the `generations` table + `idx_generations_lookup (mode, input_hash, id)`. New `src/lib/ai/store.ts` exporting `getCachedGeneration(mode, hash)` / `saveGeneration(...)` modeled on `saveReport`/`getReportsForPeriod`. Hash with `node:crypto` `createHash("sha256")` over `JSON.stringify(parsed.value)`. Add `cached?: boolean` to `AiMeta` in `ai-types.ts`.

## 3. Server-side output validation + one self-repair retry against the stated limits

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/lib/gemini.ts` (`normalizeAdResult` / `normalizeBriefResult`) + `src/lib/llm/index.ts`
- **Scenario**: The prompts loudly demand "headlines max 30 znaků, title tag max 60 znaků" (`AD_LIMITS`, `SEO_LIMITS`), but the server never enforces them — `normalizeAdResult` only trims whitespace and slices array *length*, never character length. A model that returns a 34-char headline ships straight to the UI; the `ad-strength.ts` heuristic and the limit re-check live entirely client-side. So the "structured, validated" promise in the file header is half-kept: the *shape* is validated, the *constraints* are not.
- **Opportunity**: Add a per-tool `validateResult(result)` that returns a list of constraint violations (over-limit headlines, missing required array counts, empty rationale). When `generateStructured` runs a non-demo call and the result violates constraints, do exactly one corrective re-prompt ("These fields exceeded limits: …; regenerate ONLY those, staying under the limit") before giving up and clamping. Stamp `meta.repaired: true` / `meta.violations` so the UI (and the existing transparency panel that already shows `meta.prompt`) can show it self-corrected.
- **Impact**: Closes the gap between what the prompts promise and what the server guarantees. A self-repairing tool is a far stronger case-study story than "we truncate with `clamp()` and hope," and it measurably reduces over-limit ad copy that Google Ads would reject.
- **Implementation sketch**: Add `validate?: (result: T) => string[]` to `GenerateArgs`. In `generateAds`/`generateBrief` pass validators built from `AD_LIMITS`/`SEO_LIMITS`. In `llm/index.ts`, after `normalize`, if `validate()` is non-empty, append the violation list to the prompt and re-run once. Reuse `computeAdStrength` from `ad-strength.ts` server-side to also attach an `adStrength` score to `meta` for ads.

## 4. Rate limiting + abuse guard on the single public LLM endpoint

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: S (<1d)
- **File**: `src/app/api/ai/route.ts` + new `src/lib/ai/rate-limit.ts`
- **Scenario**: `/api/ai` is an unauthenticated, public POST that shells out to a *paid* provider — the Claude CLI burns the owner's monthly subscription in dev, Gemini bills per token in prod (`runGemini`). There is no per-IP throttle, no daily cap, no per-mode ceiling. For a publicly-deployed job-application case study, a single scraper or a curious HN visitor in a loop can drain the budget or pin the box (each call can hold a 90 s `spawn`). This is the one finding that can take the demo *down*.
- **Opportunity**: Add a tiny fixed-window limiter keyed by client IP (from `x-forwarded-for`) persisted in the existing SQLite DB — a `rate_limits(key, window_start, count)` row, no new dependency, same zero-dep spirit as `db.ts`. Enforce e.g. N generations/min and a daily ceiling per IP; return `429` with a friendly Czech message and `Retry-After`. Optionally a global concurrency cap so two slow `spawn`s don't stack to OOM.
- **Impact**: Protects the provider budget and the deploy from trivial abuse — the difference between a case study that stays up under traffic and one that 502s when it gets shared. Cheap insurance that any reviewer evaluating production-readiness will look for.
- **Implementation sketch**: New `src/lib/ai/rate-limit.ts` with `checkRateLimit(ip, mode): { ok: boolean; retryAfter?: number }` backed by an upsert into a new `rate_limits` table in `db.ts`. Call it at the top of `route.ts` after parsing `mode`, before the `switch`. Add a process-level in-flight counter (`globalThis`, like `__systedoDb`) for the concurrency cap.

## 5. Versioned, A/B-testable prompts with an automated LLM-judge eval harness

- **Severity**: Medium
- **Lens**: moonshot-architect
- **Category**: feature
- **Effort**: L (>3d)
- **File**: `src/lib/gemini.ts` (the `*_SYSTEM` / `build*Prompt` constants) + new `src/lib/ai/prompts/` + `src/lib/ai/eval/`
- **Scenario**: Today each tool's prompt and JSON schema are inline `const`s in `gemini.ts` (`AD_SYSTEM`, `AD_SCHEMA`, `buildAdPrompt`). There is no version tag, no way to compare "prompt v1 vs v2," and no objective measure of whether a tweak made outputs better — improvements are vibes-only. Yet the app is literally a showcase of marketing *analytics*; an AI tool with zero quality telemetry undercuts the whole premise.
- **Opportunity**: (a) Extract each tool's `{ id, version, system, buildPrompt, schema }` into a `prompts/` registry and stamp `meta.promptVersion` on every response (the `generations`/`reports` tables already store `prompt`, so versioning slots in). (b) Build an offline eval harness: a fixed set of input fixtures × an LLM-judge that scores each generated output (ad-limit compliance, distinctness, Czech grammar, schema completeness) — reusing `computeAdStrength` as a deterministic anchor metric. Run two prompt versions over the fixtures and emit a comparison table. The moonshot end state: the case study ships with a visible "prompt quality dashboard" proving the AI is measured, not guessed.
- **Impact**: Transforms ad-hoc prompt tweaks into a measurable, regression-guarded pipeline — the single most credibility-defining move for an *AI marketing product* portfolio piece. Network effect: once outputs are persisted (idea #2) and scored, real production runs become eval fixtures, so quality compounds over time.
- **Implementation sketch**: Add `promptVersion` + optional `evalScore` to `AiMeta` in `ai-types.ts`. Create `src/lib/ai/prompts/{ads,brief,analysis,eval}.ts` exporting versioned descriptors; have `generateAds` etc. consume them. Add `src/lib/ai/eval/judge.ts` that calls `generateStructured` with a grading schema (`{ scores: {...}, issues: string[] }`) and a `scripts/eval.mjs` runner over `fixtures/*.json` producing a markdown comparison — mirroring the existing `scripts/llm-gate.mjs` pattern already in the repo.
