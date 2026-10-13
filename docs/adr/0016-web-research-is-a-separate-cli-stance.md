# ADR-0016 — In-app web research is a separate CLI stance, never a flag on the generation transport

## Status

Accepted (2026-10-13, by the owner). Follows from ADR-0015. Designed against the ai-registry at
revision `b6b67b76`, consulted 2026-10-13:

- software-engineering / agent-cli-transport: *permission-stance-enforcement*,
  *dated-capability-matrix*;
- software-engineering / mcp-tools: *untrusted-result-handling*,
  *egress-argument-gating*;
- grant-funding / funder-research: *discovery-with-omit-if-unsure*,
  *provenance-and-confidence-per-row*, *adversarial-verification-pass*;
- marketing / zero-budget-channel-planning: *grounding-precedence-catalog-over-scan*.

## Context

No in-app LLM path can look anything up. `channel-research`
(`src/lib/ai/tools/channel-research.ts`) reasons from what the model already
knows. The only live research is the operator-run `/outreach` skill, which runs
outside the app. The music project (ADR-0017) needs live research inside the
onboarding flow: where an independent track can be distributed and made
visible, and which metadata each place requires.

The Claude CLI transport is deliberately a no-tools stance
(`src/lib/llm/claude.ts`, `cliArgs`):

- `--tools ""` and `--strict-mcp-config` remove every tool and MCP server;
- `--setting-sources user` keeps the repo's agent instructions out;
- there is no permission bypass.

The comment there says why: the prompt carries user-influenced text, so "an
injected 'now run this' must have nothing to run". Adding a web flag to that
function would make "which stance am I in?" a runtime question. The registry
names this exact failure: a mode folded into one function behind a flag becomes
"a bug that type-checks".

## Decision

**1. Each stance is a separate factory.** `generate` (today's transport) is left
exactly as it is. `research` is a second factory in `src/lib/llm/`, and it is the
only one with network tools. Callers choose a stance by importing it. There is no
parameter that switches stance.

**2. The `research` stance is enforced in three layers, all of them worn
together.**

- **Allowlist:** `WebSearch` and `WebFetch` only.
- **Denylist, where deny wins:** shell, file read and write, edit, glob, grep and
  every MCP server. The factory **throws** if a caller asks for a denied tool,
  because asking for one is a caller bug, not a preference.
- **Neutral working directory:** a fresh empty temp directory, plus
  `--setting-sources user`, so no project instructions or skills load.

The existing environment scrub (`cliEnv`) applies unchanged. Asking the model
nicely in the prompt is not one of the three layers.

**3. Research runs are bounded by the app, not by the CLI.** A turn cap, plus a
wall-clock deadline that the app enforces through the existing kill path. A
research run is a background job with visible progress. It is started by the
operator and never by a cron. It still goes through `generateStructured()` with
an `// llm-tool:` tag, a golden and an `llm:budget` record (ADR-0003).

**4. Whether research is available is probed, not assumed.** Web tools depend on
the CLI version, the account and the region. A probe through the same spawn path
says whether research can run on this machine today, and the result is kept as
dated capability data. If research is unavailable, the feature says so and falls
back to the catalog (point 6).

**5. Everything fetched is treated as attacker text.**

- **Nothing to act on:** the research run has no write tools, so an injected
  instruction has nothing to execute.
- **Rows, not prose:** output is schema-bound rows. Prose is never passed to
  another operation.
- **Quarantine downstream:** a quoted page snippet goes through
  `src/lib/ai/untrusted.ts` before any later prompt sees it.
- **Tests:** new rows for fetched pages are added to the adversarial corpus that
  `test-unit/prompt-injection.test.mjs` and its siblings run.

**6. Discovery omits rather than invents, and is checked against the world.**

- **The prompt:** only places it is confident exist; anything uncertain is left
  out; an empty section is a valid answer.
- **Every row carries:** source URL, retrieval time, a confidence and the reason
  for that confidence.
- **A refutation pass:** a second, independent pass tries to refute each row. Its
  cheapest step is a server-side reachability check through the SSRF-guarded
  `src/lib/onboarding/site-fetch.ts`.
- **Fail closed:** a row that fails the pass is left out of the plan, not shown
  as "unverified".

**7. The catalog comes first, and research extends it.** A curated channel
catalog (data: family, cost tier, metadata requirements, connector mode) is the
baseline. It works with no CLI. Research proposes additions and corrections,
the operator accepts them, and accepted rows are cached per project.

## Consequences

- The no-tools guarantee of the generation transport survives intact, and a test
  pins its argv as it does today. The new stance gets its own argv test, plus one
  that asserts the factory throws on a write tool.
- Research is slow and runs on the operator's seat. The UI treats it as a job with
  a result, not a spinner.
- The catalog becomes the asset that matters. It is versioned data, reviewed like
  code, and it is what a hosted or CLI-less install runs on.
- The stance pattern now exists, so the next stance (for example browser control)
  is a third factory with its own record. It is not an extension of this one.

## Revisit when

- **The probe shows web tools unavailable on most operators' machines.** The
  stance then serves almost nobody, and the catalog-plus-operator-research path
  is the real product.
- **The refutation pass rejects a large share of rows over several runs.** The
  discovery prompt or the model is inventing. Fix that before adding sources.
- **A second operation wants the `research` stance for a different purpose.**
  Check whether its egress needs are the same before reusing the factory. Read
  and search may be identical, but what the output is allowed to reach may not
  be.
