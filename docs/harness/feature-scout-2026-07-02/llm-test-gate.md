# Feature Scout — LLM Wrapper Test Gate (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: scripts/llm-gate.mjs, test-llm/callsites.mjs, test-llm/registry.mjs, test-llm/resolve-hooks.mjs, test-llm/setup.mjs, test-llm/real.test.mjs, test-llm/coverage.test.mjs, .llm-gate-cache.json

## 1. Re-prove only the tools whose code changed (per-tool incremental gate)
- **Impact**: 8/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: none
- **Category**: automation
- **File**: `scripts/llm-gate.mjs:112`
- **Opportunity**: The cache is one aggregate hash over all 24 `HASHED_FILES` (`hashFiles` at :112, checked at :126) — editing a single tool's prompt in `src/lib/ai/tools/ads.ts` re-runs all 14 real-model tests (~340 s). Every ingredient for granularity already exists: test names embed the tool id (`real.test.mjs:18`, selectable via node's `--test-name-pattern` without touching the hashed test file), `findCallSites().tags` maps each tool source file to its id, and `llm-eval`'s per-tool `fingerprint()` + committed goldens already scope registry edits to individual tools.
- **Why valuable**: The ~340 s all-or-nothing cost is the single biggest drag on this repo's AI work — an entire AI-assist wave was deferred because of it, and the known gate-locked follow-ups each budget a full run. Cutting a one-tool edit to one ~25 s probe changes what is economical to commit.
- **Build sketch**: In `llm-gate.mjs` (not itself hashed), store a per-file hash map plus per-tool `provenAt` in `.llm-gate-cache.json` instead of one digest. On a run, diff files: if every changed file is a single-tool file (map via `findCallSites().tags`) or a single tool's registry fingerprint (reuse `fingerprint()` from `scripts/llm-eval.mjs`), spawn `node --test --test-name-pattern "· <id> "` per affected tool and merge the pass into the cache; any change to shared files (`src/lib/llm/*`, `_shared.ts`, the two routes, `setup.mjs`, `resolve-hooks.mjs`, `real.test.mjs`) or `--force` conservatively falls back to the full suite. Composes with (does not replace) the already-known gate-locked follow-up to derive the hash-set membership from call sites. Print the delta ("changed: ads.ts → re-proving 1/14 tools") so the dev sees why they are paying.

## 2. Add a key-free `--check` mode and make CI verify the committed proof is fresh
- **Impact**: 7/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: integration
- **File**: `scripts/llm-gate.mjs:126`
- **Opportunity**: Nothing enforces the gate outside local husky: `.github/workflows/ci.yml` runs coverage + goldens but never checks that the committed `.llm-gate-cache.json` hash still matches the committed LLM code — a `git commit --no-verify`, a GitHub-web edit, or a merge can land LLM changes with a stale "proven" badge and CI stays green. Related gap: the gate writes the fresh cache at :149 during pre-commit but never `git add`s it, so the proof lands in the working tree, one commit behind the code it proves. (Distinct from the known gate-locked "prove the Gemini path in CI" — this makes zero model calls.)
- **Why valuable**: The cache is the gate's whole promise ("proven for this exact code"); today that promise is only as strong as everyone remembering not to bypass husky. A deterministic freshness check closes the loop for free.
- **Build sketch**: Add `--check` to `llm-gate.mjs`: run the existing coverage + chokepoint + `llm-eval --strict` steps, recompute `hashFiles(HASHED_FILES)`, and exit 1 if `cache.hash` mismatches or `cache.passed` is false — never spawning the model. Add one step to `ci.yml` (`node scripts/llm-gate.mjs --check`). Companion fix so honest commits pass the new check: after `writeFileSync(CACHE, …)` at :149, `spawnSync("git", ["add", ".llm-gate-cache.json"])` so the fresh proof ships in the same commit.

