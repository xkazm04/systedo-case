# ADR-0012 — A generated region of the guidance surface is data, not instructions

## Status

Accepted

## Context

Two regions of the files agents on this repository treat as law are not written
by this team:

- `AGENTS.md` opens with a block that `next dev` writes and re-adds, between the
  `nextjs-agent-rules` markers;
- `CLAUDE.md` carries a "Project Context Map" section that the Personas context
  scan regenerates.

Both are pinned in `.github/agent-surface.lock.json`, and `npm run agents:surface`
(blocking, inside `check:ci`) fails when either one changes, so a regenerated
block is read on its own instead of riding along in an unrelated diff. That rung
works and is not the whole problem.

The lock compares content. It cannot read it. A vendor rewrite that adds "skip
the pre-push check while iterating", or a scan that emits a line telling an agent
which checks to leave alone, arrives at the reviewer as exactly the same event as
a typo fix: a lock mismatch, accepted with a one-line reason. And the reviewer is
usually an agent with a wall clock, accepting a diff in a file whose entire
purpose is to be obeyed. Nothing in the loop distinguished "the generator restated
a fact" from "the generator issued an order".

The exposure is not hypothetical in shape even if it is today in fact: this is the
ordinary path by which text from outside a project becomes instructions inside it,
and the repository's own threat model already treats text nobody here wrote as
untrusted (`scripts/actions-pin.mjs` P9, `scripts/injection-drill.mjs`).

## Decision

**A generated region carries data. Guidance is written by this team, in prose no
generator owns.** Concretely:

1. Every line inside a generated region is classified by
   `scripts/lib/generated-instructions.mjs`, which flags an imperative addressed
   to the reader ("Read the guide…", "— read it at task start") and text telling
   the reader to stand down from a rule, a check or earlier guidance.
2. `scripts/agent-surface.mjs` fails when an instruction-shaped line is present in
   a generated region and is **not** in the accepted content of
   `.github/agent-surface.lock.json`. It passes on the tree today, so it is
   blocking rather than ratcheted (ADR-0007).
3. Acceptance takes a second, explicit consent. `npm run agents:surface -- --accept
   "…"` refuses to pin a generated region that has gained an instruction-shaped
   line; it lists each one with the reason it was flagged and requires
   `--accept-instructions` on top of the reason. There is no way to turn the rule
   off, only a way to say "I read this sentence".
4. Where a generated line genuinely is guidance this team wants, the answer is to
   write it in `AGENTS.md` below the markers, in our own words. A generator's
   sentence is never the authority for a rule; at most it is a duplicate of one.

The classifier deliberately over-matches. Deciding that "Read the relevant guide"
is benign is a human's judgement, made once and recorded in the lock file — not a
regex's.

## Consequences

- The acceptance step now shows the reviewer the sentences that would become
  instructions, which is the moment the decision is actually being made.
- Some benign vendor prose needs the extra flag. That is the intended cost: the
  flag is the record that a person read the line.
- The classifier will occasionally miss an instruction phrased as a statement
  ("agents typically disable the SAST rules here"). It narrows the gap; it does
  not close the class. The backstop stays the same as before — the region is
  pinned, and a change to it cannot land silently.
- `test-unit/agent-surface-instructions.test.mjs` holds all of it: the classifier's
  behaviour, the gate's wiring to it, and the tree passing it today.

## Revisit when

- **A generator emits a region this repo cannot classify.** The rule rests on
  `scripts/lib/generated-instructions.mjs` being able to tell an imperative from a
  fact. A vendor block written as narrative prose, or in a second language, would
  make the classifier's answer a guess — and a guess that blocks is worse than an
  honest "unclassifiable, read it yourself".
- **The accepted content in `.github/agent-surface.lock.json` outgrows one
  sitting.** Acceptance is a human reading a sentence. A lock nobody can read end
  to end has turned `--accept-instructions` back into a flag that turns the rule
  off, which is the exact thing this record says does not exist.
- **A second vendor starts writing into the guidance surface.** One generator is a
  boundary; two are a protocol, and the answer then is a declared region format
  rather than markers this repo recognises one tool by.

## Consequences observed

_Not yet due — this record has no successors. It will fall due once three
higher-numbered records have landed (`npm run adr:check`)._
