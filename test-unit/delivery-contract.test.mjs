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
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  for (const name of (scripts["check:ci"] ?? "").matchAll(/npm run ([\w:-]+)/g)) {
    assert.ok(scripts[name[1]], `check:ci runs \`npm run ${name[1]}\`, which package.json does not define.`);
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

test("what the review has caught over time is answerable without re-running it", () => {
  assert.ok(
    existsSync(join(ROOT, "scripts/agent-review-history.mjs")),
    "no scripts/agent-review-history.mjs — 'which rubric rules have actually fired?' goes back to being a " +
      "question only a commit-by-commit re-run can answer."
  );
  assert.match(scripts["review:agent:history"] ?? "", /scripts\/agent-review-history\.mjs/);

  const history = read(".github/workflows/agent-review-history.yml");
  assert.match(history, /schedule:/, "the aggregate is about the trend, so it runs on a schedule, not on a diff.");
  assert.match(history, /checks:\s*read/, "reading past annotations needs `checks: read`.");
  assert.match(history, /actions:\s*read/, "listing the review workflow's runs needs `actions: read`.");
  assert.doesNotMatch(history, /:\s*write\b/, "a reporting job has no reason to hold a write scope.");

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
