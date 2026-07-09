# AI Abuse Guards & Response Governance

> Context #21 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 5

## 1. `resolveWouldServe` reimplements `resolveProviders`' provider order and has already drifted (no BYOM branch)

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/ai/status-core.ts:18,53-68`
- **Scenario**: `resolveWouldServe(dev, claudeOk, geminiOk)` hand-encodes "Claude→Gemini in dev, Gemini→Claude in prod, first available, else demo" — the exact same decision `resolveProviders(dev, byom)` makes in `src/lib/llm/index.ts:152-157`, which is the *actual* chokepoint every `/api/ai` call goes through. The two were never wired together; they're independently maintained copies of one policy. They have already diverged: `resolveProviders` puts a resolved BYOM key first when the caller is BYOM-entitled, but `AiServePath` (`status-core.ts:18`) only has `"claude" | "gemini" | "demo"` — there is no `"byom"` member, and `resolveWouldServe`'s signature has no way to receive BYOM state. A BYOM-entitled signed-in user's preflight banner (`GET /api/ai/status` → `AiPreflight.tsx`) reports whichever of claude/gemini is env-available, even though the POST that follows would actually be served by the user's own key.
- **Root cause**: `status-core.ts`'s own docstring says it "Mirrors the provider order in the LLM wrapper" — a deliberate hand-mirror kept separate from `src/lib/llm/` so the GET status route (and the `"use client"` `AiPreflight.tsx`, which imports this file directly) doesn't have to pull in the heavier wrapper module. The mirror was never updated when BYOM ordering was added to `resolveProviders`.
- **Impact**: this is exactly the class of bug the file exists to prevent — its own docstring says the endpoint exists because "the client only learned it was in keyless demo mode AFTER a generation completed." A silent drift here means the banner can misreport which path serves a request, undermining the one thing it's for. Any future change to the app's provider order (a third provider, a different BYOM precedence rule) has to be remembered in two unrelated files or the banner quietly goes stale again.
- **Fix sketch**: extract the non-I/O ordering step of `resolveProviders` — `dev ? ["claude","gemini"] : ["gemini","claude"]` filtered/reordered by availability — into one exported pure helper in `src/lib/llm/index.ts` (e.g. `envProviderOrder(dev, hasByom): AiServePath[]`), and have both `resolveProviders` and `status-core.ts`'s `resolveWouldServe` call it; add `"byom"` to `AiServePath` and thread a plain `hasByom: boolean` into `resolveWouldServe` (the route already resolves BYOM entitlement server-side for POST, so `GET /api/ai/status` can compute the same boolean and pass it in — no new import into `status-core.ts` itself).
- **Gate impact**: the correct fix touches `src/lib/llm/index.ts`, which is in `HASHED_FILES` (the wrapper core) in `scripts/llm-gate.mjs` — it forces a full real-model gate re-run. A cheaper interim fix that avoids this (add the `"byom"` branch and parameter to `resolveWouldServe`/`AiServePath` only, without extracting anything from `index.ts`) closes the drift without touching a hashed file, at the cost of leaving the duplication itself in place.
- **Build risk**: whatever lands in `status-core.ts` must keep receiving BYOM state as a plain boolean/string parameter (as `dev`/`claudeOk`/`geminiOk` already are) rather than importing BYOM-resolution code (`@/lib/llm/byom-context` or similar, which is server-only) — `AiPreflight.tsx` (`"use client"`) imports `status-core.ts` directly, and a server-only transitive import there would pass `tsc --noEmit` but break `next build`.

## 2. Fixed-window math (`windowStart`/`currentCount`/`retryAfter`) is inlined twice in `rate-limit.ts`, duplicating the pure helpers already extracted in `durable-limit-core.ts`

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/ai/rate-limit.ts:120-125,149-151`
- **Scenario**: `rateLimit()` (lines 120-125) and `peekRateLimit()` (lines 149-151) each recompute `windowStart = now - (now % rule.windowMs)`, the "does the stored count still belong to the current window" check, and (in `rateLimit`) the retry-after countdown — three separate inline copies in one file. `durable-limit-core.ts:10-30` already extracted this exact logic as `windowStartFor`, `currentCount`, and `retryAfterFor`, precisely so it has one testable, framework-free home; `durable-limit.ts` imports and uses all three (`durable-limit.ts:44,79,94,96,153`). `rate-limit.ts` — the older, sqlite-backed sibling — never adopted them and kept its own copies instead.
- **Root cause**: `durable-limit-core.ts` was carved out when the Firestore-backed durable guard was added, but the extraction only touched the new Firestore path; the pre-existing sqlite path in `rate-limit.ts` was left as-is.
- **Impact**: the local sqlite limiter and the durable Firestore limiter are supposed to agree — `durableGuard` explicitly falls back to `localRateLimit`/`localPeekRateLimit` on a Firestore outage (`durable-limit.ts:134,158`), so callers rely on both paths producing the same accept/reject decision. Today they do, but any future fix to the window-boundary math (an off-by-one, a change to how a stale window is detected) has to be applied in four places by hand — `rateLimit`, `peekRateLimit`, and the two `durable-limit-core.ts` functions — and a partial fix would make the local and durable guard silently disagree on the same request.
- **Fix sketch**: in `rate-limit.ts`, import `windowStartFor`, `currentCount`, and `retryAfterFor` from `./durable-limit-core` and replace the three inline blocks; the only adaptation needed is mapping the sqlite row's `window_start`/`count` (snake_case columns) into the `{ windowStart, count }` shape `currentCount` expects before calling it.