## 3. Show a human-readable contract diff when goldens drift, not just fingerprints
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: functionality
- **File**: `scripts/llm-eval.mjs:61`
- **Opportunity**: On drift the eval prints only `DRIFT` plus two 16-hex fingerprints (`rows` at :71, table at :86) and the gate blocks the commit telling you to "review the change" — but the golden snapshot stores no reviewable content (only `promptHash` + sorted `schemaKeys`), so there is nothing in the failure output to actually review; the dev must reconstruct what changed from git archaeology on `registry.mjs`.
- **Why valuable**: The whole point of the golden step (gate section 1b, `llm-gate.mjs:100-107`) is a *reviewable* prompt/schema diff; making the drift self-explaining turns a frustrating red X into the review it was designed to force, and catches unintended drift (e.g. a stray edit to a shared system-prompt phrase) at a glance.
- **Build sketch**: Extend the golden snapshot written at `llm-eval.mjs:69` to also store the full `system` text and the stable-stringified schema (both already in hand at fingerprint time). On `DRIFT`, print a per-field comparison: system prompt old→new (a simple line-level diff is enough — the prompts are short), and added/removed `schemaKeys`. Neither `llm-eval.mjs` nor `test-llm/golden/*` is in `HASHED_FILES`, so this lands without a real-model run; regenerate goldens once with `npm run llm:eval:update`.

## 4. Scaffold new LLM tools with `npm run llm:new` (registry + tag + golden + hash-list in one shot)
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: automation
- **File**: `test-llm/registry.mjs:19`
- **Opportunity**: Adding a tool is a five-part manual ritual — a `// llm-tool:` tag at the call site, a hand-written registry fixture (system/prompt/schema/validate, ~40 lines each in `LLM_TOOLS`), a golden via `llm:eval:update`, a `HASHED_FILES` line in `llm-gate.mjs:29-54`, and knowledge of the gate cost. The ritual has already been fumbled once (the known `social.ts` hash-list omission), and 14 near-identical fixtures show how mechanical the boilerplate is.
- **Why valuable**: The registry is the product's extension surface — every future AI feature pays this toll, and each forgotten step silently weakens the gate. A generator makes the safe path the lazy path.
- **Build sketch**: New `scripts/llm-new-tool.mjs` (`llm:new` script): takes `--id`, `--label`, `--file src/lib/ai/tools/<x>.ts`; appends a registry entry skeleton reusing the existing `isStr`/`isStrArr` validator helpers and the Czech system-prompt house style, inserts the file into `HASHED_FILES`, runs `llm:eval --update` for the golden, and prints the exact `// llm-tool: <id>` tag + wrapper call snippet (with the `id:` telemetry arg) for the call site. Finish by running `node scripts/llm-gate.mjs --list` so the dev sees the new site UNTAGGED until they paste the tag. Building the generator touches no hashed file; note in its output that the *resulting* commit is gate-triggering by design.

## 5. Capture known-good model outputs during real runs and replay them as fast offline validator tests
- **Impact**: 6/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: [GATE]
- **Category**: functionality
- **File**: `test-llm/real.test.mjs:19`
- **Opportunity**: Each tool's `validate` (e.g. `registry.mjs:271-283`) is only ever executed 340 s into a real-model run — a broken or over-strict validator is discovered at maximum cost, and the repo has already been bitten by exactly this (the `article-draft` comment documents a strict `every()` that flaked under model variance). The real run produces genuine schema-shaped outputs on every pass and then throws them away.
- **Why valuable**: A committed corpus of real model outputs gives millisecond-fast validator regression tests, lets validator strictness be tuned against actual Claude variance offline, and doubles as realistic fixtures when reviewing prompt changes — all without extra model spend.
- **Build sketch**: Env-guarded capture in `real.test.mjs` (when `LLM_CAPTURE=1`, write `res.result` to `test-llm/samples/<id>.json` after the assertions pass); have `llm-gate.mjs` set the flag on its real runs so the corpus refreshes itself whenever the gate re-proves. Add a fast `test-llm/samples.test.mjs` (run from the existing `test:unit` glob-free script or a sibling npm script) asserting `tool.validate(sample)` is true for every registered tool and flagging tools with no sample yet. One-time [GATE] cost: `real.test.mjs` is hashed, so the capture edit triggers a single ~340 s re-prove — which is also the run that seeds the corpus.
