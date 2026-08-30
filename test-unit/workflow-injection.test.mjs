/** No contributor-authored text reaches a shell, an action input or an expression
 *  in this repository's workflows — and the rule that says so cannot be removed in
 *  silence.
 *
 *  scripts/actions-pin.mjs rules P5 and P7 are the gate: P5 fails a `${{ … }}`
 *  spliced into a `run:` body, P7 fails an attacker-controlled context (
 *  `github.event.*`, `github.head_ref`) used anywhere other than an `env:` binding.
 *  This is the assertion that the gate still HAS those rules, and that the tree
 *  still satisfies them — the same pairing test-unit/workflow-triggers.test.mjs
 *  makes for P2, and for the same reason: the cheap way to reintroduce the class is
 *  not to write a dangerous workflow, it is to delete the rule that would have
 *  caught one, and a green build hides that.
 *
 *  Why this repository in particular. `.github/workflows/agent-review.yml` is the
 *  workflow that decides whether a change is safe, and its `judgment` job is the
 *  only place here holding a model key and `pull-requests: write` at the same time.
 *  The rest of the secrets on this repository are live Google Ads / Sklik / Resend
 *  credentials. A workflow that turns a fork's PR title into shell source spends an
 *  advertiser's budget, so "where does contributor text go before it reaches a
 *  shell?" is not a style question.
 *
 *  FOUR INVARIANTS, all of which hold on the tree today:
 *
 *    1. Every `${{ … }}` in every workflow is an `env:` binding. That is the one
 *       shape that is safe everywhere — `run:` makes it shell source, `with:` feeds
 *       it to a third party's action, `if:` evaluates it — so it is the only shape
 *       allowed, and this restates the check independently of the script that
 *       enforces it.
 *    2. No workflow names an attacker-shaped context AT ALL — not even inside an
 *       `env:` binding. An `env:` binding fixes the shape and leaves the exposure:
 *       the value is substituted into the YAML before anything can validate it, it
 *       sits in the environment of every program the step runs, and it is one
 *       unquoted expansion away from being shell words again. The event payload is
 *       already a JSON file on the runner (`$GITHUB_EVENT_PATH`), so the field can
 *       be read from disk instead — scripts/workflow-event.mjs, and the `jq` in the
 *       runner image for the one job that may not execute repository code yet.
 *       That is rule P9.
 *    3. scripts/actions-pin.mjs still evaluates P5, P7 and P9, and P7's list of
 *       untrusted contexts is still the full one. The contexts are spelled out here
 *       so that shortening the script's list is a test failure rather than a
 *       silently narrower gate.
 *    4. agent-review.yml's `judgment` job moves its working tree to the base
 *       revision BEFORE it runs anything out of the checkout. The job's comments
 *       explain that invariant at length; nothing asserted it, so a reordered step
 *       would have run the change's own code with the key already in the
 *       environment.
 *
 *  `npm run test:unit` is inside `npm run check:ci`, which CI runs and
 *  .husky/pre-push runs before any push that updates master — so this fails on the
 *  disarmer's own machine, before the release, rather than in a comment afterwards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");
const POLICY = join(ROOT, "scripts", "actions-pin.mjs");

/** The contexts an outsider writes. Declared here independently of the script, so
 *  dropping one from scripts/actions-pin.mjs is a red test and not a quieter gate. */
const UNTRUSTED_CONTEXTS = ["github.event.", "github.head_ref"];

const workflows = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));

/** A comment-only line is blanked rather than dropped, so line numbers in a failure
 *  message still point at the file. These workflows explain the hazard in prose that
 *  quotes it — `${{ … }}` and `github.event.*` both appear in their comments — and a
 *  sentence about a rule is not a breach of it. scripts/actions-pin.mjs skips
 *  comments for the same reason. */
