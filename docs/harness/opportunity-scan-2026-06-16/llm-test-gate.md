# LLM Wrapper Test Gate — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Capture golden-output snapshots, not just pass/fail
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: test-llm/real.test.mjs, .llm-gate-cache.json
- **Opportunity**: `real.test.mjs` only asserts `tool.validate(res.result)` returns truthy and discards the actual model output. There is no record of what each tool produced — the cache (`.llm-gate-cache.json`) stores only `{hash, passed, tools[]}`. Persist the real `res.result` per tool to a committed `test-llm/__snapshots__/<id>.json` and diff against it, with a `--update-snapshots` escape hatch.
- **Value**: A reviewer/hiring manager can open the repo and *see* the exact Czech ad copy / SEO brief / campaign verdict the real model returned — concrete proof the AI layer works, not just a green check. Snapshots also catch silent quality regressions (prompt drift, schema shape changes) that a lenient boolean validator passes through.
- **Effort**: M
- **Fix sketch**: In the per-tool test, after `tool.validate`, read/write `test-llm/__snapshots__/${tool.id}.json`; on mismatch fail with a structured diff unless `process.env.UPDATE_LLM_SNAPSHOTS`. Commit snapshots so they double as living documentation of model output.

## 2. Emit a per-tool latency + cost report artifact from the real run
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: test-llm/real.test.mjs, scripts/llm-gate.mjs, src/lib/llm/cost.ts
- **Opportunity**: The wrapper already returns rich telemetry — `meta.tookMs`, `meta.attempts`, `meta.estCostUsd` (via `estimateCostUsd`), `meta.repaired`, `meta.fellBack` — but the test throws all of it away after the boolean assert, and the gate prints nothing quantitative. Collect per-tool `tookMs`/`attempts`/`repaired` into a `test-llm/last-run-report.json` (and a console table) written by `llm-gate.mjs` after a successful run.
- **Value**: Turns the gate from "did it pass" into "here's how fast/reliable each AI feature is" — a latency + self-repair-rate dashboard that signals engineering rigor. It also gives the dev an early warning when a prompt change doubles latency or starts needing repair re-prompts.
- **Effort**: M
- **Fix sketch**: Have `real.test.mjs` append `{id, tookMs, attempts, repaired}` from `res.meta` to a JSON file (or stdout marker); in `llm-gate.mjs`, parse and pretty-print a table, then fold the report path into the cache write alongside `provenAt`.

## 3. No production (Gemini) path is ever exercised by the gate
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: test-llm/setup.mjs, test-llm/real.test.mjs, scripts/llm-gate.mjs
- **Opportunity**: `setup.mjs` hard-defaults `NODE_ENV=development` and `real.test.mjs` asserts `res.meta.model === CLAUDE_MODEL`, so the Gemini provider (`runGemini`, the actual *production* code path) is never run against the registry fixtures. The provider that ships to users is untested end-to-end; only the dev-only Claude path is proven.
- **Value**: The case study's headline is "Claude in dev, Gemini in prod." Proving only dev is a credibility gap a sharp reviewer will spot. A keyed, opt-in `real.gemini.test.mjs` (skipped when `GEMINI_API_KEY` is absent) closes the gap and demonstrates true provider parity — the hardest part of a two-provider design.
- **Effort**: M
- **Fix sketch**: Add a Gemini variant that sets `NODE_ENV=production`, runs the same `LLM_TOOLS` fixtures through `generateStructured`, asserts `meta.model === GEMINI_MODEL`, and `test.skip`s when no key is set; optionally wire it as an opt-in CI job using a repo secret.

## 4. Schema fixtures are hand-duplicated from the real call sites (drift risk)
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: feature
- **File**: test-llm/registry.mjs, test-llm/callsites.mjs
- **Opportunity**: The coverage gate proves a tag *id* exists at each `generateStructured` call site, but the `schema` objects in `registry.mjs` are copy-pasted shapes of the app's real schemas (in `src/lib/gemini.ts`) with no check that they still match. A field added to the real `campaign-eval` schema won't fail any test. Strengthen `checkChokepoint`/coverage to compare the registry schema's required-keys against the schema literal at the tagged call site, or import the real schema constants.
- **Value**: Removes the one place the gate's "1:1 sync" guarantee leaks — keeps the impressive coverage story actually true as the app evolves, the difference between a gate that *looks* airtight and one that *is*.
- **Effort**: M
- **Fix sketch**: Export the app's schema objects from a shared module, import them in `registry.mjs` instead of redefining, and add a coverage assertion that each registry tool's `required` keys are a subset of the imported schema's `required`.

## 5. Track prompt/system versions so model-quality changes are attributable
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: growth
- **File**: test-llm/registry.mjs, .llm-gate-cache.json
- **Opportunity**: Each registry tool has a `system` + `prompt` string but no version identity. The cache keys re-runs on a SHA of whole files; there's no per-tool prompt fingerprint, so you can't tell *which* tool's prompt changed or correlate an output-quality shift to a specific prompt edit. Add a `promptHash` per tool (hash of `system+prompt+schema`) recorded in the cache and the run report.
- **Value**: Foundation for an evals story — "prompt v3 of `ads` improved validation pass-rate" — which is exactly the kind of iterative-improvement narrative that differentiates a serious AI product from a demo. Mirrors the `promptVersions` discipline already used in the sibling personas project.
- **Effort**: S
- **Fix sketch**: In `registry.mjs` compute `promptHash = sha256(system+prompt+JSON.stringify(schema))` per tool; write the `{id: promptHash}` map into `.llm-gate-cache.json` next to `tools[]` so a changed prompt is visible (and could later granularly invalidate only its own snapshot/test).
