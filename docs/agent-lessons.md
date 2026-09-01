# What agents have got wrong here

This repository catches mistakes well. The rubric review runs on every push and
publishes which rules fire ([`agent-review-history.yml`](../.github/workflows/agent-review-history.yml)),
fifteen gates refuse a change for a stated reason, and
[`.github/constraint-map.json`](../.github/constraint-map.json) says which of those
rules would actually stop you.

**What none of that does is remember.** A finding is a red build, the red build is
fixed, and the next lane arrives with the same prior and makes the same call
again. The visible symptom is guidance that grows by *accretion*: every trap
eventually becomes another paragraph in [`AGENTS.md`](../AGENTS.md), written from
the last incident rather than from the count.

So this page is the ledger, keyed by the **mistake** rather than by the rule. The
data is [`.github/agent-lessons.json`](../.github/agent-lessons.json); this is its
readable half.

## How to use it

- **Starting a run** — read the rows whose `standing` is `partial` or `unfenced`.
  Those are the ones where nothing will tell you that you got it wrong, or where
  the fence is absent on exactly the path you are on (usually: a throwaway
  worktree, or a lane that commits for itself).
- **A gate went red and you do not know why** — check here before you change the
  gate. Two of the rows below are traps *caused by* a fence firing correctly.
- **You just got something wrong** — add the row. One incident with a citation is
  enough; the second incident is what makes the row load-bearing.

## What earns a row

Something that actually happened, at least once, with a citation a reader can
open: a commit subject in the log, a paragraph in `AGENTS.md` written from the
incident, an entry in [`docs/harness/harness-learnings.md`](harness/harness-learnings.md),
an ADR that exists because of it. Not a hazard somebody imagined — those belong in
the rule, not in the record of what the rule cost to learn.

**And when a rubric rule fires constantly**, the decision to keep it, redraw it or
fence it differently is recorded here, as a row with the count in its `evidence` —
not in a comment on the pull request that is about to be merged and forgotten. The
review already produces the evidence; until this file, nothing turned it into a
decision anybody could read afterwards.

`standing` is the column that matters:

| standing | what it means |
|---|---|
| `fenced` | Something now refuses this on the machine that does it. Read the row for the shape of the correct call; the fence will tell you when you are wrong. |
| `partial` | A fence exists **and** a known path around it does too. `gapNote` says which — and the failure is invisible exactly where the fence is absent. |
| `unfenced` | Nothing runs. Knowing is the only defence; `wouldNotice` says what sees it afterwards, and sometimes the honest answer is nobody. |

## The ledger

| Lesson | Standing | In one line |
|---|---|---|
| `commit-subject-narrates-the-run` | partial | The report's first line becomes the commit subject; write that line **as** a subject. |
| `interrupted-run-commits-instead-of-checkpointing` | partial | A stopped run owes the next run a checkpoint, not a commit that says it was stopped. |
| `server-only-module-in-a-client-component` | partial | `tsc` and the unit suite both pass; only `next build` fails. Run it for any client-component change. |
| `pathspec-sweep-takes-another-agents-work` | unfenced | `git add -A` in a shared checkout commits somebody else's half-finished work under your subject. |
| `gate-softened-instead-of-finding-fixed` | fenced | The one-line softening outlives its reason. Fix the finding, or bring the operator the reason. |
| `editing-a-generated-region` | fenced | Deleting the vendor block only re-creates it. Accept a generated change deliberately, on its own. |
| `writing-the-chokepoint-call-in-prose` | fenced | The gate matches text: naming the wrapper with a parenthesis in a comment reads as an untagged call site. |
| `assuming-a-documented-list-is-current` | unfenced | Read the list in the source, not in the prose about the source. It has usually grown. |
| `a-test-that-enshrines-the-bug` | partial | When a test blocks a fix, read what it asserts. Making the code match it restores the bug. |

Each row's full statement — the trap, the correct call, the evidence, what now
catches it and what still does not — is in
[`.github/agent-lessons.json`](../.github/agent-lessons.json). The table above is
deliberately a summary: the JSON is the source, and a one-line paraphrase is not a
substitute for reading the row before you make the same call.

## What holds this honest

[`test-unit/agent-lessons.test.mjs`](../test-unit/agent-lessons.test.mjs) —
blocking, inside `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`. It
fails when a row carries no evidence or no correct call, when a `constraintId`
names a rule [`.github/constraint-map.json`](../.github/constraint-map.json) does
not have, when a path a row cites has moved, and when this page stops naming one of
the rows — a lesson the readable ledger has quietly dropped is one no lane will
ever read.

The page also carries an age budget in
[`.github/docs-staleness.json`](../.github/docs-staleness.json), watched against the
guidance surface it describes: when `AGENTS.md`, the rubric or the constraint map
moves, this ledger is flagged for re-reading instead of aging in silence.

**This is not a second constraint map.**
[`.github/constraint-map.json`](../.github/constraint-map.json) is keyed by the rule
and answers *will anything stop me?*;
[`.github/contract-ledger.json`](../.github/contract-ledger.json) is keyed by the
enforcement and answers *what is this fence letting through?*. This one answers the
question you have before either: *what has already gone wrong here, and what should
I do instead?*
