/** The delivery contract, asserted rather than described.
 *
 *  docs/deploy.md § Delivery contract makes three claims, and until now all three
 *  were prose: the rubric review of the diff blocks; `npm run check:ci` equals
 *  CI's blocking set; and the pre-push hook proves that set before the push that
 *  IS the release. Prose cannot fail, so an agent reading this tree could not tell
 *  whether ignoring the rubric review had consequences.
 *
 *  These tests are the consequence. They read the same files a reader would —
 *  package.json, .github/required-checks.json, .husky/pre-push, the workflow —
 *  and fail when the teeth are removed. `npm run test:unit` is itself inside
 *  check:ci and inside the required check "Typecheck, lint & build", so
 *  disarming the review now turns the gate red on the disarmer's own machine.
 *
 *  What they deliberately do NOT re-test: that each required check exists, keeps
 *  its display name, runs on pull requests and carries no `continue-on-error`.
 *  scripts/merge-gate.mjs owns that, and duplicating it here would mean two
 *  places to update and one of them going stale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chainStages } from "../scripts/lib/chain.mjs";
import { deliveryDrift } from "../scripts/lib/delivery.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};
const required = JSON.parse(read(".github/required-checks.json")).required ?? [];

/** The rubric review's entry in the enumeration of what may stop a change. */
const rubric = required.find((r) => r.workflow === "agent-review.yml");

test("the rubric review is enumerated as a required check", () => {
  assert.ok(
    rubric,
    "no entry in .github/required-checks.json points at agent-review.yml — the review would be a comment, " +
      "not a gate, and CLAUDE.md's claim that its mechanical half blocks would be false."
  );
  assert.equal(rubric.job, "mechanical", "the blocking half is the `mechanical` job; `judgment` never blocks.");
  assert.deepEqual(rubric.softenedSteps ?? [], [], "a required check with a softened step is a gate that cannot fail.");
  assert.ok(String(rubric.why ?? "").length > 40, "every required check owes a reason it earns a red build.");
});

test("the script behind the review exists and is what the npm scripts run", () => {
  assert.ok(existsSync(join(ROOT, "scripts/agent-review.mjs")));
  for (const name of ["review:agent", "review:agent:gate"]) {
    assert.ok(scripts[name], `package.json has no \`${name}\` script.`);
    assert.match(scripts[name], /scripts\/agent-review\.mjs/);
  }
});

test("the review runs on the push path too, not only on pull requests", () => {
  // Master ships by direct push, so a required status check on a PR does not
  // cover the way changes actually land here. check:ci is what .husky/pre-push
  // proves before the push exists — the review has to be inside it.
  assert.match(
    scripts["check:ci"] ?? "",
    /review:agent:gate/,
    "`check:ci` no longer runs the rubric review. On this repo's landing path (direct push to master, " +
      "Vercel ships on push) that leaves Part A unable to stop anything: agent-review.yml's verdict arrives " +
      "after the deploy has started. Put `npm run review:agent:gate` back, or move the review off " +
      ".github/required-checks.json and say why."
  );
});

test("review:agent:gate pins an explicit base, so it cannot silently review nothing", () => {
  // Without --base the script falls back through origin/master → master → HEAD~1
  // and exits 0 when none resolve. Inside a blocking gate that fallback would be
  // an invisible pass; naming the base keeps the no-op case to the one we mean
  // (CI's shallow checkout, where the dedicated workflow job does the real run).
  assert.match(scripts["review:agent:gate"], /--base\s+origin\/master/);
});

test("the pre-push hook still runs the full gate before a master push", () => {
  const hook = read(".husky/pre-push");
  assert.match(
    hook,
    /npm run check:ci/,
    ".husky/pre-push no longer runs check:ci. Vercel ships master on push, so this hook is the only thing " +
      "that proves the gate BEFORE the release act."
  );
  assert.match(hook, /refs\/heads\/master/, "the hook must still recognise a push that updates master.");
});

test("every check:ci stage is a real npm script", () => {
  // A typo in the chain is a stage that never runs; `npm run` would fail loudly
  // on it, but only on the machine that got that far. Catch it here instead.
  for (const stage of chainStages(pkg)) {
    assert.ok(scripts[stage], `check:ci runs \`npm run ${stage}\`, which package.json does not define.`);
  }
});

