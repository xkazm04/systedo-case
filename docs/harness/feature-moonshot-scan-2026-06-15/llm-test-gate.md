# Feature + Moonshot Scan — LLM Wrapper Test Gate

> Context: ctx_1781547850552_duieavr
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Cost & latency budget assertions in the real test suite
- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **File**: `test-llm/real.test.mjs` (the per-tool `test(...)` loop) + `test-llm/registry.mjs` (per-tool entries)
- **Scenario**: The gate proves each call site returns schema-valid JSON, but it says nothing about *how long* or *how much* the call cost. A prompt edit that quietly triples latency or balloons output tokens sails straight through — the case study's headline is "keeps the AI layer honest," yet the most operationally honest metrics (latency, token spend) are invisible. The wrapper already stamps `meta.tookMs` (`src/lib/llm/index.ts:54`), so the data is sitting unused.
- **Opportunity**: Add an optional `budget: { maxMs, maxOutChars }` (and later `maxTokens`) field per tool in `LLM_TOOLS`, and assert it in `real.test.mjs` against `res.meta.tookMs` and the serialized result size. Default a generous ceiling (e.g. `maxMs: 90_000`) so the gate fails loud on a 2x regression rather than only on a hard timeout at 120s. Print the observed `tookMs` per tool so a developer sees the trend even when passing.
- **Impact**: The gate now catches performance and verbosity regressions, not just correctness ones — a materially richer quality bar and a stronger story for the case study ("the gate enforces latency and cost budgets, not just shape").
- **Implementation sketch**: In `real.test.mjs`, after the `validate` assert, add `if (tool.budget?.maxMs) assert.ok(res.meta.tookMs <= tool.budget.maxMs, ...)` and a size check on `JSON.stringify(res.result).length`. Add `budget` keys to each entry in `registry.mjs`. Optionally extend the Claude provider to surface token counts from the CLI `--output-format json` envelope (`src/lib/llm/claude.ts:154` already parses stream-json) so a real `maxTokens` budget becomes possible.