## 3. `envInt` — the numeric-env-parsing helper — is copy-pasted three times with a silent bounds-check divergence

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/ai/rate-limit.ts:42-45`
- **Scenario**: the same 4-line `envInt(name, fallback)` helper is defined privately in `src/lib/ai/rate-limit.ts:42-45`, again in `src/lib/ai/durable-limit.ts:50-53`, and a third time in `src/lib/catalog/rate-limit.ts:11-14` (outside this context, but reusing this context's `rateLimit`/`tooManyRequests` per its own header comment). Two of the three copies require `n > 0`; `durable-limit.ts`'s copy requires `n >= 0` on purpose, so `AI_GLOBAL_DAILY_CEILING=0` can mean "ceiling disabled" (see `ceilingExceeded` in `durable-limit-core.ts:34-36`). Nothing documents that this is an intentional divergence rather than an oversight — a future edit to "fix" one copy to match the others would silently break the "0 = off" ceiling contract.
- **Root cause**: no shared `src/lib/env.ts` (or similar) exists in the repo; each module that needed env-int parsing wrote its own.
- **Impact**: three near-identical copies of a trivial-but-load-bearing parser (every rate/ceiling knob in this context flows through it) with an undocumented behavioral difference between them — low complexity but real risk of someone reconciling the "duplicates" the wrong way.
- **Fix sketch**: move one `envInt(name, fallback, { allowZero = false } = {})` into `durable-limit-core.ts` (already the pure, dependency-free home for this context) or a new `src/lib/env.ts`, export it, and have `rate-limit.ts`, `durable-limit.ts`, and `src/lib/catalog/rate-limit.ts` import it instead of redefining it.

## 4. `RATE_RULES.aiPerMin`/`aiPerDay` and `evalPerMin`/`evalPerDay` are near-identical factories that silently share one operator dial

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/ai/rate-limit.ts:53-62`
- **Scenario**: `aiPerMin`/`aiPerDay` (lines 55-56, backing `/api/ai`) and `evalPerMin`/`evalPerDay` (lines 58-59, backing `/api/campaigns/analyze`) are four separately-named `RateRule` factories that differ *only* in their `bucket` string — all four read the same two env vars, `AI_RATE_PER_MIN`/`AI_RATE_PER_DAY`. The bucket separation makes the two endpoints look independently throttled (and they are, as separate sqlite/Firestore counters), but an operator raising `AI_RATE_PER_MIN` to loosen the AI-tools endpoint also — invisibly — loosens the campaign-eval endpoint's throttle, and vice versa.
- **Root cause**: the four rules were written as four literal object factories instead of one parameterized one, so the shared env var reads as "this is one setting" only if you read all four definitions side by side.
- **Impact**: mostly a maintenance/legibility cost today (works correctly, just surprising), but it's the kind of thing that produces a confusing incident: someone tunes `AI_RATE_PER_MIN` for the AI panel under load and unknowingly also changes the eval endpoint's budget.
- **Fix sketch**: collapse to one factory, e.g. `const perMin = (bucket: string): RateRule => ({ bucket, limit: envInt("AI_RATE_PER_MIN", 8), windowMs: MIN })`, with `aiPerMin: () => perMin("ai:min")` / `evalPerMin: () => perMin("eval:min")` (and the `*PerDay` equivalent) — makes the shared-dial relationship explicit in the code instead of implicit in two copy-pasted literals. If independent tuning is actually wanted, this is the moment to give eval its own env vars instead.

## 5. A handful of exported tunable constants are never imported by name anywhere else in the repo

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/ai/rate-limit.ts:48,50`
- **Scenario**: `MAX_BODY_BYTES` and `MAX_CONCURRENT` (`rate-limit.ts:48,50`) — and, in the sibling file, `LATENCY_MIN_CALLS` and `PREFLIGHT_LOW_REMAINING` (`src/lib/ai/status-core.ts:71,98`) — are `export const`s, but a repo-wide grep shows every one of them is only ever read as the default parameter value inside its own file (`tooLarge`'s `maxBytes = MAX_BODY_BYTES`, `acquireSlot`'s `max = MAX_CONCURRENT`, `latencyByTool`'s `minCalls = LATENCY_MIN_CALLS`, and `PREFLIGHT_LOW_REMAINING` inline in `preflightNotice`). This is unlike `CATALOG_MAX_BODY_BYTES` in `src/lib/catalog/rate-limit.ts:27`, which the same pattern *does* get imported for (`src/app/api/projects/[id]/catalog/import/route.ts:13,31`), showing the override-by-import pattern is real elsewhere — just unused for these four.
- **Root cause**: likely exported defensively (documented, potentially test-hookable tunables) rather than because any caller needs the named value.
- **Impact**: cosmetic — no bug, just public surface nobody uses, which slightly obscures which exports are load-bearing (imported elsewhere) versus self-referential.
- **Fix sketch**: either drop the `export` on the four constants (keep them module-private since only their own file's default parameter reads them), or, if the intent is genuinely to let a future caller override them like `CATALOG_MAX_BODY_BYTES` does, leave as-is — this is a judgment call, not a correctness issue, so flagging rather than prescribing a single fix.