/** THE THREE-WAY ALIGNMENT. ci.yml opened by asking the reader to keep itself,
 *  the `check:ci` script and .husky/pre-push pointing at each other — the one
 *  claim of that shape in this repository with no gate behind it, and it had
 *  drifted: docs/deploy.md listed eleven of sixteen stages and never mentioned
 *  `sast`. scripts/lib/delivery.mjs is the reader; these are its teeth. */
test("the three definitions of the gate still name the same gate", () => {
  assert.deepEqual(
    deliveryDrift(),
    [],
    "ci.yml, package.json's `check:ci` and .husky/pre-push have stopped describing one gate. " +
      "`npm run delivery:chain` prints the chain; `-- --write` regenerates the copy in docs/deploy.md."
  );
});

test("the drift check is wired into a gate that runs, not only into this test", () => {
  const gate = read("scripts/merge-gate.mjs");
  assert.match(
    gate,
    /deliveryDrift/,
    "scripts/merge-gate.mjs no longer reads the delivery chain, so the alignment is proven only by the unit " +
      "suite and no longer by the gate that runs before a master push."
  );
  assert.match(scripts["delivery:chain"] ?? "", /scripts\/delivery-chain\.mjs/);
  assert.match(scripts["delivery:chain:write"] ?? "", /--write/);
});

/** And the fence is watched firing. A check whose only evidence is a green tree
 *  cannot be told from one that has stopped comparing anything — the same reason
 *  test-unit/contract-ledger-ceiling.test.mjs runs its gate against a fixture
 *  whose list has outgrown its ceiling. */
