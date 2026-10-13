# ADR-0015 — Adamant is local-first OSS, and the Claude Code CLI is its default LLM engine

## Status

Accepted (2026-10-13, by the owner). The owner made this decision. This record states it and
what it changes. It builds on ADR-0003 (the chokepoint) and ADR-0004
(`SELF_HOSTED`), and supersedes neither. It reverses the assumption in
`AGENTS.md` architecture line 5 that production means Gemini.

## Context

The architecture was cloud-first: production is Vercel plus Firestore, with
Gemini Flash behind `generateStructured()`. The CLI path, which uses the
operator's Claude subscription, was the developer convenience. ADR-0004 added
`SELF_HOSTED` as a third deploy mode, and for that mode
`src/lib/llm/provider-order.ts` already prefers the keyless CLI ladder
(`claude → codex → gemini`). Self-hosting was therefore implemented, but it was
treated as the secondary path.

The owner has now set the product's centre of gravity:

- Adamant is an **open-source app run on the operator's own machine**;
- that machine has signed-in LLM CLIs;
- features are designed for that setup first.

Some features only make sense there. In-app web research (ADR-0016) is the first
one: on a CLI it costs nothing per token, and it uses tools a hosted completion
endpoint does not have.

## Decision

**1. Local-first is the design target.** A feature is specified for
`SELF_HOSTED` (or dev) with the sqlite store, and the hosted cloud is the port.
This changes the default question in review. It used to be "does this work on
Vercel?"; it is now "does this work on a laptop with a CLI and no keys?".

**2. The Claude Code CLI is the default engine.** In every mode except `cloud`,
the provider order stays `claude → codex → gemini`. It still goes through the
one chokepoint (ADR-0003), and the gate does not change. Gemini remains the
`cloud` provider and the hosted fallback.

**3. Capabilities are declared per engine, and a feature declares what it
needs.** Some features need a capability that only the CLI has: web tools, long
agentic runs, or subscription billing. Such a feature names the capability.
The UI then shows it, degrades it or hides it, based on a probe that runs through
the same spawn path the real call uses (`src/lib/llm/claude.ts`, `claudeAvailable`).
It never fakes the capability on another provider. The answer of what each CLI
version supports is data with a verification date, not a constant in code
(registry: agent-cli-transport, *dated-capability-matrix*).

**4. Metering is kept, and its meaning changes.** On the CLI, a call bills the
operator's own seat. ADR-0004 already unmeters `SELF_HOSTED`. `usage.consume()`
and the LLM telemetry still count calls, so the operator can see what the app is
doing for them. Counting is a feature, not a cost-control rail.

## Consequences

- `AGENTS.md` architecture line 5 is corrected to say "local-first: Claude Code
  CLI by default, Gemini in hosted cloud" in the change that accepts this record.
  The guidance surface is a CODEOWNERS law file, so the owner makes that edit.
- The CLI path is now the one most features run on, so its operating limits become
  product properties:
  - it is slow (seconds to minutes);
  - it is serial per seat;
  - its availability depends on a login on the machine.

  Long operations run as background jobs with visible progress, never inside a
  request that a page waits on.
- The no-tools stance of the existing transport (`src/lib/llm/claude.ts`) is
  **not** changed. Anything that needs tools gets its own stance (ADR-0016).
- Hosted `cloud` keeps working, but it is no longer the design centre. A feature
  that needs a CLI-only capability shows as unavailable on hosted deploys rather
  than as broken.
- `docs/open-source/self-hosting.md` stops being an appendix and becomes the
  primary run guide. The README's first instructions follow it.

## Revisit when

- **A hosted tenant base appears that cannot run a CLI**, such as paying cloud
  customers or agencies without a workstation. At that point the cloud is a
  product again, and CLI-only features need a hosted equivalent or an explicit
  "local only" label in pricing.
- **The CLI's terms or billing change so that subscription use by an app is no
  longer permitted or no longer flat-rate.** The economic case in Context then no
  longer holds.
- **More than a few features declare a CLI-only capability.** The hosted mode is
  then a different product, and that deserves its own decision.
