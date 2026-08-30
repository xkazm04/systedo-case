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
