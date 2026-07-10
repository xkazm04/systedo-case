# LLM Provider Wrapper, Telemetry & Quality Scoring

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Per-project spend reads the newest 1000 rows across ALL tenants, then filters by project — silently under-reports once platform traffic > 1000/window

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/llm/telemetry.ts:90`
- **Scenario**: `liveSpendForProject` (`src/lib/spend/live.ts:14`) calls `listLlmTelemetrySince(sinceIso, 1000)` for a 60-day window, then hands the result to `telemetryToSpend(telemetry, projectId, nowMs)` (`src/lib/spend/aggregate.ts:18`), which only there does `entries.filter(e => e.projectId === projectId)`. But `listLlmTelemetrySince` is not project-scoped: it runs `telemetryCol().where("at",">=",sinceIso).orderBy("at","desc").limit(1000)` over the **whole platform's** telemetry. Every `generateStructured` call for every user/project writes one row here. So on any instance with more than 1000 LLM calls in the trailing 60 days (i.e. any real usage), the global newest-1000 window is fetched first and a given project keeps only whatever fraction of *its own* rows happened to survive that global cut.
- **Root cause**: the "spend for project X" read is expressed as an unscoped global read plus an in-memory filter, with the row cap applied *before* the per-project filter — the query believes 1000 global rows is a superset of any one project's rows, which is false as soon as other tenants generate traffic.
- **Impact**: the Usage/Spend module's per-project 60-day cost/token totals silently under-report, and non-deterministically (the amount dropped depends on *other* tenants' volume, not this project's) — a money-facing number that reads plausible but is wrong and shrinks as the platform grows busier.
- **Fix sketch**: add a project-scoped reader `listLlmTelemetryForProject(projectId, sinceIso, limit)` that does `.where("projectId","==",projectId).where("at",">=",sinceIso)` (add the composite index), and have `liveSpendForProject` call it so the `limit` bounds *this project's* rows, not the platform's. Keep the global `listLlmTelemetrySince` only for the genuinely global digest/ops rollups.

## 2. `normalize()` runs inside the provider try-block — a tool-mapper exception is misclassified as a provider failure, after success telemetry is already written

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/llm/index.ts:344`
- **Scenario**: In the provider loop, the success path awaits `recordLlmCall({... demo:false, estCostUsd ...})` (line 320), then `return { result: args.normalize(parsed), meta }` (line 344) — all still inside the `try` that opens at line 270. `looksCorrupt` (line 340) explicitly acknowledges `parsed` can be missing required fields, so a not-perfectly-defensive `normalize` (e.g. `parsed.items.map(...)` when `items` is absent) throws a `TypeError`. That throw is caught by the provider `catch (err)` at line 345, which treats it as a **provider failure**: it calls `recordLlmError`, logs `[llm] provider … failed`, and falls through to the *next* provider — issuing another real (paid) generation. If the mapper bug is deterministic, every provider in the list is tried (each writing its own phantom success `recordLlmCall`) before degrading to the demo.
- **Root cause**: the app's own pure post-processing (`normalize`) is executed inside the block reserved for provider I/O, so a bug in *our* code is attributed to *their* endpoint and triggers cross-provider fallback.
- **Impact**: wrong cost/telemetry (a success row with cost is recorded for a call that then "failed"), duplicated paid provider calls for a defect that no retry can fix, and a real bug hidden as a transient provider hiccup in monitoring.
- **Fix sketch**: move `args.normalize(parsed)` out of the provider `try` — compute `parsed`/`meta` inside, `break`/return the raw parsed on success, and run `normalize` (and the `recordLlmCall`) *after* the loop, so a mapper throw propagates to the caller as an app error instead of masquerading as a provider fallback.