test("it refuses a tree where the three have drifted apart", () => {
  const dir = mkdtempSync(join(tmpdir(), "delivery-drill-"));
  const write = (rel, body) => {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  const workflow = (names) => `on:\n  push:\njobs:\n  check:\n    steps:\n      - run: npm run check:ci\n# ${names}\n`;
  const doc = (list) =>
    `## Delivery contract\n<!-- BEGIN:check-ci-chain -->\n  ${list.map((s) => `\`${s}\``).join(" → ")}\n<!-- END:check-ci-chain -->\n`;
  const hook = "case $remote_ref in refs/heads/master) ;; esac\nnpm run check:ci\n";

  try {
    write("package.json", JSON.stringify({ scripts: { "check:ci": "npm run alpha && npm run beta", alpha: "x", beta: "x" } }));
    write(".husky/pre-push", hook);
    write(".github/workflows/ci.yml", workflow("stages: alpha beta"));
    write("docs/deploy.md", doc(["alpha", "beta"]));
    assert.deepEqual(deliveryDrift(dir), [], "the aligned fixture must be green, or the drill proves nothing.");

    // A gate the workflow runs but never names — the cost nobody argued.
    write(".github/workflows/ci.yml", workflow("stages: alpha"));
    assert.match(deliveryDrift(dir).join("\n"), /never names 1 stage.*beta/s);

    // A human-readable copy that fell behind the declaration.
    write(".github/workflows/ci.yml", workflow("stages: alpha beta"));
    write("docs/deploy.md", doc(["alpha"]));
    assert.match(deliveryDrift(dir).join("\n"), /missing: beta/);

    // A hook that assembles its own subset instead of running the chain.
    write("docs/deploy.md", doc(["alpha", "beta"]));
    write(".husky/pre-push", `${hook}npm run alpha\n`);
    assert.match(deliveryDrift(dir).join("\n"), /runs alpha directly/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the agent review workflow's blocking job is the one with no write token", () => {
  // Part A can fail the build; Part B holds `pull-requests: write`. They must not
  // be the same job — a build verdict and a write token in one place is how a
  // fork's pull request turns a review into a commit.
  // Comments stripped first: this file explains the rule in prose that contains
  // the very words the rule forbids in YAML.
  const wf = read(".github/workflows/agent-review.yml")
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const from = wf.indexOf("\n  mechanical:");
  const to = wf.indexOf("\n  judgment:");
  assert.ok(from !== -1 && to > from, "agent-review.yml no longer has both a `mechanical` and a `judgment` job.");
  const mechanical = wf.slice(from, to);
  assert.doesNotMatch(mechanical, /:\s*write\b/, "the blocking job must not request any write scope.");
  assert.match(mechanical, /permissions:\s*\n\s+contents:\s*read/, "the blocking job must declare its own scope.");
  assert.doesNotMatch(mechanical, /continue-on-error/, "the blocking job must be able to fail.");
  assert.match(wf.slice(to), /pull-requests:\s*write/, "the judgment job is the one that comments on a PR.");
});

/** The review's TRAIL. A verdict that exists only as an exit code inside one CI
 *  chain cannot be read after the fact, cannot be answered in place, and leaves
 *  no record of what the automation has caught over time — which is how an
 *  automated reviewer stops being trusted and stops being improved. Each of these
 *  asserts one of the places the verdict is now written down. */
const reviewWorkflow = read(".github/workflows/agent-review.yml")
  .split(/\r?\n/)
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const reviewJudgment = reviewWorkflow.slice(reviewWorkflow.indexOf("\n  judgment:"));

// Comments stripped for the same reason: this workflow explains its own
// permission split in prose that quotes the very scopes being asserted.
const history = read(".github/workflows/agent-review-history.yml")
  .split(/\r?\n/)
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const historyRead = history.slice(history.indexOf("\n  history:"), history.indexOf("\n  publish:"));
const historyPublish = history.slice(history.indexOf("\n  publish:"));

test("Part A annotates the change it judged, not just the run", () => {
  // An annotation is attached to the commit and rendered inline on the diff and
  // on a PR's Files view — it is the only form of the finding that lands where it
  // can be answered, and the only one still addressable through the API later.
  assert.match(
    reviewWorkflow,
    /--annotate/,
    "the mechanical job no longer passes `--annotate`, so Part A's findings exist only as a red tick and a " +
      "job summary. Nothing anchors them to the file and line they are about, and scripts/agent-review-history.mjs " +
      "has nothing left to read."
  );
  assert.match(
    reviewWorkflow,
    /--json\s+mechanical\.json/,
    "the mechanical job no longer writes a machine-readable verdict, so the review's findings can only be " +
      "re-derived from prose."
  );
  assert.match(
    reviewWorkflow,
    /retention-days:\s*90/,
    "the report artifact no longer outlives the weekly triage cycle, which is the only reason it is kept."
  );
});

test("a pull request always gets the review as a comment, key or no key", () => {
  // Part B needs ANTHROPIC_API_KEY. The keyless case — a fork, a clone, a lapsed
  // key — is exactly when nobody goes digging through job summaries, so Part A's
  // own report is posted instead.
  assert.match(
    reviewJudgment,
    /gh pr comment/,
    "the judgment job no longer posts anything to the PR without a model key, so a keyless repository's " +
      "review leaves no comment trail at all."
  );
});

test("the job holding the key and the write token never has the change on disk", () => {
  // `judgment` is the only job in the repository with a secret and a write scope
  // at the same time. On this repository every branch an agent pushes is
  // same-repo, so the secrets ARE handed to it — which makes "what code does that
  // job execute?" the load-bearing question, and the answer has to be "the base's,
  // all of it". Restoring only `scripts/` and the rubric was not enough: `node`
  // reads the nearest package.json for the module type and the `imports` map, and
  // resolves through whatever node_modules is on disk.
  assert.match(
    reviewJudgment,
    /git checkout --force --detach "\$BASE_REF"/,
    "the judgment job no longer moves its whole working tree to the base revision, so the change's own files sit " +
      "next to ANTHROPIC_API_KEY and `pull-requests: write`."
  );
  assert.match(
    reviewJudgment,
    /git clean -ffdx/,
    "files the change ADDED survive the base checkout — they are untracked at the base, so only a clean removes " +
      "them, and a file the change added is exactly the shape this is defending against."
  );
  assert.doesNotMatch(
    reviewJudgment,
    /git checkout "\$BASE_REF" -- /,
    "the partial restore is back: a pathspec checkout leaves the rest of the change's tree in place."
  );
  // With the tree at the base, HEAD *is* the base — the ref to review has to be
  // named, or the reviewer diffs the base against itself and comments nothing.
  assert.match(
    reviewJudgment,
    /--head "\$HEAD_REF"/,
    "the judgment job stopped naming the ref to review, so Part B now diffs the base against itself and finds " +
      "nothing to say — a silent no-op, not a failure."
  );
  assert.match(
    read("scripts/agent-review-llm.mjs"),
    /arg\("--head"\)/,
    "scripts/agent-review-llm.mjs no longer accepts --head, so the workflow's ref is ignored and the review is " +
      "empty."
  );
});

test("what the review has caught over time is answerable without re-running it", () => {
  assert.ok(
    existsSync(join(ROOT, "scripts/agent-review-history.mjs")),
    "no scripts/agent-review-history.mjs — 'which rubric rules have actually fired?' goes back to being a " +
      "question only a commit-by-commit re-run can answer."
  );
  assert.match(scripts["review:agent:history"] ?? "", /scripts\/agent-review-history\.mjs/);

  assert.match(history, /schedule:/, "the aggregate is about the trend, so it runs on a schedule, not on a diff.");
  assert.match(history, /checks:\s*read/, "reading past annotations needs `checks: read`.");
  assert.match(history, /actions:\s*read/, "listing the review workflow's runs needs `actions: read`.");

  // Same split as agent-review.yml: the job that READS the trail holds no write
  // scope, and the job that WRITES it holds nothing else — and does not check the
  // repository out, so no repository code runs beside the token.
  assert.ok(historyRead.length > 0 && historyPublish.length > 0, "agent-review-history.yml lost one of its two jobs.");
  assert.doesNotMatch(historyRead, /:\s*write\b/, "the aggregating job has no reason to hold a write scope.");
  assert.match(historyPublish, /issues:\s*write/, "publishing the trail needs `issues: write`.");
  assert.doesNotMatch(
    historyPublish,
    /contents:\s*write/,
    "the publishing job must not be able to write to the repository — master ships on push, so a commit " +
      "from a cron job would be a release."
  );
  assert.doesNotMatch(
    historyPublish,
    /actions\/checkout/,
    "the job holding the write token must not check the repository out; nothing it does needs the tree."
  );

  // It must not hardcode the blocking job's display name: .github/required-checks.json
  // is the one place that name is declared, and merge-gate.mjs already fails on a
  // rename there. Two copies would mean the report quietly aggregating nothing.
  assert.match(
    read("scripts/agent-review-history.mjs"),
    /required-checks\.json/,
    "the history report must take the blocking job's name from .github/required-checks.json, not repeat it."
  );

  assert.ok(
    !required.some((r) => r.workflow === "agent-review-history.yml"),
    "the history report is reporting-rung (ADR-0007): it needs the network and a token, so it can never be " +
      "proven in check:ci and must not be enumerated as a check that stops a change."
  );
});

test("the trail is published where a reader outside the Actions tab can find it", () => {
  // A job summary belongs to its run: it expires, it is not addressable, and
  // nobody who is not already in the Actions tab ever sees it. From outside the
  // repository that made the review invisible — an automated practice that cannot
  // be observed is one that quietly stops being trusted and stops being improved.
  assert.match(
    read("scripts/agent-review-history.mjs"),
    /--out/,
    "the history report can no longer be written to a file, so there is nothing to publish anywhere."
  );
  assert.match(
    history,
    /--out\s+review-history\.md/,
    "the scheduled run no longer produces a publishable report."
  );
  assert.match(
    historyPublish,
    /gh issue (edit|create)/,
    "nothing publishes the aggregate any more. Without it the only record of what the automated reviewer " +
      "has caught lives in job summaries that expire with their runs."
  );
});

/** A5 — the log itself. With ~97% of commits agent-written and most landing by
 *  direct push, the subject line is the index a future bisect reads. */
test("commit subjects are checked by the blocking half of the review", () => {
  assert.ok(
    existsSync(join(ROOT, "scripts/commit-subject.mjs")),
    "no scripts/commit-subject.mjs — the commit-subject rules have nowhere to live."
  );
  assert.match(
    read("scripts/agent-review.mjs"),
    /checkSubject/,
    "Part A no longer reads commit subjects, so a subject that narrates the session instead of naming the " +
      "change lands unchallenged. Rubric A5 says otherwise."
  );
  assert.match(read(".github/agent-review-rubric.md"), /### A5 · /, "A5 is missing from the rubric it is enforced from.");
  assert.match(scripts["commit:check"] ?? "", /scripts\/commit-check\.mjs/);
});

test("the two documented editions cannot drift apart in silence", () => {
  // The app's locale columns are held in step by the type system; the docs had
  // nothing, and README.md / docs/README.cs.md contradicted each other on whether
  // a self-hosted install works. A stale translation is not a gap, it is a
  // confident wrong answer.
  assert.match(
    scripts["check:ci"] ?? "",
    /docs:parity/,
    "`check:ci` no longer verifies that the bilingual README pair agrees, so the Czech edition can go stale " +
      "without anything noticing."
  );
  assert.match(scripts["docs:parity"] ?? "", /scripts\/docs-parity\.mjs/);
  const spec = JSON.parse(read("docs/parity.json"));
  assert.ok(Array.isArray(spec.pairs) && spec.pairs.length, "docs/parity.json declares no pairs — the gate checks nothing.");
  for (const pair of spec.pairs) {
    assert.ok(existsSync(join(ROOT, pair.source)), `docs/parity.json points at a missing source: ${pair.source}`);
    assert.ok(existsSync(join(ROOT, pair.derived)), `docs/parity.json points at a missing derivation: ${pair.derived}`);
    assert.ok(
      (pair.rules ?? []).length > 0,
      `${pair.source} → ${pair.derived} declares no shared claims, so the pair is declared but unchecked.`
    );
  }
});

/** WHOSE TEETH ARE VISIBLE FROM OUTSIDE. The enumeration and scripts/merge-gate.mjs
 *  prove the REPOSITORY side: each named check exists, runs on pull requests, keeps
 *  the name GitHub matches, and can still fail. ADR-0011 recorded the residue — a
 *  checkout cannot read a settings page — and that residue is exactly why, from
 *  outside this tree, the rubric review was indistinguishable from a review that
 *  merely comments.
 *
 *  .github/branch-ruleset.json is the GitHub side written down as the payload that
 *  produces it, held equal to the enumeration by the same blocking gate; whether it
 *  has actually been applied is read back weekly and published into the trail issue.
 *  These tests fail when either half is removed. */
test("the GitHub side of the enumeration is declared in the repository", () => {
  const ruleset = JSON.parse(read(".github/branch-ruleset.json"));
  assert.equal(ruleset.target, "branch");
  assert.equal(
    ruleset.enforcement,
    "active",
    "an `evaluate` or `disabled` ruleset reports without stopping anything — which is the state this file " +
      "exists to make impossible to hold by accident."
  );

  const contexts = (ruleset.rules ?? [])
    .filter((r) => r.type === "required_status_checks")
    .flatMap((r) => (r.parameters?.required_status_checks ?? []).map((c) => c.context));
  assert.deepEqual(
    [...contexts].sort(),
    required.map((r) => r.check).sort(),
    ".github/branch-ruleset.json and .github/required-checks.json name different checks. GitHub matches a " +
      "check by that exact string, so the two drifting apart is how an enumerated gate becomes advice."
  );
  assert.ok(
    contexts.includes(rubric.check),
    "the rubric review is enumerated as a check that may stop a change but is missing from the ruleset this " +
      "repository declares to GitHub — the one claim this whole file exists to make verifiable."
  );
});

test("that declaration is proven by the same gate that runs before a master push", () => {
  // Offline and blocking, so it holds in the pre-push hook and in a fork's CI:
  // adding a required check and forgetting the ruleset is a red build, not a gap
  // nobody notices until something merges that should not have.
  assert.match(
    read("scripts/merge-gate.mjs"),
    /checkDeclaredRuleset/,
    "merge-gate.mjs no longer checks the declared ruleset against the enumeration, so the two can drift and " +
      "nothing says so."
  );
  assert.ok(existsSync(join(ROOT, "scripts/branch-protection.mjs")));
  assert.match(scripts["protection:check"] ?? "", /scripts\/branch-protection\.mjs/);
  assert.match(scripts["protection:verify"] ?? "", /--verify/);
});

test("whether GitHub actually enforces those checks is read back and published", () => {
  // The networked half. It needs a token, so it is reporting rung for good
  // (ADR-0007) — but its answer is appended to the report published into the trail
  // issue, which is the only place a reader who is not the maintainer can see
  // whether the review blocks or comments.
  assert.match(
    history,
    /scripts\/branch-protection\.mjs --verify/,
    "the weekly run no longer asks GitHub whether the enumerated checks are enforced, so the enumeration is " +
      "once again a claim about a settings page nobody can read."
  );
  assert.match(
    history,
    /cat protection\.md >> review-history\.md/,
    "the enforcement answer is no longer appended to the published report, so it lives only in a job summary " +
      "that expires with its run."
  );
  assert.ok(
    !required.some((r) => r.job === "protection" || String(r.workflow).includes("branch")),
    "reading GitHub's live rules needs a token and so can never be proven in check:ci; it must not be " +
      "enumerated as a check that stops a change."
  );
});
