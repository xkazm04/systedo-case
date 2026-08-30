# ADR-0003 — One LLM chokepoint, enforced by a gate

## Status

Accepted (chokepoint since the first AI feature; gate static-only since
2026-08-05)

## Context

Twenty-odd product features call a model. Each one needs the same things: a
provider decision, a structured-output contract, a demo fallback so a clean
checkout still works, per-user metering, a durable per-IP limit, a global daily
spend ceiling, cost accounting and telemetry.

Left to convention, "always use the wrapper" degrades. One feature imports the
Gemini SDK directly because it needs a parameter the wrapper does not expose,
and from that point the metering, the ceiling and the telemetry have a hole in
them that nobody can see.

## Decision

**Exactly one function generates text: `generateStructured()` in
`src/lib/llm/index.ts`.** Providers live behind it (`src/lib/llm/claude.ts`,
`src/lib/llm/gemini.ts`, `src/lib/llm/codex.ts`, the BYOM adapters). It decides
the provider, stamps the result envelope, and falls back to a deterministic demo
result when no provider is configured.

Because a convention that is not enforced is a preference, the rule is a gate.
`scripts/llm-gate.mjs` runs pre-commit and in CI, and fails when:

- a `generateStructured` call site carries no `// llm-tool: <id>` comment;
- a tagged id has no fixture in `test-llm/registry.mjs` (= no test);
- a registry tool has no call site (a fixture for a feature that was deleted);
- provider access appears **outside** the wrapper (`checkChokepoint()` in
  `test-llm/callsites.mjs`);
- a call site has no row in the BYOM matrix, which would let it silently ride
  the global active vendor instead of a paying subscriber's pin;
- a tool's (system prompt + schema) fingerprint drifted from its committed
  golden in `test-llm/golden/`.

Note what is *not* in that list: a real model call. The hash-cached real-model
re-prove was retired on 2026-08-05 — at roughly 25 s per tool per touched shared
file it was too expensive to keep on the commit path. Proving against a real
model is now on demand (`npm run test:llm`), and the offline half of it — the
captured corpus replayed through each tool's validator — runs in CI for free.

## Consequences

- Metering, the spend ceiling, BYOM, LightTrack mirroring and cost accounting
  are single-implementation. Adding one is a change in one file, not twenty.
- Adding an AI feature has a fixed cost: tag the call site, add the fixture,
  accept the golden. `npm run llm:new` scaffolds it.
- Image generation and embeddings are **outside** this chokepoint (Leonardo,
  Gemini vision, the patterns RAG). That is a real exception, not an oversight —
  they are not structured text generation — and it means the chokepoint's
  guarantees do not automatically cover them.
- The goldens are a contract, so changing a prompt is a reviewable diff. What
  the gate could not tell you until ADR-0007's provenance rule was added is
  *why* a golden changed; see `test-llm/golden/CHANGELOG.md`.

## Consequences observed

_Read back 2026-08-30 against the tree, not against intentions._

- **The chokepoint stopped being prose before it was tested.** The fence in
  `eslint.config.mjs` (`adamant/seams`) now refuses a second Gemini client and a
  direct provider-adapter import in the editor, which is the same rule the gate
  enforces in a diff. Nothing about the decision changed; the moment of refusal
  moved earlier, and that is where an agent can still choose the other design
  cheaply.
- **Retiring the real-model re-prove cost a number nobody replaced for three
  weeks.** After 2026-08-05 the gate proved the contract — tag, fixture, golden
  fingerprint — and *no* check said how good the output had to be until the
  baked scorecard acquired a floor, and then a per-operation baseline
  (`test-llm/quality/baseline.json`, 2026-08-30). "The output still matches" and
  "the output is still good" are different claims, and only the first one
  survived the retirement.
- **The named exception is still an exception.** Image generation, vision scoring
  and embeddings remain outside the chokepoint, so metering, the spend ceiling
  and LightTrack mirroring still do not cover them. Two months on, no drift into
  the wrapper and no second implementation of its guarantees — the boundary has
  been stable, not blurred.
