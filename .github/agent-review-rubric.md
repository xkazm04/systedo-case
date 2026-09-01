# Agent diff review — the rubric

Roughly 97% of the commits in this repository are written by an agent, and one
person triages them weekly. Review bandwidth, not agent capability, is what caps
how much autonomy is safe here. This file is the review that runs *before* that
weekly pass — versioned in the repo, so the judgment applied to a change landed
at 2am is the same judgment applied to one landed at noon.

It has two halves, and the split is deliberate.

- **Part A** is mechanical. `scripts/agent-review.mjs` enforces it on every push
  and pull request. It **blocks**: these are invariants where "a reviewer will
  probably notice" has already been tried and is not good enough.
- **Part B** is judgment. A model applies it to the diff and **comments**;
  nothing here blocks, because a model's opinion about whether a comment earns
  its keep should not be able to stop a merge. It runs only when
  `ANTHROPIC_API_KEY` is configured; without a key the mechanical half still runs.

The rungs follow [ADR-0007](../docs/adr/0007-gate-rung-discipline.md): a check
blocks only if it passes today.

**Part A is a required check.** It is named in
[`.github/required-checks.json`](./required-checks.json) as
`Rubric review of the diff`, so a red Part A stops the change rather than
decorating it — and `npm run merge-gate`, inside `npm run check:ci`, fails if
that job is ever renamed, un-hooked from pull requests, or given a
`continue-on-error`. Part B is deliberately absent from that list: it needs an
API key it may not have, and a model's taste blocking a merge is the failure
mode this split exists to avoid. What Part B can do is put a named, concrete
finding in front of the weekly triage — and the maintainer answering it is a
human decision, not a status check.

---

## Part A — mechanical, blocking

Each rule states what it catches and why it is worth a red build.

### A1 · A component may not grow past 200 lines

*Scope: added or modified files under `src/components/`.* Fails when the file
ends the diff above 200 lines **and larger than it was**. A file already over the
line may shrink or stay put; it may not get worse.

Why blocking: "components under 200 LOC preferred" is a stated convention with a
catalogue of existing debt (`docs/roadmap/component-debt.md`), which is the exact
shape of a rule that erodes. As a ratchet it costs a compliant change nothing and
makes the debt monotonically decrease.

### A2 · No route segment config

*Scope: added lines under `src/app/`.* Fails on
`export const dynamic | runtime | revalidate | fetchCache | dynamicParams`.

Why blocking: this app runs with `cacheComponents: true` and
`partialPrefetching: true` (`next.config.ts`). Under Cache Components the
correct expression of "this read is dynamic" is a `<Suspense>` boundary around
the read, not a segment-level opt-out — a `force-dynamic` silently un-caches a
whole route and the symptom is a latency regression nobody attributes to the
commit that caused it. There are zero such exports in the tree today.

### A3 · Deleting a test needs a sentence

*Scope: deleted files under `test-unit/`, `test-llm/`, `tests/`.* Fails unless the
change carries an `Ack:` line (in a commit message in the range, or in the PR
body) saying what the deletion is.

Why blocking: a deleted test is indistinguishable in a green build from a test
that never existed. This is the single cheapest way for an autonomous agent to
make a suite go green.

### A4 · Adding a runtime dependency needs a sentence

*Scope: new keys in `dependencies` in `package.json`.* Fails unless the change
carries an `Ack:` line.

Why blocking: [ADR-0008](../docs/adr/0008-zero-dependency-tooling.md) makes the
small dependency list a decision rather than an accident, and this repo holds
live ad-platform credentials, so a new package is a supply-chain event. Eleven
runtime dependencies is a number worth defending one sentence at a time.

### A5 · A commit subject describes the change, not the session

*Scope: every non-merge commit in the reviewed range.* Fails on a subject that is
not a conventional-commit header, that runs to a second sentence, or that
narrates the run rather than the change. Rules and their wording:
[`scripts/commit-subject.mjs`](../scripts/commit-subject.mjs); audit existing
history with `npm run commit:check -- --range <range>`. `Merge`, `Revert "…"` and
`fixup!`/`squash!` subjects are exempt — git writes those.

Why blocking: the log is the artifact a future agent bisects, and ~97% of these
subjects were written by an agent finishing a run. The conventional *shape* is
already at 100%, so a shape-only rule would never fire; what has actually landed
is `fix: Done. Here's what I found and changed` and `fix: Agent session exceeded
20 min and was stopped`. Both are well-formed. Neither lets anyone decide, six
months later, whether that commit is the one that broke something — and the
second is not a change at all, it is a loop event that got committed because the
loop commits on exit.

Why here and not in a `commit-msg` hook: a hook binds one checkout, and commits
reach this repository from several (agents, worktrees, CI). Part A is the one
place that sees every subject on the way in, and on this repo's landing path
(`.husky/pre-push` → `check:ci` → `review:agent:gate`) it refuses the push while
`git commit --amend` is still free. There is no `Ack:` escape hatch: unlike A3
and A4, nothing about a change makes a bad subject the right call.

### A6 · A pin may be tightened silently, never loosened

*Scope: `ceiling.max` and `floor.min` in
[`.github/contract-ledger.json`](contract-ledger.json), compared against the base
revision.* Fails when a ceiling rose, a floor fell, or a pin disappeared —
**unless the same diff moves that pin's `accepted.on` and rewrites its `reason`.**
A ceiling that falls, a floor that rises and an unchanged pin are all free and
need no sentence: the asymmetry is the rule.

