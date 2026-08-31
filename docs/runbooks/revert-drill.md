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

> **Status: the two legs that need no production access now run themselves.**
> This file sat here for months saying "never run", because rehearsing it meant a
> person choosing to spend thirty minutes and nobody ever did — a rehearsal
> nobody schedules is a design document. So the detect leg and the restore leg
> are now `npm run revert:drill` (`scripts/revert-drill.mjs`), fired weekly and on
> demand by [`.github/workflows/revert-drill.yml`](../../.github/workflows/revert-drill.yml),
> which publishes a dated row into a GitHub issue and keeps the verdict as a
> 90-day artifact. The **promote leg is still the operator's** and still
> unmeasured: `vercel promote` is a production action under the operator's name
> (`AGENTS.md` § Red), so the number this file most wants — how long the live site
> stays wrong — is owed until an operator times one. The manual procedure below
> is what they follow; everything the machine now does is marked.

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

**Steps 1–2 and step 4 are now a command.** `npm run revert:drill` picks this
week's seed (or `-- --seed <id>`; `npm run revert:drill:list` prints the
catalogue), proves the unseeded tree is green first so a red baseline cannot be
mistaken for a catch, seeds the fault, runs the layers in CI's order until one
goes red, then removes the seed and asserts the file is byte-for-byte what it
was — the restore runs in a `finally`, so a drill that dies still puts the tree
back. It stamps `T0`, `T1` and `T3` itself and prints the Results row. It never
touches git, never pushes and never promotes. Step 3's live-site leg below is
the one thing it cannot do, and the one thing that needs a human.

### 1. Pick one seed

Each is one line, subtle, and lands on a seam this repository says matters. Use a
different one each time the drill runs — a seed that has been used before is a
seed the suite has since been taught. The machine-run catalogue lives in
`SEEDS` in [`scripts/revert-drill.mjs`](../../scripts/revert-drill.mjs), rotating
by week; each entry carries a single-line anchor that must match **exactly once**,
so a seam that moves fails the drill loudly instead of seeding something nobody
chose. The three below are the hand-applied set, and the first is the same seam
the catalogue's `key-sanitiser` seed uses.

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

## What a rollback does NOT take back

Promoting the previous deployment restores the **code**. It restores nothing the
bad version wrote or sent while it was live, and this is the part an on-call
reader needs before deciding between promote and fix-forward. Ordered by how hard
each one is to undo:

| Residue | What a promote leaves | What to do instead |
| --- | --- | --- |
| **Conversions uploaded to Google Ads** | Irreversible, and outside this system entirely. Rows are marked `uploaded` in the same pass the acceptance is read, which is what makes replay safe — so **restoring `conversion_events` from a backup taken before an upload is the one dangerous restore**: the restored rows have lost their markers and would be sent again, and Google counts a gclid twice. | Nothing to roll back; the dry-run + 24 h approval gate is the bound. `docs/deploy.md` § Nahrávání konverzí. |
| **Mail sent through Resend, posts published by the twin** | Gone. A promote cannot unsend. | Follow up in the same channel; never re-run the cron hoping it self-corrects. |
| **Sklik / Google Ads mutations** | Only reachable when `SKLIK_WRITES_ENABLED=1` (unset by default, and the operator's decision alone). A promote does not undo a budget change made in an advertiser's account. | The control plane's own changeset history; treat it as a separate incident. |
| **Firestore documents written under a new shape** | Stay. There is no schema version on production data and no down-migration: the previous code reads whatever the newer code wrote, which is fine when the change was additive and is silent corruption when it was not. | This is the question to answer *before* promoting. If the bad version wrote a new field shape, fix forward. |
| **Local `node:sqlite` schema (`LOCAL_DB`)** | `MIGRATIONS` in `src/lib/db.ts` is append-only and there are no down-steps, so a dev checkout that ran the newer code carries the newer schema. Harmless — the store is per-developer. | Delete `.data/systedo.db` and `npm run seed:local`. |
| **Crons that fired during the bad window** | The six schedules in `vercel.json` kept running. Their ledger rows, period claims and `cron_runs` counters are already written; a claim kept on a permanent 4xx means the next attempt is tomorrow, not in an hour. | Read `cron_runs` for the window before assuming the promote fixed the job. |

The short version: **promote first when the fault is in rendering or reading,
fix forward when the fault WROTE something.** A promote is atomic and cheap; it
is also the wrong instrument for a change whose damage is already in someone
else's system.

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
| _(rows for the automated legs are published to the trail issue, not committed — see below)_ | | | | | |

**Where the automated rows live.** Not here: master ships on push, so a commit
from a scheduled job would be a release. `.github/workflows/revert-drill.yml`
rewrites one GitHub issue — *"Revert drill — how long a bad change survives"* —
with each run's row, exactly as `llm-drift.yml` publishes the model prove's
trail, and keeps `revert-drill.json` as a 90-day artifact. Add a row to the table
above by hand only for a drill that included the **promote leg**, which is the
half no workflow can run.

### Findings

Seeds that survived a layer that should have caught them, and what was done
about it. Empty until the first drill.

## When this becomes a gate

Not in `check:ci`, and permanently so: the drill runs the unit suite twice over
(once to prove the baseline is green, once with the seed applied), so putting it
on the pre-push path would double the cost of every push to buy a fact that
changes weekly at most. It sits on the **reporting** rung (ADR-0007) in its own
workflow, where its red is a signal to a human rather than a blocked release —
and it has two reds worth knowing apart:

- **A seed survived every layer.** That is the finding this whole file exists to
  produce: a change on a seam with a decision record behind it would have
  shipped. Write it into Findings and open the missing test. Never widen or
  delete the seed to go green.
- **A seed's anchor no longer matches exactly once.** The code moved. Re-anchor
  it, or drop it and say in the commit which seam is now unrehearsed.

What is still owed is the number the machine cannot produce: **T3−T2 for the live
site**, which needs an operator timing one `vercel promote`. Two of those rows in
the table above and the recency check is worth having.
