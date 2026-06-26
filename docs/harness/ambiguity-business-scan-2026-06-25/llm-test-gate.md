# LLM Wrapper Test Gate — Ambiguity + Business scan
> Context: the pre-commit gate that proves every LLM call site is tagged + test-registered and confined to the wrapper, then re-runs the real Claude suite only when LLM code changed (content-hash cached).
> Files analyzed: 8
> Total findings: 5

## 1. The change-detection hash list is hand-maintained and has already drifted — `social.ts` is omitted
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: scripts/llm-gate.mjs:29-54 (vs registry.mjs:132-158, real.test.mjs:17, src/lib/ai/tools/social.ts:142, .llm-gate-cache.json:10)
- **Problem/Opportunity**: `HASHED_FILES` is a hardcoded list of 13 tool source files, but the registry/cache prove **14** tools. The `social` tool has a real call site (`src/lib/ai/tools/social.ts:142` → `// llm-tool: social`) and is listed as proven in `.llm-gate-cache.json:10`, yet `src/lib/ai/tools/social.ts` is **not** in `HASHED_FILES`. So editing social's prompt/schema/normalize will NOT change the gate's hash and will NOT trigger a re-prove — the cache stays "green" on stale code. The coverage check (which IS dynamic) can't catch this because it only checks tag↔registry sync, not membership of the hash set.
- **Why it matters**: The gate's entire promise is "re-run when the LLM code changes." A hand-curated parallel list silently breaks that promise the moment someone adds a tool and forgets one line — exactly what happened for `social`.
- **Fix sketch**: Derive the tool portion of `HASHED_FILES` from the discovered call sites instead of hardcoding: in llm-gate.mjs, use `findCallSites().callSites.map(c => c.file)` (already imported from callsites.mjs) unioned with the fixed wrapper/route/test files, so the set can never drift. Editing scripts/llm-gate.mjs is itself **not** gate-triggering (it is not in `HASHED_FILES`) — but the fix will add `social.ts` to the hash and force exactly one corrective real re-prove, which is the desired behavior.

## 2. The gate's real run only proves the Claude (dev) provider — the production Gemini path is never exercised
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: test-llm/real.test.mjs:32 (asserts `res.meta.model === CLAUDE_MODEL`), test-llm/setup.mjs:6 (forces `NODE_ENV=development`), scripts/llm-gate.mjs:31 (`gemini.ts` is hashed)
- **Problem/Opportunity**: `setup.mjs` defaults the env to `development` → Claude, and `real.test.mjs:32` hard-asserts the Claude model. `src/lib/llm/gemini.ts` is in `HASHED_FILES`, so a Gemini change forces a re-prove — but that re-prove runs against **Claude**, passes, and caches green. A real break in the production (Gemini) provider can ship with a freshly-minted "proven" cache.
- **Why it matters**: The differentiation story is "a provable AI-quality gate." Proving only the dev provider while the prod provider rides on the same green badge is exactly the kind of false confidence the gate exists to prevent.
- **Fix sketch**: Add an opt-in second pass (env-gated, e.g. `LLM_GATE_PROD=1` requiring a Gemini key) that re-runs the registry suite with the prod provider selected and asserts the prod model in `meta.model`; keep it out of the default pre-commit path so commits stay key-free and fast. At minimum, document in real.test.mjs that the gate proves the Claude path only. **Gate-triggering / self-modifying**: real.test.mjs and setup.mjs are both in `HASHED_FILES`, so any edit here will trigger a real Claude run on commit.

## 3. The "single chokepoint" is enforced by two hardcoded regexes — most leak vectors are invisible
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: M
- **File**: test-llm/callsites.mjs:56-69 (specifically lines 61-66)
- **Problem/Opportunity**: `checkChokepoint()` only flags `new GoogleGenAI` outside gemini.ts and `from "node:child_process"` outside claude.ts. It misses: a bare `"child_process"` import (no `node:` prefix), dynamic `await import(...)`/`require(...)`, a raw `fetch()` to an LLM endpoint, or any new SDK (`@anthropic-ai/sdk`, `openai`, etc.). It is also plain text-matching, so a mention inside a comment or string literal produces a false positive. "Provider access is confined to the wrapper" is asserted, but only against today's two known providers.
- **Why it matters**: The "single chokepoint" is both the security boundary and a headline selling point of the gate. Its enforcement quietly degrades to "nothing" the day a third provider or a non-standard import style is introduced.
- **Fix sketch**: In callsites.mjs broaden the patterns — match `child_process` with optional `node:` prefix, catch dynamic `import(`/`require(` of those modules, and add a small allowlist of known provider SDK package names checked against import lines outside the provider files. Optionally restrict matching to non-comment lines. Editing callsites.mjs is **not** gate-triggering (not in `HASHED_FILES`), so this hardening is safe to land without a real Claude run.

## 4. The proof is invisible — turn the cache + registry into a portfolio-grade "AI quality" artifact
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: .llm-gate-cache.json:2-21 (`provenAt` + `tools[]`), test-llm/registry.mjs:19-469 (human labels), README.md:186 (internal-only prose)
- **Problem/Opportunity**: All the ingredients of a compelling differentiation artifact already exist — `provenAt`, the proven `tools[]`, and the Czech `label` per tool in the registry — but nothing surfaces them. The only externalization is internal README prose. For a case-study app whose pitch is "a provable AI-quality gate," there is no badge, no generated report, no public `/kvalita` page tying the claim to a verifiable timestamp.
- **Why it matters**: A quality gate that no visitor can see is a cost, not a selling point. Surfacing it converts existing data into a concrete differentiation asset for the case study.
- **Fix sketch**: Add a tiny non-gate script (e.g. `scripts/llm-report.mjs`) that reads `.llm-gate-cache.json` + `registry.mjs` and emits a cs-CZ markdown/JSON summary ("14 AI funkcí, ověřeno proti reálnému Claude dne …"), optionally rendered as a static page. It reads only non-hashed inputs, so it is **not** gate-triggering.

## 5. Coverage is verified by cardinality + a magic ±2-line window, not a real call-site↔tag pairing
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: scripts/llm-gate.mjs:67 (`Math.abs(t.line - c.line) <= 2`) and :75 (`callSites.length !== tags.length`); coverage.test.mjs:15-19
- **Problem/Opportunity**: Coverage "every call site is tagged" is checked by comparing counts (`callSites.length === tags.length`), not by a bijection. Two call sites where one accidentally carries two nearby `// llm-tool:` tags and the other carries none still satisfy `2 === 2` and pass, while a genuinely untagged site slips through. The display match uses an undocumented `<= 2` line window (llm-gate.mjs:67); a tag placed 3 lines from a multi-line `generateStructured(` expression is shown "UNTAGGED" even though it is tagged.
- **Why it matters**: This is a hash-collision-style false negative in the gate's most fundamental promise, and the `2` is an unexplained constant that quietly defines "near enough."
- **Fix sketch**: Replace count-equality with a per-call-site check that each call site has exactly one tag within the window and each tag maps to one call site (flag duplicates/orphans explicitly). Name the window as a documented constant (e.g. `const TAG_PROXIMITY_LINES = 2;` with a one-line rationale). Both llm-gate.mjs and coverage.test.mjs are outside `HASHED_FILES`, so this is **not** gate-triggering.
