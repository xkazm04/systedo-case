# LLM Provider Wrapper, Telemetry & Quality Scoring — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. BYOM 429 is classified as a terminal user "quota" fault — a transient rate-limit burst becomes a hard error with no retry and no fallback
- **Severity**: High
- **Lens**: ambiguity
- **Category**: byom-429-misclassification
- **File**: src/lib/llm/errors.ts:167
- **Scenario**: A BYOM user with a perfectly healthy, funded key hits a momentary provider throttle (429 from a burst, shared-tier rate limit, or provider-side load shedding). `classifyByomHttp` maps every 429 to `ByomUserError("quota", …, "Vyčerpán limit nebo kredit vašeho účtu…")`.
- **Root cause**: HTTP 429 conflates two very different conditions — "slow down for a second" (transient, often with Retry-After) and "you are out of credit" (user fault). The classifier collapses both into the user-fault branch. Because `generateStructured` re-throws `ByomUserError` before the retry/fallback machinery (index.ts:397), the carefully built `rate_limited` code path with `parseRetryAfterMs` + `LLM_RETRY_AFTER_CAP_MS` backoff (errors.ts:115, models.ts:89) is unreachable for BYOM calls — the one path where 429s are most likely.
- **Impact**: Users see a Czech message accusing their account of being out of credit when nothing is wrong; one throttled second turns into a failed generation instead of a 250ms retry or a fall-through to the app's provider. Erodes trust in BYOM ("it says my key is broken but it works everywhere else").
- **Fix sketch**: In `classifyByomHttp`, treat 429 as user-fault only when the body/headers indicate exhausted quota (e.g. body matches /quota|credit|billing|insufficient/i or no Retry-After present after N attempts); otherwise return `null` (recoverable) or throw a typed `LlmCallError("rate_limited", …, { retryAfterMs })` so the existing bounded-retry + Retry-After honoring applies. Document the deliberate split next to the 402 case.

