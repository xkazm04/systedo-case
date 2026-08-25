<!--
One logical change per PR. If the description needs an "and also", it's two PRs.
Behaviour changes, new dependencies, LLM-layer / store-seam / billing work:
open an issue first — see CONTRIBUTING.md.
-->

## What and why

<!-- The what is in the diff; explain the why here. Link the issue if there is one. -->

## Checklist

- [ ] **Gate is green locally**: `npm run check:ci` passes
      (typecheck + lint + build + seed:check + test:unit + llm:gate:check —
      the same command CI runs; a red gate is a blocked merge, not a review comment).
- [ ] **One focused change** — no reformatting passes bundled with logic,
      no drive-by refactors outside the context I'm changing (`context-map.json`).
- [ ] **Tests included** where they are mandatory: any change touching auth,
      billing/metering (`usage.consume`, plans), tenancy, rate limits
      (`src/lib/ai/durable-limit.ts`), or the LLM chokepoint
      (`generateStructured` / `src/lib/llm/`).
- [ ] **LLM call sites are tagged**: any new `generateStructured` call carries a
      `// llm-tool: <id>` comment with a registered test in the gate registry
      (`npm run llm:new` scaffolds one; `npm run llm:gate` must pass — it also
      runs pre-commit). Every generator keeps its deterministic `demo` fallback;
      no provider becomes mandatory.
- [ ] **i18n parity** where copy changes: `cs` and `en` both updated in the
      component's `T` table (typecheck enforces the keys; you supply real values
      for both).
- [ ] **Docs synced in this PR** — README / `docs/` updated where this change
      makes them stale.
- [ ] **AI assistance disclosed**: if this PR is substantially agent-generated,
      I say so below — and either way I ran the gate myself and can explain
      every line.
- [ ] **CLA**: I have read [`CLA.md`](../CLA.md) and submit this contribution
      under its terms.

## AI assistance

<!-- "None", "editor autocomplete", or a sentence on what the agent did and what
     you verified. Disclosure is welcome, not penalized; undisclosed bulk agent
     PRs are closed without review. -->