## 3. Self-repair re-prompt overwrites (not sums) token usage — every repaired call under-reports its cost by a full generation

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/llm/index.ts:291`
- **Scenario**: When `args.validate` returns violations, the wrapper issues a second generation to self-correct (line 285) and does `usage = second.usage ?? usage` (line 291). The first attempt's tokens are discarded, not added. `meta.estCostUsd` (line 314) and the recorded `inputTokens`/`outputTokens` (lines 331-332) then reflect **only the repair attempt**, even though the user was actually billed for two full generations (the initial output + the repair). `totalAttempts` *is* summed (line 292), so the entry inconsistently shows the extra attempt count but not its cost.
- **Root cause**: `usage` is treated as "the usage of the last attempt" rather than "the cumulative usage of this call," so an intentional two-shot path is metered as one shot.
- **Impact**: cost/token telemetry under-reports spend on precisely the tools that repair most (the character-limit-validated ones like `ads`), and the per-project/per-tool spend rollups inherit the undercount — the "cost-tracked" story is systematically low exactly where the app spent the most.
- **Fix sketch**: accumulate usage across attempts, e.g. `usage = addUsage(first.usage, second.usage)` summing `inputTokens`/`outputTokens`/`totalTokens` (and `costUsd` when both report it), so a repaired call reports the real two-generation cost.

## 4. On Windows, `child.kill()` kills the `cmd /c` wrapper but leaves the real `claude` process running — timeout/abort doesn't actually stop the paid work

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/llm/claude.ts:99`
- **Scenario**: The CLI is spawned as `spawn("cmd", ["/c", "claude", ...args])` (line 93). Both the timeout handler (`child.kill()`, line 99) and the client-abort handler (`onAbort` → `child.kill()`, line 108) terminate the `cmd.exe` wrapper. On Windows, killing `cmd.exe` does **not** terminate the child process it launched — the actual `claude` CLI (a `claude.cmd` → Node process) keeps running to its own completion. The `close` event fires when `cmd` exits so the JS promise settles (freeing the JS slot), but the model generation continues detached.
- **Root cause**: `child.kill()` signals only the immediate child (cmd), not the process *tree*; the wrapper assumes killing the spawned handle stops the work it represents.
- **Impact**: a client timeout, re-run, or closed tab — the exact cases the abort plumbing exists to handle ("stop burning the provider for a caller that is already gone") — still runs the full Claude generation to the end, defeating the stated purpose and continuing to consume the subscription/machine for output nobody reads; under repeated aborts these orphans accumulate. (Dev/Claude-CLI path only; prod Gemini aborts correctly via the SDK.)
- **Fix sketch**: kill the whole tree — `spawn(..., { detached: false })` plus `taskkill /pid <child.pid> /T /F` on Windows (or `child.kill()` of a `process.platform`-appropriate process-group), the killTree pattern; verify the grandchild PID is gone after abort.

## 5. LightTrack event/error senders re-hand-build the same event envelope

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/llm/lighttrack.ts:103`
- **Scenario**: `trackLlmEvent` (body at lines 103-127) and `trackLlmError` (body at lines 143-154) independently assemble the same LightTrack event scaffold: `provider: normProvider(...)`, `model`, `operation`, `source: SOURCE`, `tags: [\`tool:${toolId}\`, ENV_TAG, ...]`, `metadata: { toolId, product_id: toolId }`, the trailing `if (PROJECT) body.project_id = PROJECT`, and `post("/v1/events", body)`. Two copies of the same wire contract, differing only in `status`, the extra tags, and success-vs-error fields. (New vs the 2026-07-09 report, which did not touch `lighttrack.ts`.)
- **Root cause**: the second sender (`trackLlmError`) was added by copying the first rather than factoring the common envelope into a builder.
- **Impact**: low today, but a change to the shared shape (a new required field, a `source`/tag/`project_id` convention change, endpoint rename) must be made in both, and missing one silently sends malformed error events while success events stay correct — divergence that only shows up server-side.
- **Fix sketch**: extract `buildEvent(base: { provider; model; status; operation; tags; metadata; ... })` that stamps `source`, `ENV_TAG`, `project_id` and posts to `/v1/events`, and have both functions call it with only their differing fields. Purely internal to `lighttrack.ts` — **not** a `HASHED_FILES` module, so no `llm-gate` re-run.