## 2. Self-repair re-prompt overwrites the first call's token usage — telemetry and on-screen cost undercount by an entire paid call
- **Severity**: High
- **Lens**: ambiguity
- **Category**: repair-usage-undercount
- **File**: src/lib/llm/index.ts:328
- **Scenario**: A generation violates a domain limit, the wrapper re-prompts once (`repaired: true`). Two real metered calls were made, but `usage = second.usage ?? usage` replaces the first call's usage with the second's instead of summing them.
- **Root cause**: The repair branch treats usage as "latest wins" while attempts are correctly accumulated (`totalAttempts += second.attempts` on line 329) — an inconsistency a future reader has no way to know is unintentional. `meta.estCostUsd` and the Firestore `recordLlmCall` entry (inputTokens/outputTokens, index.ts:376-377) then reflect roughly half the real spend for every repaired call. The same shape applies to `usage.costUsd` (OpenRouter's real reported cost) — the first call's actual dollars vanish.
- **Impact**: Every dashboard downstream of this single funnel — the Usage module's per-project spend (`listLlmTelemetryForProject`), the weekly digest's "odhad nákladů" line (telemetry-ops.ts:81), LightTrack cost rollups — systematically under-reports cost exactly for the calls that are already the most expensive (double-generation). BYOM users comparing the on-screen estimate to their provider bill will see an unexplained gap.
- **Fix sketch**: Sum the two usages: `usage = addUsage(usage, second.usage)` (fields are plain counters; sum `costUsd` when both present, else undefined). Add one line of comment stating repaired calls report combined usage.

## 3. LightTrack mirror hardcodes `status: "success"` — corrupt and demo calls are reported as healthy, and corrupt calls double-emit
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: telemetry-status-dropped
- **File**: src/lib/llm/lighttrack.ts:110
- **Scenario**: The wrapper carefully classifies each call as success/repaired/corrupt/demo and stamps it on the durable Firestore entry (index.ts:361). `trackLlmEvent` receives that same entry — `entry.status` is right there on the type — but sends a hardcoded `status: "success"` for every mirrored call, including `status: "corrupt"` and `demo: true` ones.
- **Root cause**: The event body was written before `status` was added to `LlmTelemetryEntry` (telemetry.ts:35 notes it is "additive"), and the mirror was never updated. Corrupt calls are partially compensated by a *second* event via `recordLlmError` → `trackLlmError` (index.ts:385), so one corrupted generation produces both a "success" event and an "error" event in LightTrack.
- **Impact**: LightTrack's success-rate and error-spike monitoring — the module's stated purpose ("a signal the monitoring can act on", lighttrack.ts:137) — disagrees with the app's own Firestore truth: corrupt output inflates success counts and inflates call totals (double-emit), and demo traffic (provider down!) reads as 100% healthy successes apart from a tag most dashboards won't filter on. The header comment "so LightTrack agrees with the app's own AI telemetry" is currently false for status.
- **Fix sketch**: Forward the real status: `status: entry.status === "corrupt" ? "error" : "success"` (or map demo→a distinct status if the server supports one), and drop the separate `recordLlmError` mirror for the corrupt case in index.ts:385 so each call emits exactly one event.

## 4. `listLlmTelemetryForProject` fetches a project's entire all-time telemetry with no limit — the "plan-bounded" assumption is asserted, not enforced
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unbounded-query-growth
- **File**: src/lib/llm/telemetry.ts:144
- **Scenario**: The per-project spend rollup runs `where("projectId", "==", projectId).get()` with no `.limit()` and no `at` range in the query; the `sinceIso` window is applied in memory *after* every document has been read.
- **Root cause**: The doc comment justifies this with "a project's 60-day telemetry is plan-bounded, so this stays small" — but nothing bounds the *collection*: the query fetches lifetime rows, not 60-day rows, and no TTL/cleanup for `llmTelemetry` exists in this module. The load-bearing assumption (someone, somewhere, deletes old rows) is undocumented and unverifiable from here; its sibling `listLlmTelemetrySince` got a `limit = 1000` precisely to avoid this shape.
- **Impact**: Read cost and latency grow linearly with a project's lifetime AI usage, forever. A year-old active project makes the Usage page pay to fetch (and deserialize) thousands of rows to keep a 60-day slice. Fails slowly and invisibly — exactly the kind of degradation nobody attributes to this line.
- **Fix sketch**: Add `.limit(N)` (mirroring the sibling) as a hard backstop, or add the `at >= sinceIso` range to the query and create the composite index (a one-time cost that makes the read window-bounded); at minimum, replace the "plan-bounded" comment with a pointer to whatever actually prunes `llmTelemetry`, or note that nothing does.

## 5. `runCli` writes the prompt to stdin with no stdin error handler — a spawn race can crash the whole server process
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unhandled-stream-error
- **File**: src/lib/llm/claude.ts:160
- **Scenario**: The Claude CLI child fails to start (uninstalled mid-session after the cached `claudeAvailable()` probe passed, PATH change, EACCES) or dies instantly (killed by the timeout/abort path before stdin flushes). `child.stdin.write(input)` then raises EPIPE/ERR_STREAM_DESTROYED as an `'error'` event on the stdin stream.
- **Root cause**: `child.on("error")` covers the *process* spawn failure, but Node delivers write-after-death failures on the *stream* — and an `'error'` event on a stream with no listener is thrown as an uncaught exception, outside the surrounding Promise's reach. The availability cache (`_available`, claude.ts:72) widens the window: a probe that succeeded once vouches for the CLI for the process's lifetime.
- **Impact**: Instead of the intended typed `LlmCallError("network", …)` degradation, an unlucky race takes down the Node process (or, under Next.js's uncaught-exception handling, produces an opaque 500 with no telemetry entry) — the one failure mode this module's layered error taxonomy was built to prevent.
- **Fix sketch**: Attach `child.stdin.on("error", () => {})` (the `close` / `error` handlers already own rejection), or use `child.stdin.end(input)` wrapped in try/catch plus the no-op error listener. One line, closes the only unguarded seam in an otherwise thorough lifecycle.
