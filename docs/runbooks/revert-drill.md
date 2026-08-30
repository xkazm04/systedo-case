# Revert drill — how long until a bad agent change is out again

Everything else in this repository verifies a change on the way **in**: the
goldens, the quality bake, the budget gate, the rubric review, the checkpoint
check. Nothing rehearses the way **back out**. This is the runbook for that
rehearsal, and the number it exists to produce is one line: *from the moment a
bad change is live, how long until it is not.*

It matters here more than it would elsewhere for a topology reason stated in
[`../deploy.md`](../deploy.md) § Delivery contract: **Vercel ships `master` on
push**, so the push is the release act, and ~97% of the pushes are agent-written
— some of them by runs that were stopped by a wall clock mid-task. The way in is
well defended. The way back is unmeasured.

> **Status: never run.** The Results table at the bottom has no rows. Until it
> has one, every claim below about *how fast* recovery is remains a design, not a
> measurement — which is exactly the gap this file exists to close, and it closes
> only when somebody runs it.

## Safety rails, read these first

- **Never push the seeded fault.** Pushing `master` deploys it. Every step below
  happens in a scratch worktree with no push, and the seed is discarded, not
  committed.
- **The promote leg is the operator's.** Flipping the production alias is a
  production action under the operator's name (AGENTS.md § Red). An agent runs
  the detection and git-revert legs and stops at the promote.
- **Do not fix a gate to make the drill pass.** A layer that fails to catch the
  seed is the drill's *finding*. Write it down; do not widen the seed until
  something catches it.

## What is supposed to catch a bad change, and what each layer cannot see

Ordered by when it fires. The right-hand column is the honest limit, and it is
where the drill will spend its time.

| # | Layer | Fires | Cannot see |
| --- | --- | --- | --- |
| 1 | `.husky/pre-push` → `npm run check:ci` | before the release exists | anything that type-checks, lints, builds and keeps the suite green while being wrong |
| 2 | `ci.yml` (`check`, `e2e-smoke`) | after the push, racing the Vercel build | same blind spot; and its verdict arrives after the deploy has begun |
| 3 | `agent-review.yml` mechanical annotations on the commit | after the push | Part A is five structural rules — it judges shape, never behaviour |
| 4 | `src/instrumentation.ts` → Sentry `onRequestError` | at runtime, on a thrown error | **inert in production today**: it initialises only when `SENTRY_DSN` is set, and per `../deploy.md` § Production env gap the Vercel project holds one variable. Also errors-only — a wrong number renders fine |
| 5 | Cron alert mail / webhook | hourly at the earliest | needs `RESEND_API_KEY` / `ALERT_WEBHOOK_URL`, also absent today |
| 6 | A person opening the page | whenever | — |

Read the table honestly and the current answer is already visible: **for a change
that passes the gates and then misbehaves at runtime, time-to-detect is bounded
by nothing but somebody looking.** The drill's job is to turn that sentence into
a number, and then to shrink it.

## The drill

Budget 30 minutes. Record four wall-clock stamps: `T0` seed applied, `T1` first
layer that flagged it, `T2` decision made (revert vs fix forward), `T3` tree
clean again.

### 1. Pick one seed

Each is one line, subtle, and lands on a seam this repository says matters. Use a
different one each time the drill runs — a seed that has been used before is a
seed the suite has since been taught.

- **Tenant key (ADR-0002).** In `src/lib/campaigns/store-keys.ts`, change
  `buildTenantKey`'s `projectId ? …` to `projectId !== undefined ? …`. Types are
  unchanged; an explicit `null` now produces a project-scoped key with the string
  `"null"` in it.
- **Store seam (ADR-0001).** In any `src/lib/**` local-store module, drop one
  `_proj_` guard from a `LIKE` sweep so a delete reaches a sibling project.
- **LLM chokepoint (ADR-0003).** Widen one operation's prompt with an extra
  grounding paragraph — output stays the right shape and the right quality, and
  the request costs more.

