# ADR-0011 — What may stop a change is enumerated in the repository, not in a settings page

## Status

Accepted (in force: `npm run merge-gate` runs inside `npm run check:ci`)

## Context

[ADR-0007](0007-gate-rung-discipline.md) settled which checks block and which
report. It did not settle where that answer *lives*, and the answer was living in
two places at once: in each workflow's prose, and in one person's GitHub branch
protection settings — a screen that is not in the repository, not in a diff, and
not readable by an agent.

That gap is expensive here specifically. Around 97% of commits in this tree are
written by an agent and triaged weekly, and the tree has a rubric review of every
diff (`.github/agent-review-rubric.md`) whose mechanical half exits non-zero. An
agent reading the repository could not tell that from a review that merely
comments, because nothing said so. A check that can stop a change and a check
that produces a paragraph look identical from inside the checkout.

Two things follow, and both were observed:

- A gate can be softened in place — a `continue-on-error` added to a required
  job's step, a job renamed — and nothing notices, because the branch-protection
  rule matches on a display string that lives somewhere else. A renamed job does
  not fail; it silently stops being required, which is worse.
- The reporting-rung jobs (Semgrep, `npm audit`, the repo security rules, the
  judgment half of the review) look like blockers to a contributor reading CI, so
  a red one costs a round trip to find out it never mattered.

There is a further wrinkle unique to this repo: `docs/deploy.md` records that
master ships to Vercel **on push**, with no PR stage between the maintainer and
production. Branch protection therefore governs contributors' pull requests but
governs the maintainer not at all; the pre-push hook is what governs the
maintainer. Any answer that only configured GitHub would cover the smaller half.

## Decision

`.github/required-checks.json` enumerates the checks that must be green before a
change lands. Each entry names the workflow file, the job id, the display string
GitHub matches, the reason that check earns a red build, and the steps inside it
that are legitimately reporting-rung.

`scripts/merge-gate.mjs` keeps that file honest, and runs blocking as part of
`npm run check:ci`. It fails when a listed check no longer exists, is no longer
triggered by `pull_request`, has been renamed away from the string branch
protection is matching, or has gained a `continue-on-error: true` on a step not
declared as reporting-rung. It also lists the PR jobs that are deliberately *not*
required, so the reporting rung is visible rather than inferred.

Three consequences of putting it in `check:ci` rather than in a workflow of its
own:

1. It is enforced on the maintainer's own push, because the pre-push hook runs
   `check:ci` before any push that updates master — which, given the deploy
   topology above, is the moment that actually matters.
2. It needs no token, so it runs identically in a fork, offline, and in the hook.
   A gate that only works for the maintainer is the shape of gate this decision
   exists to replace.
3. It does not read GitHub's live settings, and deliberately so. The file is the
   source; the settings page is a copy of it, and `CONTRIBUTING.md` says which is
   which.

The rubric review's mechanical half is on the list. Its judgment half is not: it
needs an API key it may not have, and a model's taste stopping a merge is the
failure mode the two-part rubric was designed around. Part B raises named
findings for the weekly triage; a human answers them.

## Consequences

- Promoting a check to blocking now costs one more edit — fixing its findings,
  dropping its `continue-on-error`, and adding it to the enumeration in the same
  commit. That is the intended friction; ADR-0007 already asks for the first two.
- Renaming a job is a two-file change. If you forget the second file, the gate
  goes red locally before the rename can land, which is the entire point.
- The list can lie about GitHub's settings, because nothing here can read them
  without a token. What it cannot do is lie about the repository: every claim it
  makes about a workflow is verified against the workflow.
- That residue turned out to have a cost worth paying down, so it is now split in
  two rather than left open. `.github/branch-ruleset.json` states the GitHub side
  as the literal Rulesets payload that produces it, and `scripts/merge-gate.mjs`
  fails when its required contexts stop being exactly the `check` strings here —
  offline, blocking, so adding a check and forgetting the ruleset cannot land.
  Whether that declaration has been APPLIED still needs a token, so it stays
  reporting rung: `scripts/branch-protection.mjs --verify` reads the rules GitHub
  is actually enforcing on the default branch and
  `.github/workflows/agent-review-history.yml` publishes the answer weekly into
  the trail issue. The claim "the rubric review blocks a merge" is therefore
  checkable by anyone with read access, which it was not before. What the token
  can read is rulesets only — classic branch protection needs an admin token
  `GITHUB_TOKEN` cannot be granted, so the report says "no ruleset requires it"
  and never "the branch is unprotected".
- `.github/required-checks.json` is a law file in the sense of
  `.github/CODEOWNERS`: shrinking it is a governance change, not a cleanup, and
  should be reviewed as one.

## Revisit when

- **`npm run protection:verify` reports a mismatch and the enumeration is the
  side that is right.** Twice would settle it: the declaration in
  `.github/branch-ruleset.json` is being maintained and the platform is not, which
  means somebody has to apply it — or the reporting rung is where this half stops
  being useful and it needs an owner rather than a weekly line.
- **A check that must be green cannot be named here.** An org-level ruleset, a
  marketplace app's status, anything enforced outside this repository: the file's
  claim is that the list is complete, and one check outside it makes the list a
  partial index that reads like a full one.
- **The deploy topology changes and master stops shipping on push.** Half the
  reasoning here — that the pre-push hook is the moment that matters — is about
  that topology. Behind a promotion step, the same enumeration would want to gate
  the promotion instead, and `check:ci` would stop being the place it belongs.