## 2. Machine-readable gate report artifact (JSON + Markdown summary)
- **Severity**: High
- **Lens**: feature-scout
- **Category**: automation
- **File**: `scripts/llm-gate.mjs` (end of run, alongside the `.llm-gate-cache.json` write at line 126)
- **Scenario**: Today the gate's only durable output is the pass/fail cache (`.llm-gate-cache.json`, 4 fields). Everything informative — the call-site → tag map, chokepoint status, per-tool timings — is printed to the console and lost. A reviewer on a PR, or CI, or the case-study page itself, has nothing structured to read. The `--list` path (`llm-gate.mjs:59`) computes a great inventory and throws it away.
- **Opportunity**: Emit `.llm-gate-report.json` and a rendered `llm-gate-report.md` on every run: call sites with their tags, registry coverage, chokepoint violations, and (after idea #1) per-tool latency/size. The Markdown is a self-documenting table the case study can embed verbatim ("here is the live state of the AI layer's test gate").
- **Impact**: Turns an ephemeral console gate into a publishable artifact — directly serves the portfolio/case-study purpose, gives reviewers a diffable record, and is the foundation CI needs (idea #4).
- **Implementation sketch**: Refactor the coverage block (`llm-gate.mjs:48-85`) to build a `report` object instead of only `console.log`. Write `writeFileSync(join(ROOT, ".llm-gate-report.json"), ...)` and a small `renderMarkdown(report)` helper that emits a table. Add a `--report` flag that runs section 1 only and prints the path. Reuse `findCallSites()`/`checkChokepoint()` data already in hand.

## 3. Drift & freshness guards on the registry and cache
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: functionality
- **File**: `scripts/llm-gate.mjs` (HASHED_FILES + cache validation, lines 29-41, 100-107) and `test-llm/registry.mjs`
- **Scenario**: The hash gate trusts a hard-coded `HASHED_FILES` list. If someone adds a new provider file (say `src/lib/llm/openai.ts`) or a new tagged call site in a file not on the list, the cache stays "green" and the slow real tests never re-run — a silent hole in exactly the mechanism the gate is built on. Also, the registry's prompts are frozen Czech strings with char limits ("do 30 znaků") that the `validate` functions never actually check, so a model that ignores the limit still passes.
- **Opportunity**: (a) Auto-derive the hashable set: hash every file under `src/lib/llm/`, every file containing a `// llm-tool:` tag (already discovered by `findCallSites()`), and the `test-llm/` sources — so adding an AI file can never go unhashed. (b) Add a `constraints` block per tool (e.g. `maxLen: { headlines: 30 }`) and enforce it inside `validate`, making the registry's stated limits real assertions.
- **Impact**: Closes the cache's blind spot (the gate's single biggest integrity risk) and upgrades validators from "shape" to "shape + business rules," tightening the honesty guarantee.
- **Implementation sketch**: In `llm-gate.mjs`, replace the static `HASHED_FILES` with a function that globs `src/lib/llm/**`, unions the `tags[].file` set from `findCallSites()`, and the `test-llm/*.mjs` files. In `registry.mjs`, add a shared `withinLimit(arr, n)` helper and fold length checks into each `validate`.

## 4. One-command CI mode with a non-interactive demo/record path
- **Severity**: High
- **Lens**: feature-scout
- **Category**: integration
- **File**: `scripts/llm-gate.mjs` (the spawn at lines 112-122 and the dev-default in `test-llm/setup.mjs:6`)
- **Scenario**: The gate is a *local* pre-commit hook bound to a logged-in Claude subscription (`src/lib/llm/claude.ts` shells to the `claude` CLI). On CI there is no subscription, so the real run can't execute — meaning a PR can land AI changes that were never gate-verified by the server. The coverage check (static, no model) *could* run anywhere but isn't wired as a CI step, and there's no way to verify a recorded pass.
- **Opportunity**: Add `--ci` mode that (1) always runs the static coverage + chokepoint checks (they need no model), (2) verifies the committed `.llm-gate-cache.json` hash matches the current code and *fails the build if it's stale or absent* — i.e. CI enforces "the author ran the real gate locally and committed proof," and (3) optionally runs the real suite against Gemini (the production provider) when an API key secret is present, giving cross-provider verification.
- **Impact**: Extends the gate from one developer's machine to the whole team's pipeline without needing a subscription in CI — the missing half of a credible "pre-commit chokepoint" and a strong case-study point.
- **Implementation sketch**: Add `if (args.has("--ci"))` branch in `llm-gate.mjs` after the coverage section: recompute `hash`, compare to cache, `fail()` on mismatch. Add a GitHub Actions workflow calling `npm run llm:gate -- --ci`. For the optional cross-provider run, set `NODE_ENV=production` + a `GEMINI_API_KEY` secret so `generateStructured` routes to `runGemini` (`src/lib/llm/index.ts:57`).

## 5. Extract a reusable, provider-agnostic "LLM Quality Gate" package
- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: feature
- **File**: whole context — `scripts/llm-gate.mjs`, `test-llm/callsites.mjs`, `test-llm/registry.mjs`, `test-llm/resolve-hooks.mjs`, `test-llm/setup.mjs`
- **Scenario**: This gate is genuinely novel — a content-hash-cached, chokepoint-enforced, registry-backed pre-commit verifier for an AI layer. Right now it's hard-wired to *this* app: the wrapper path `src/lib/llm/index.ts`, the symbol `generateStructured`, the Czech fixtures, the Google `Type` schema dialect, and the specific provider leak patterns (`new GoogleGenAI`, `node:child_process`) are all baked into `callsites.mjs` and `registry.mjs`. The ideal end state: any Next.js/Node team `npm i -D llm-gate`, drops a config, and gets the same honesty guarantee. That reusable tool *is* the case study's flagship engineering artifact.
- **Opportunity**: Refactor the hard-coded constants into an `llm-gate.config.mjs` (wrapper module + chokepoint symbol, call-site matcher, leak-pattern rules, hashed globs, registry path) and publish the engine as a tiny zero-dep package: a `defineTool()` helper, a pluggable provider adapter (so Claude-CLI / Gemini / OpenAI all slot in), and the cached-real-run + static-coverage engine. The case study then showcases not just an app feature but a category-defining, reusable quality system with a README and live report (idea #2).
- **Impact**: 10x force multiplier — transforms an internal gate into an open-source artifact that demonstrates senior engineering judgment (the exact signal a job-application case study exists to send), and is independently useful to other teams.
- **Implementation sketch**: Phase 1 — hoist all literals from `callsites.mjs` (lines 17-19, 45, 61-66) and `registry.mjs` into a config object; have `findCallSites`/`checkChokepoint` accept it. Phase 2 — define a `ProviderAdapter` interface ({ available(), run() }) and move the Claude/Gemini specifics behind it so `real.test.mjs` is provider-blind. Phase 3 — split `engine/` (gate logic, reusable) from `app-config/` (this app's fixtures); add `package.json` `bin`/`exports`. Keep the existing `npm run llm:gate` working by having it call the engine with the local config.