Why blocking: every fence here is a file the agents it constrains can edit, and
this is the file holding the numbers those fences are measured against.
`contract:ledger:check` compares the *tree* against each pin on every build and
therefore cannot see a pin move, because once it has moved the tree agrees with
it again. So the cheapest green in this repository was never editing a gate — it
was editing the number the gate is measured against, in a diff whose entire
visible change is one digit. B3 asks about that in a comment, on a run that has a
model key; this is its mechanical half, and it is mechanical because "did this
number move, and in which direction?" is not a judgement.

Why re-dating rather than an `Ack:`: a `reason` reads identically on the day it
was argued and three years later, which is exactly the failure `accepted.on`
exists to prevent. Requiring the date and the argument to move together means the
diff a reviewer reads contains the number *and* the sentence that pays for it —
the same two-line shape every other pin in this repository moves by.

What this rule cannot do is require a human. Master ships by push, so a required
status check and a CODEOWNERS review bite only on the paths that go through a
pull request. A6 makes a loosening a named, blocking finding on every push and
leaves a dated record next to the number; deciding it was the right call stays
the maintainer's.

---

## Part B — judgment, commented

These are the things the maintainer actually looks for, written down so a model
can look for them first. A reviewer — human or model — should raise a finding
only when it can name the concrete failure: which input, which state, which wrong
output. "Consider extracting this" is not a finding.

### B1 · Does the change do what its message says, and only that?

Scope creep is the most common defect in agent work: the fix is correct and
arrives with four unrelated refactors that nobody asked for and nobody will
review. Call out anything in the diff that the commit message does not explain.

### B2 · Is the seam right?

Read the [ADR](../docs/adr/README.md) for the seam being touched before judging
the change. Specifically:

- **Store work** — a new persisted domain needs both backends
  ([ADR-0001](../docs/adr/0001-dual-store-seam.md)). A Firestore-only store
  silently removes a module from offline dev and from the key-free E2E lane. A
  new sqlite table needs an append-only migration, not just a `SCHEMA` entry.
- **Tenancy** — a handler that takes an id off the wire must prove ownership
  before it composes a tenant key
  ([ADR-0002](../docs/adr/0002-tenant-key-embeds-user-id.md)). The failure is
  quiet: an unverified id mints an empty tenant that reads as "no data yet".
- **Model calls** — everything goes through `generateStructured`
  ([ADR-0003](../docs/adr/0003-single-llm-chokepoint.md)). A provider import
  outside the wrapper is a hole in metering, the spend ceiling and telemetry.
- **Deploy modes** — a new guard has to decide whether it is cloud, self-hosted
  or dev ([ADR-0004](../docs/adr/0004-self-hosted-third-deploy-mode.md)). Never
  widen a `NODE_ENV !== "production"` check to unlock a feature; that family also
  guards `DEV_AUTH`.

### B3 · Is a gate being softened rather than satisfied?

Raising a ratchet baseline, adding an entry to
`.github/security/sast-allowlist.json`, widening an eslint disable, marking a
test `.skip`, accepting a golden — each is legitimate sometimes and is exactly
what an agent under time pressure reaches for. Every one of these in a diff
should be named in the review, with the question: was the finding fixed, or
absorbed?

### B4 · Does new user-facing text go through a `T` dict?

Both locale columns, not one
([ADR-0006](../docs/adr/0006-colocated-i18n-dictionaries.md)). Typecheck catches
a missing key; it cannot catch a Czech string hardcoded in JSX, or an English
sentence pasted into the `cs` column.

### B5 · Is the honesty of a number preserved?

This product tells advertisers what their money did. Watch for: a projection
presented as a measurement, a demo/sample value that can reach a real surface, a
metric whose denominator changed without its label changing, and an AI output
rendered without its provenance.

### B6 · What would break at 3am?

The failure modes that matter here are the quiet ones — a fail-open default, a
swallowed write error reported as success, a cron that silently never runs, a
retry that doubles a spend. If the diff adds one, say so and say what the
operator would see.

---

## What a review looks like

Findings, most severe first. For each: the file and line, one sentence of what
breaks, and the concrete case that breaks it. If nothing is wrong, say so in one
line — a review that always finds something teaches people to skip reviews.

---

## Where the review leaves its trail

A verdict that exists only as a pass or fail inside one CI chain cannot be read
after the fact and cannot be answered in place, which is how an automated
reviewer stops being trusted. So a review is written down four ways:

| Where | What is there | Who reads it |
| --- | --- | --- |
| **Check annotations** | Every Part A finding, anchored to its file and line (`scripts/agent-review.mjs --annotate`) | Whoever opens the change — they render inline on the diff and on a PR's Files view |
| **A pull request comment** | Part B's review; **or Part A's report when no `ANTHROPIC_API_KEY` is configured**, so a PR is never left with a bare tick | The contributor, in the place a finding can be replied to |
| **An artifact, 90 days** | `mechanical.md` and `mechanical.json` — the same verdict in prose and in a countable form | The weekly triage, asking what the review said about a change that shipped a fortnight ago |
| **A weekly aggregate** | Which Part A rules fired, how often, and on what — [`agent-review-history.yml`](./workflows/agent-review-history.yml), or `npm run review:agent:history` | Whoever is deciding whether a rule below still earns its place |

That last one is the feedback loop for this file. **A Part A rule that has never
fired and one that fires constantly are both questions for the rubric**, not just
for the change in front of you: the first is dead weight in a blocking gate, the
second is either a real recurring problem or a line drawn in the wrong place.
Neither is visible from inside a single red build, which is why the aggregate
exists. When you change a rule here, say in the commit which of the two it was.

Annotations are also what makes the aggregate possible — they are the only part
of a run that stays addressable through the API once the logs have scrolled away.
Part A is emitted with `--annotate` in CI and without it locally, so
`npm run review:agent` and the pre-push gate stay readable.