Apply it in a scratch worktree, not the shared checkout. Stamp `T0`.

### 2. Time the detection

Run the layers in the order CI would, and stop at the first one that goes red:

```bash
npm run typecheck && npm run lint          # cheapest
npm run test:unit                          # the layer the seed is aimed at
npm run llm:budget:check                   # catches the third seed, and only it
npm run check:ci                           # everything, the way pre-push runs it
```

Stamp `T1` at the first red, and **record which layer it was**. If `check:ci`
goes green with the seed applied, that is the drill's most valuable outcome:
write the seed into the Findings section and open the missing test. A seed that
survives `check:ci` would have shipped.

### 3. Time the recovery

Two paths, and they are not alternatives — the first stops the bleeding, the
second cleans the repository.

- **Live site (operator).** `vercel promote <last-good-deployment-url>` flips the
  alias atomically; `../deploy.md` § Deploy + rollback has the dashboard
  equivalent. Time the flip, not the decision. If a real promote is not
  acceptable on the day, time it against a preview alias and mark the row
  `promote: preview`.
- **Repository (agent or operator).** `git revert --no-edit <sha>` then push.
  Note that the subject `git revert` writes — `Revert "…"` — is **exempt** from
  rubric A5 (`scripts/commit-subject.mjs`, `EXEMPT`), so the fast path is not
  blocked by the commit-subject gate. It still goes through `.husky/pre-push`,
  which means a revert of a change that broke `check:ci` cannot be pushed until
  the tree is green — that is a real constraint on recovery time and belongs in
  the row.

Stamp `T2` at the decision and `T3` when the tree is clean.

### 4. Discard the seed, record the row

Discard the seeded edit — never commit it. Add the row below and, if the seed
survived a layer that should have caught it, add the finding.

## Finding a bad commit fast

A revert needs a suspect. Two things already in the tree narrow the search
without any new marking:

- **Stopped sessions are already identifiable.** `.agent/checkpoints/<session>.json`
  is tracked, and `endedAt` is stamped **only** when a session ends cleanly
  (`.agent/README.md`). So a checkpoint without `endedAt` belongs to a run that
  was stopped, and the commits around it are the ones to read first:

  ```bash
  grep -L '"endedAt"' .agent/checkpoints/*.json          # the stopped sessions
  git log --oneline -- .agent/checkpoints                # and when they landed
  ```

  This is why the answer to "should stopped-session commits be marked
  differently?" is **no new trailer** — the marker exists, it is a file, and it
  is already committed. What is missing is only that the pre-commit fold
  (`node scripts/agent-checkpoint.mjs --commit`) is written and not yet wired, so
  the checkpoint does not always land in the same commit as the work.
- **The rubric's verdict is attached to the commit**, as check annotations and as
  the 90-day `mechanical-review` artifact (`../deploy.md` § Delivery contract).
  A suspect commit's annotations are readable from the Checks tab without
  re-running anything.

## Results

One row per drill. Times in minutes. `Caught by` is the layer, or `nothing` when
the seed survived `check:ci`.

| Date | Seed | Caught by | T1−T0 detect | T3−T2 recover | Notes |
| --- | --- | --- | --- | --- | --- |
| _(no drill has been run yet — the first row is the point of this file)_ | | | | | |

### Findings

Seeds that survived a layer that should have caught them, and what was done
about it. Empty until the first drill.

## When this becomes a gate

Not yet, and deliberately — ADR-0007 puts a check on the blocking rung only once
it passes on the tree today, and a recency check over an empty table is red by
construction. After **two** recorded rows there is a baseline to compare against,
and the promotion is the usual shape: a `--check` that fails when the newest row
is older than a quarter, wired into `check:ci` in the same commit that records
the row making it green. Adding it before then would put a third rung in the
repository — runs, prints, nobody can tell whether it got worse — which
ADR-0007 § Consequences observed already caught this repository doing once.