const uncommented = (text) => text.split(/\r?\n/).map((l) => (/^\s*#/.test(l) ? "" : l));

/** The column of a `key:` that opens a block, or -1. Mirrors the script: a step's
 *  `- env:` carries the dash in its own indentation. */
const keyColumn = (line, key) => {
  const m = new RegExp(`^(\\s*)(-\\s+)?${key}:\\s*$`).exec(line);
  return m ? m[1].length + (m[2] ? m[2].length : 0) : -1;
};

test("the workflow directory is where this thinks it is", () => {
  assert.ok(workflows.length >= 5, `expected this repository's workflows in ${WF_DIR}, found ${workflows.length}.`);
});

test("every `${{ … }}` in every workflow is an `env:` binding", () => {
  for (const name of workflows) {
    const lines = uncommented(readFileSync(join(WF_DIR, name), "utf8"));
    let envCol = -1;

    lines.forEach((line, i) => {
      const bare = line.replace(/^\s*/, "");
      if (bare === "") return;
      const indent = line.length - bare.length;

      // A non-blank line at or left of the key's own column closes the block.
      if (envCol !== -1 && indent <= envCol) envCol = -1;

      const col = keyColumn(line, "env");
      if (col !== -1) {
        envCol = col;
        return;
      }
      if (envCol !== -1) return; // inside `env:` — the binding, which is the safe shape

      assert.ok(
        !line.includes("${{"),
        `${name}:${i + 1}: a \`\${{ … }}\` expression appears outside an \`env:\` binding:\n\n    ${bare}\n\n` +
          "GitHub substitutes an expression into the line's TEXT before any shell, action or `if:` evaluates it, " +
          "so a value an outsider controls — a fork's branch name, a PR title, an issue body — is not an " +
          "argument, it is source, running in a job that holds this repository's advertiser credentials. " +
          'Bind it in the step\'s `env:` and reference "$VAR". Enforced by scripts/actions-pin.mjs rules P5/P7.'
      );
    });
  }
});

test("no workflow names an attacker-shaped context at all, `env:` included", () => {
  // P9. The shape rule above says where such a value may appear; this says it may
  // not appear. The fix for a failure here is never to move the expression to a
  // safer line — it is to read the field out of the payload GitHub already wrote
  // to the runner, which is what scripts/workflow-event.mjs does.
  for (const name of workflows) {
    const lines = uncommented(readFileSync(join(WF_DIR, name), "utf8"));
    lines.forEach((line, i) => {
      for (const ctx of UNTRUSTED_CONTEXTS) {
        assert.ok(
          !line.includes(ctx),
          `${name}:${i + 1}: \`${ctx}\` appears in the workflow:\n\n    ${line.trim()}\n\n` +
            "An `env:` binding fixes the shape of this hazard and not the exposure — the value is substituted " +
            "into the YAML before anything can validate it, it lands in the environment of every program the " +
            "step runs, and it is one unquoted expansion from being shell words in a job holding this " +
            "repository's advertiser credentials. Read the field from `$GITHUB_EVENT_PATH` instead: " +
            "`node scripts/workflow-event.mjs --get <field> --out <file>`. Enforced by scripts/actions-pin.mjs " +
            "rule P9."
        );
      }
    });
  }
});

test("the reader that replaces those bindings exists and reads the payload from disk", () => {
  // P9 is only a real practice if there is somewhere for the value to come from.
  // Without this the rule is satisfiable by deleting the feature that needed the
  // field, which is not the same thing.
  const helper = join(ROOT, "scripts", "workflow-event.mjs");
  const text = readFileSync(helper, "utf8");
  assert.match(
    text,
    /process\.env\.GITHUB_EVENT_PATH/,
    "scripts/workflow-event.mjs no longer reads $GITHUB_EVENT_PATH — the workflows have nowhere to get the " +
      "event's fields from except an expression, and P9 forbids that."
  );
  assert.match(
    text,
    /const REF_RE = /,
    "scripts/workflow-event.mjs no longer validates what it writes back. `--base-ref` appends to $GITHUB_OUTPUT, " +
      "and a newline in a value there forges a second output line for every later step to trust."
  );

  const review = readFileSync(join(WF_DIR, "agent-review.yml"), "utf8");
  assert.match(
    review,
    /--get pull_request\.body --out pr-body\.txt/,
    "agent-review.yml no longer takes the PR body from the payload file. That body is free text an outsider " +
      "writes and it is what the `Ack:` escape hatch is read out of — it must reach the reviewer as a file, " +
      "not as an environment variable."
  );
  assert.match(
    review,
    /--body-file pr-body\.txt/,
    "the mechanical review is no longer handed pr-body.txt, so an `Ack:` line in a PR body would stop " +
      "unblocking rubric A3/A4 — the rule would be enforced with its escape hatch gone."
  );
});

test("the blocking policy still evaluates P5, P7 and P9", () => {
  // scripts/actions-pin.mjs is what turns the invariants above into a red build. If
  // its rules stop being evaluated the workflows can go back to splicing an
  // expression into a shell and nothing above would catch the first one to try.
  const policy = readFileSync(POLICY, "utf8");

  for (const [rule, needles] of [
    ["P5 (no expression inside a `run:` body)", [/RUN_RE\.exec\(l\)/, /EXPR_RE\.test\(/]],
    ["P7 (untrusted context only in an `env:` binding)", [/ENV_RE\.exec\(l\)/, /UNTRUSTED_RE\.test\(/]],
    ["P9 (untrusted context nowhere in a workflow, `env:` included)", [/if \(!UNTRUSTED_RE\.test\(l\)\) return;/]],
  ]) {
    for (const needle of needles) {
      assert.match(
        policy,
        needle,
        `scripts/actions-pin.mjs no longer evaluates rule ${rule} (missing ${needle}) — the rule would be a ` +
          "comment, and a workflow that splices contributor text into a shell would pass the gate."
      );
    }
  }

  const decl = /const UNTRUSTED_RE = (.+);/.exec(policy)?.[1] ?? "";
  assert.ok(decl, "scripts/actions-pin.mjs no longer declares UNTRUSTED_RE — P7 has nothing to match against.");
  // The declaration is a regular expression; compare on its literal text with the
  // escaping removed, so `/github\.event\./` still reads as `github.event.` here.
  const literal = decl.replace(/\\/g, "");
  for (const ctx of UNTRUSTED_CONTEXTS) {
    assert.ok(
      literal.includes(ctx),
      `scripts/actions-pin.mjs rule P7 no longer covers \`${ctx}\`, so a workflow may use it outside an \`env:\` ` +
        "binding and the gate stays green. Restore it, or remove it from this list with the reason in the " +
        "commit message."
    );
  }
});

test("the review job holding a key and a write scope wipes to base before running the checkout", () => {
  // .github/workflows/agent-review.yml § `judgment`: the change enters that job as
  // `git diff` output, which is data — never as files it might load. `node` does not
  // treat a tree as inert (the nearest package.json decides module type and the
  // `imports` map for every specifier the reviewer resolves), so the order of these
  // two steps is the whole guarantee.
  const text = readFileSync(join(WF_DIR, "agent-review.yml"), "utf8");
  const lines = uncommented(text);

  const jobStart = lines.findIndex((l) => /^ {2}judgment:\s*$/.test(l));
  assert.notEqual(
    jobStart,
    -1,
    "agent-review.yml no longer declares a `judgment:` job. If the judgment half moved, move this assertion with " +
      "it — the invariant belongs to whichever job holds ANTHROPIC_API_KEY and `pull-requests: write`."
  );
  const after = lines.slice(jobStart + 1).findIndex((l) => /^ {2}\S/.test(l));
  const job = lines.slice(jobStart, after === -1 ? lines.length : jobStart + 1 + after);

  assert.ok(
    job.some((l) => /pull-requests:\s*write/.test(l)),
    "the `judgment` job no longer asks for `pull-requests: write`. That is a good change if it is deliberate — " +
      "update this test to name whichever job now holds the write scope and the model key."
  );

  const wipe = job.findIndex((l) => /^\s*git clean\b/.test(l));
  assert.notEqual(
    wipe,
    -1,
    "the `judgment` job no longer wipes its working tree (`git clean -ffdx`) after checking the base out. It " +
      "holds ANTHROPIC_API_KEY and `pull-requests: write`, and the checkout is the change's own tree — without " +
      "the wipe, the thing under review chooses the program that reads it."
  );
  assert.ok(
    job.slice(0, wipe).some((l) => /^\s*git checkout --force --detach\b/.test(l)),
    "the `judgment` job cleans without first checking out the base revision — the wipe is what makes the tree " +
      "the BASE, not merely empty."
  );

  const runsRepoCode = job.findIndex((l) => /(^|\s)(node|npm|npx)\s/.test(l));
  assert.ok(
    runsRepoCode === -1 || runsRepoCode > wipe,
    `the \`judgment\` job runs \`${(job[runsRepoCode] ?? "").trim()}\` BEFORE it moves its working tree to the ` +
      "base revision. That job holds a model key and a write token, and at that point the tree on disk is the " +
      "change's — so the change would be choosing the program that reviews it. Move the step below " +
      "`git clean -ffdx`."
  );
});
