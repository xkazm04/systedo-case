/** No workflow in this repository starts in the privileged context on somebody
 *  else's event.
 *
 *  scripts/actions-pin.mjs rule P2 is the gate; this is the assertion that the
 *  gate still covers the whole FAMILY rather than the one member everybody knows.
 *  The two are not redundant: the policy script fails a workflow that uses a
 *  privileged trigger, and these tests fail when the LIST it fails against gets
 *  shortened — which is the cheaper way to reintroduce the class, and the one a
 *  green build would otherwise hide.
 *
 *  Why the family and not just `pull_request_target`: every one of these starts a
 *  job in the BASE repository's context, with its `GITHUB_TOKEN` and its secrets,
 *  on an event someone who cannot push here controls. In this repository those
 *  secrets are live Google Ads / Sklik / Resend credentials and a model key, so
 *  "which triggers can an outsider reach?" is the question the whole workflow
 *  surface turns on. `workflow_run` is the subtle one — it re-enters the
 *  privileged context after an untrusted workflow has already run, and is handed
 *  whatever artifacts that run chose to leave.
 *
 *  `npm run test:unit` is inside `npm run check:ci`, which .husky/pre-push runs
 *  before any push that updates master — so this fails on the disarmer's own
 *  machine, before the release, not in a comment afterwards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");

/** The family, spelled out here independently of the script so that shortening
 *  the script's list is a test failure rather than a silently narrower gate. */
const PRIVILEGED = [
  "pull_request_target",
  "workflow_run",
  "issue_comment",
  "pull_request_review",
  "pull_request_review_comment",
];

const workflows = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));

/** Comments stripped first, for the same reason delivery-contract.test.mjs strips
 *  them: these workflows explain the hazard in prose that names it, and a sentence
 *  about a rule is not a breach of it. A trigger is a mapping key at the start of
 *  a line; that is what this looks for. */
const declared = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

test("the workflow directory is where this thinks it is", () => {
  assert.ok(workflows.length >= 5, `expected this repository's workflows in ${WF_DIR}, found ${workflows.length}.`);
});

test("no workflow uses a privileged trigger", () => {
  for (const name of workflows) {
    const body = declared(readFileSync(join(WF_DIR, name), "utf8"));
    for (const trigger of PRIVILEGED) {
      assert.doesNotMatch(
        body,
        new RegExp(`^\\s*${trigger}\\s*:`, "m"),
        `${name} declares \`${trigger}\`. That starts a job in the base repository's context — holding this ` +
          "repository's advertiser credentials and a writable token — on an event someone outside the repository " +
          "controls. If a change genuinely needs it, that is the operator's call, not a workflow edit."
      );
    }
  }
});

test("the blocking policy still fails on every member of the family", () => {
  // scripts/actions-pin.mjs is what turns the invariant above into a red build.
  // If a name is dropped from its list the workflows can go back to using it and
  // nothing above would catch the first one to try.
  const policy = readFileSync(join(ROOT, "scripts/actions-pin.mjs"), "utf8");
  const block = policy.slice(policy.indexOf("const PRIVILEGED_TRIGGERS = {"));
  assert.ok(block.length > 0, "scripts/actions-pin.mjs no longer declares PRIVILEGED_TRIGGERS — P2 checks nothing.");
  for (const trigger of PRIVILEGED) {
    assert.match(
      block,
      new RegExp(`^\\s*${trigger}:`, "m"),
      `scripts/actions-pin.mjs rule P2 no longer covers \`${trigger}\`, so a workflow may use it and the gate ` +
        "stays green. Restore it, or remove it from this list with the reason in the commit message."
    );
  }
  assert.match(
    policy,
    /PRIVILEGED_TRIGGER_RE\.exec\(l\)/,
    "P2 no longer evaluates the privileged-trigger list against each workflow line — the list would be a comment."
  );
});
