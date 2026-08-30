# `.agent/` — what a stopped run leaves behind

Almost every commit in this repository is written by an agent working alone under
a wall clock it does not control. When the clock wins, the run is killed
mid-task. The history records what that used to cost: four of fifteen sampled
commits once read `fix: Agent session exceeded 20 min and was stopped` — a
session event standing in for a change, and nothing at all for the next run to
pick up.

`scripts/commit-subject.mjs` (rubric A5) now refuses those subjects, and it is
right to: **a run that produced no change does not owe the log a commit.** This
directory is the other half of that rule. A stopped run owes the next one a
*checkpoint*.

## The file

`.agent/checkpoints/<session>.json`, one per session, written by
`scripts/agent-checkpoint.mjs` and tracked in git so it travels out of a
worktree. It holds the task, the next step, what is done, what is blocking, which
gates were last green, and which files were touched — bounded, because it is read
into the next session's context and has to stay cheaper than re-deriving what it
says.

The load-bearing field is the one that is usually **absent**: `endedAt` is
stamped when a session ends cleanly, so a checkpoint without it belongs, by
construction, to a run that was *stopped*. That is the entry a briefing leads
with.

Cleanly-ended checkpoints are pruned after three days. Unended ones are never
pruned — they are the whole point.

## Using it

```bash
npm run checkpoint                      # read the open checkpoints (do this first)
npm run checkpoint -- --start "fold the Sklik envelope into the control plane" \
                      --next  "port campaigns-envelope.test.mjs to the union store" \
                      --budget 20
npm run checkpoint -- --done "read the store seam" --gate "typecheck, lint"
npm run checkpoint -- --next "wire the ratchet into check:ci"   # before a risky step
npm run checkpoint -- --close           # the task is finished; the commit is the record now
npm run checkpoint:check                # blocking, inside check:ci
```

Update `--next` *before* the step you might not survive, not after. The point of
a checkpoint is that it is already written when the process dies.

## Wiring the involuntary layers

One layer already runs without anyone choosing to: `npm run checkpoint:check` is
inside `check:ci`, so a checkpoint that stopped being readable — a hand-edit, a
half-written file — fails the gate instead of quietly handing the next run
nothing. `test-unit/agent-checkpoint.test.mjs` is in the same chain and fails if
the command or its instruction is removed.

Two more layers are written and not yet wired, because both of their config files
are edited by hand on purpose. Each is a one-time paste.

**Every commit** — append to `.husky/pre-commit`. It folds what a commit landed
into the open checkpoint, is a no-op when none is open, and can never fail a
commit:

```sh
node scripts/agent-checkpoint.mjs --commit || true
```

**Every edit** — the layer that survives a kill no matter what the agent did or
did not do. Three hooks in `.claude/settings.json`:

```json
"hooks": {
  "SessionStart": [
    { "hooks": [{ "type": "command", "command": "node scripts/agent-checkpoint.mjs --show", "timeout": 15 }] }
  ],
  "PostToolUse": [
    {
      "matcher": "Edit|Write|MultiEdit|NotebookEdit",
      "hooks": [{ "type": "command", "command": "node scripts/agent-checkpoint.mjs --touch", "timeout": 15 }]
    }
  ],
  "SessionEnd": [
    { "hooks": [{ "type": "command", "command": "node scripts/agent-checkpoint.mjs --stamp", "timeout": 15 }] }
  ]
}
```

`--show` prints nothing when there is no news, `--touch` and `--stamp` print
nothing at all, and every one of them fails open — they run inside the session
they must never be able to stop. `test-unit/agent-checkpoint.test.mjs` notices
when the wiring is present and asserts it stays coherent.

## Is twenty minutes the right budget?

`--budget` exists so the question stays answerable rather than argued: the
briefing prints how long a run actually took against the budget it declared. A
task that repeatedly overruns is a task that arrived larger than one session, and
the fix is to split it — not to keep restarting it cold.
