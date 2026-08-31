#!/usr/bin/env node
/** GitHub Actions supply-chain policy for .github/workflows (zero-dependency).
 *
 *  Runs blocking in CI (.github/workflows/sast.yml, job `workflow-policy`) on
 *  every push and pull request, and locally via `npm run actions:check`.
 *
 *  A workflow step is arbitrary code from someone else's repository, executed in
 *  a runner that holds a GITHUB_TOKEN. `uses: owner/action@v3` resolves a MUTABLE
 *  tag: whoever controls that repository can repoint it at any commit, and the
 *  next CI run executes it. The defence is a commit SHA, which cannot be moved.
 *
 *  Rung discipline (ADR-0007) — these BLOCK, because they pass today:
 *
 *    P1  Every workflow declares a top-level `permissions:` block. Unset means
 *        the repository default, which on many repositories is write.
 *    P2  No PRIVILEGED TRIGGER — a trigger that starts a job in the BASE
 *        repository's context, holding its token and its secrets, on an event
 *        somebody outside the repository controls.
 *
 *        `pull_request_target` is the famous member: combined with a checkout of
 *        the PR head it is the standard way repositories get their secrets stolen
 *        by a fork. But it is a FAMILY, and a rule that names only the instance
 *        leaves the class open — which matters here, because the next workflow
 *        added to this repository is likely to be written by an agent reaching for
 *        whatever trigger makes its idea work.
 *
 *          workflow_run                 re-enters the privileged context AFTER an
 *                                       untrusted workflow has run, and inherits
 *                                       the artifacts it chose to leave behind.
 *          issue_comment                fires on text anyone with a GitHub
 *          pull_request_review          account can write, in a job that holds
 *          pull_request_review_comment  live Google Ads / Sklik / Resend
 *                                       credentials.
 *
 *        None of them are in use today, which is what makes this blocking rather
 *        than a ratchet (ADR-0007). If a change genuinely needs one, it needs the
 *        operator's decision — there is no flag here that turns the rule off, and
 *        the fix is never to widen this list to make your own workflow pass.
 *    P3  No action pinned to a moving branch (`@main`, `@master`, `@HEAD`).
 *    P4  Every THIRD-PARTY action (anything not owned by `actions` or `github`)
 *        is pinned to a full 40-character commit SHA. First-party GitHub actions
 *        may still ride a version tag — see below.
 *    P5  No `${{ … }}` expression inside a `run:` body. GitHub substitutes the
 *        expression into the script TEXT before any shell parses it, so a value
 *        an outsider controls — a fork's branch name, a PR title, an issue body —
 *        is not a string argument, it is source code, running in a job that holds
 *        this repository's tokens. The fix is always the same shape: bind the
 *        expression in the step's `env:` block and reference "$VAR" in the script,
 *        where the shell treats it as data.
 *    P7  An ATTACKER-CONTROLLED context (`github.event.*`, `github.head_ref`) may
 *        appear ONLY as an `env:` binding — never in `run:`, `with:`, `if:` or a
 *        job name. P5 covers the shell case, which is the famous one; it is not
 *        the only one. `with:` feeds a third party's action, and `actions/github-script`
 *        evaluates its `script:` input as JavaScript, so the same PR title that is
 *        harmless as "$TITLE" is code there. Binding in `env:` is the one shape
 *        that is safe everywhere, so this makes it the only shape allowed.
 *    P8  Container images are pinned by DIGEST. A `uses: docker://image:tag` step
 *        and a `container:`/`services:` `image:` are the same mutable-reference
 *        problem as an action on a tag, except the thing behind the tag is a whole
 *        root filesystem. `image@sha256:…` cannot be moved. There are none in this
 *        repository today; the rule is what keeps the first one honest.
 *    P9  An ATTACKER-SHAPED context does not enter a workflow AT ALL. P7 makes
 *        `env:` the only allowed shape, which is where the standard advice stops —
 *        and it fixes the shape without removing the exposure. The substitution
 *        still happens before anything can validate the value; the value still
 *        lands in the process environment of every program the step runs; and it
 *        is still one unquoted expansion (`printf %s $BODY`) away from being
 *        parsed as shell words by whoever edits the step next. On this repository
 *        those jobs hold live Google Ads / Sklik / Resend credentials and a model
 *        key, so "safe as long as every reference stays quoted forever" is a
 *        weaker guarantee than the value never arriving.
 *
 *        GitHub already writes the whole event payload to a JSON file on the
 *        runner and names it in `GITHUB_EVENT_PATH`. Reading it there is the same
 *        data with none of the substitution: `scripts/workflow-event.mjs` picks a
 *        field and writes it to a file, so contributor text is a JSON string and
 *        then a file, and never an argument, a variable, or a line of YAML. So
 *        `github.event.*` and `github.head_ref` may not appear in a workflow at
 *        all — including inside `env:`. P7 stays as the backstop for the shape, in
 *        case a value ever has to come back through a binding: a narrower rule
 *        that still holds is worth more than one deleted because a wider one
 *        covers it today. Asserted from the other side by
 *        test-unit/workflow-injection.test.mjs.
 *
 *  And this REPORTS: first-party actions still on a version tag. The repo depends
 *  on actions/checkout, actions/setup-node, actions/upload-artifact and
 *  actions/download-artifact; those tags are moved by GitHub itself, so the
 *  exposure is materially different from a random marketplace action. Pinning them
 *  is still better, and `--update` resolves every tag to its SHA in one pass (it
 *  needs network). Promote P4 to cover first-party actions — set STRICT below to
 *  true — once that has been run and Dependabot's `github-actions` ecosystem is
 *  keeping the pins fresh.
 *
 *  BE CLEAR ABOUT WHAT THAT MEANS TODAY: every `uses:` in this repository is
 *  first-party, so STRICT = false and RATCHET.pinned = 0 together mean the count
 *  this script prints is "0 of N pinned" and the gate is green anyway. That is a
 *  deliberate exemption, not an oversight — and it is the only rule here that is
 *  green by exemption rather than by compliance. Closing it is ONE networked run:
 *
 *      npm run actions:pin        # resolves each tag to its digest, rewrites the
 *                                 # workflows, AND writes STRICT = true and
 *                                 # RATCHET.pinned = <count> back into this file
 *      npm run actions:check      # must print "N of N" and stay green
 *      # commit the workflows and this file together
 *
 *  The three-step version of that close sat undone for months, and step one alone
 *  is worse than nothing: pins that nothing enforces come undone on the next
 *  Dependabot bump or copy-pasted step, and then the exemption is back without
 *  anyone choosing it. So `--update` no longer leaves the door for someone else to
 *  shut — it pins and enforces in the same pass, and the diff a reviewer reads
 *  contains both halves or neither.
 *
 *  P6 is the ratchet that makes that a one-way door: the number of SHA-pinned refs
 *  may never fall below RATCHET.pinned. Run `npm run actions:pin` once (it needs
 *  network), raise the baseline to what it printed, and pinning can no longer be
 *  undone by a Dependabot bump, a copy-pasted step, or an agent "simplifying" a
 *  40-character ref back to `@v4`. Lowering the baseline is the only way back, and
 *  that is a diff a reviewer sees.
 *
 *  Usage:
 *    node scripts/actions-pin.mjs            # check (exit 1 on a violation)
 *    node scripts/actions-pin.mjs --summary FILE
 *    node scripts/actions-pin.mjs --update   # resolve tags → SHAs, rewrite files
 *
 *  Runs blocking in CI (sast.yml, job `workflow-policy` — a required check, see
 *  .github/required-checks.json) and inside `npm run check:ci`, which the pre-push
 *  hook runs before any push to master.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");

/** Flip to true once every first-party `uses:` carries a SHA (see header). */
const STRICT = false;

/** P6 — monotonic floor on SHA-pinned refs. Raise it in the same commit that runs
 *  `npm run actions:pin`; never lower it without saying why in the commit. */
const RATCHET = { pinned: 0 };

const argv = process.argv.slice(2);
const UPDATE = argv.includes("--update");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

const FIRST_PARTY = new Set(["actions", "github"]);
/** P2 — triggers that run in the base repository's privileged context on an event
 *  an outsider controls. Keyed by trigger name, valued by the sentence a violation
 *  prints, so the message says WHY rather than only which rule fired. */
const PRIVILEGED_TRIGGERS = {
  pull_request_target:
    "runs a fork's pull request with a writable token and this repository's secrets in the base repo's context.",
  workflow_run:
    "re-enters the base repo's privileged context after an untrusted workflow has run, and can be handed the artifacts it left.",
  issue_comment:
    "fires on comment text anyone with a GitHub account can write, in a job holding this repository's credentials.",
  pull_request_review:
    "fires on review text from outside the repository, in a job holding this repository's credentials.",
  pull_request_review_comment:
    "fires on review-comment text from outside the repository, in a job holding this repository's credentials.",
};
/** Anchored to the key at the start of its line, so prose that NAMES a forbidden
 *  trigger — in these workflows, in SECURITY.md, in this file — is not itself a
 *  violation. A trigger is a mapping key; a sentence about one is not. */
const PRIVILEGED_TRIGGER_RE = new RegExp(`^\\s*(${Object.keys(PRIVILEGED_TRIGGERS).join("|")})\\s*:`);
const USES_RE = /^(\s*(?:-\s*)?uses:\s*)([^\s#]+)(.*)$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const MOVING = new Set(["main", "master", "HEAD"]);
/** P5: the `run:` key, with its leading dash captured so the KEY's column can be
 *  computed — a block scalar's body is everything indented past that column. */
const RUN_RE = /^(\s*)(-\s+)?run:\s*(.*)$/;
const EXPR_RE = /\$\{\{/;
/** P7: the `env:` key, whose body is the ONE place an untrusted context may be
 *  named, and the contexts that count as untrusted. `github.event.` needs the
 *  trailing dot so it does not swallow `github.event_name`, which is a fixed
 *  vocabulary of GitHub's own words rather than anything a contributor writes. */
const ENV_RE = /^(\s*)(-\s+)?env:\s*$/;
const UNTRUSTED_RE = /github\.event\.|github\.head_ref/;
/** P8: a container reference — `uses: docker://…` and the `image:` of a
 *  `container:` or a `services:` entry. */
const IMAGE_RE = /^\s*(?:-\s+)?image:\s*(\S+)/;
const DIGEST_RE = /@sha256:[0-9a-f]{64}$/;

if (!existsSync(WF_DIR)) {
  console.error(`✗ actions policy: ${WF_DIR} does not exist.`);
  process.exit(1);
}

const workflows = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));

const violations = [];
const reported = [];
const inventory = [];

for (const name of workflows) {
  const path = join(WF_DIR, name);
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);

  // P1 — a top-level key sits at column 0.
  if (!lines.some((l) => /^permissions:(\s|$)/.test(l))) {
    violations.push(`${name}: no top-level \`permissions:\` block — the job inherits the repository default token scope.`);
  }

  // P2 — a privileged trigger, any member of the family.
  lines.forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    const m = PRIVILEGED_TRIGGER_RE.exec(l);
    if (!m) return;
    violations.push(`${name}:${i + 1}: \`${m[1]}\` — ${PRIVILEGED_TRIGGERS[m[1]]}`);
  });

  // P5 — script injection. Walk the file tracking whether we are inside a `run:`
  // body, and flag any expression that would be spliced into the script text.
  // Comments inside a script are skipped: a line documenting the hazard is not
  // the hazard.
  {
    let runCol = -1; // column of the `run:` key whose block we are inside, or -1
    lines.forEach((l, i) => {
      const bare = l.replace(/^\s*/, "");
      const indent = l.length - bare.length;

      // A non-blank line at or left of the key's own column ends the block.
      if (runCol !== -1 && bare !== "" && indent <= runCol) runCol = -1;

      const m = RUN_RE.exec(l);
      if (m) {
        const inline = m[3];
        const isBlock = inline === "" || /^[|>]/.test(inline);
        if (isBlock) runCol = m[1].length + (m[2] ? m[2].length : 0);
        else if (EXPR_RE.test(inline)) {
          violations.push(
            `${name}:${i + 1}: a \`\${{ … }}\` expression is interpolated into a \`run:\` command — ` +
              "it becomes shell source, not an argument. Bind it in the step's `env:` and use \"$VAR\"."
          );
        }
        return;
      }

      if (runCol === -1) return;
      if (bare.startsWith("#")) return;
      if (EXPR_RE.test(l)) {
        violations.push(
          `${name}:${i + 1}: a \`\${{ … }}\` expression is interpolated into a \`run:\` script — ` +
            "it becomes shell source, not an argument. Bind it in the step's `env:` and use \"$VAR\"."
        );
      }
    });
  }

  // P7 — an untrusted context outside an `env:` binding. Same block-tracking shape
  // as P5 above: remember the column of the `env:` key we are inside, and treat
  // everything indented past it as the binding block. Comments are skipped for the
  // same reason as there — the workflows in this repo explain the hazard in prose
  // that quotes it, and a sentence about a rule is not a breach of it.
  {
    let envCol = -1;
    lines.forEach((l, i) => {
      const bare = l.replace(/^\s*/, "");
      if (bare === "" || bare.startsWith("#")) return;
      const indent = l.length - bare.length;

      if (envCol !== -1 && indent <= envCol) envCol = -1;

      const m = ENV_RE.exec(l);
      if (m) {
        envCol = m[1].length + (m[2] ? m[2].length : 0);
        return;
      }
      if (envCol !== -1) return; // inside `env:` — a binding, which is the safe shape
      if (UNTRUSTED_RE.test(l)) {
        violations.push(
          `${name}:${i + 1}: an attacker-controlled context is used outside an \`env:\` binding — ` +
            "a fork controls that text, and here it reaches a shell, an action input or an expression as itself. " +
            "Bind it in the step's `env:` and reference \"$VAR\"."
        );
      }
    });
  }

  // P9 — an attacker-shaped context anywhere in the file, `env:` included. P7
  // above already fails the dangerous SHAPES; this fails the value's presence, so
  // the fix is to read the field out of `$GITHUB_EVENT_PATH` (scripts/workflow-event.mjs)
  // rather than to move the expression to a safer line. Comments are skipped for
  // the same reason as P5 and P7: these workflows explain the hazard in prose that
  // names it, and a sentence about a rule is not a breach of it.
  lines.forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    if (!UNTRUSTED_RE.test(l)) return;
    violations.push(
      `${name}:${i + 1}: an attacker-shaped context (\`github.event.*\` / \`github.head_ref\`) appears in the ` +
        "workflow. An `env:` binding fixes the shape and not the exposure — the value is still substituted into " +
        "the YAML before anything can check it, and still sits in the environment of every program the step runs. " +
        "Read the field out of `$GITHUB_EVENT_PATH` instead: `node scripts/workflow-event.mjs --get <field> " +
        "--out <file>`."
    );
  });

  // P8 — a `container:` / `services:` image on a mutable tag.
  lines.forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    const m = IMAGE_RE.exec(l);
    if (!m) return;
    const image = m[1].replace(/^["']|["']$/g, "");
    if (!DIGEST_RE.test(image)) {
      violations.push(
        `${name}:${i + 1}: container image \`${image}\` is not pinned by digest. ` +
          "A tag is a mutable pointer to a whole root filesystem — pin `image@sha256:…`."
      );
    }
  });

  lines.forEach((l, i) => {
    const m = USES_RE.exec(l);
    if (!m) return;
    const ref = m[2];
    if (ref.startsWith("./")) return; // a step from this repository
    if (ref.startsWith("docker://")) {
      // P8, the `uses:` spelling of the same thing.
      if (!DIGEST_RE.test(ref)) {
        violations.push(
          `${name}:${i + 1}: \`${ref}\` runs a container from a mutable tag. Pin it by digest (\`@sha256:…\`).`
        );
      }
      return;
    }

    const at = ref.lastIndexOf("@");
    const action = at === -1 ? ref : ref.slice(0, at);
    const version = at === -1 ? "" : ref.slice(at + 1);
    const owner = action.split("/")[0];
    const firstParty = FIRST_PARTY.has(owner);

    inventory.push({ workflow: name, line: i + 1, action, version, firstParty });

    if (!version) {
      violations.push(`${name}:${i + 1}: \`${ref}\` has no version at all — it resolves to the default branch.`);
      return;
    }
    if (MOVING.has(version)) {
      violations.push(`${name}:${i + 1}: \`${ref}\` tracks a moving branch. Pin a tag, or better a SHA.`);
      return;
    }
    if (SHA_RE.test(version)) return; // pinned

    if (!firstParty || STRICT) {
      violations.push(
        `${name}:${i + 1}: \`${ref}\` is a ${firstParty ? "first-party" : "third-party"} action on a mutable tag. ` +
          `Pin it to a commit SHA (\`npm run actions:pin\`).`
      );
    } else {
      reported.push(`${name}:${i + 1}: ${ref} (first-party, tag-pinned)`);
    }
  });
}

// --- --update: resolve every tag to a SHA and rewrite in place ---------------

if (UPDATE) {
  const cache = new Map();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  async function resolve(action, tag) {
    const key = `${action}@${tag}`;
    if (cache.has(key)) return cache.get(key);
    const headers = { accept: "application/vnd.github+json", "user-agent": "adamant-actions-pin" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/repos/${action}/commits/${tag}`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${key}`);
    const body = await res.json();
    const sha = body?.sha;
    if (!SHA_RE.test(String(sha))) throw new Error(`no commit sha in the response for ${key}`);
    cache.set(key, sha);
    return sha;
  }

  let rewritten = 0;
  for (const name of workflows) {
    const path = join(WF_DIR, name);
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = USES_RE.exec(lines[i]);
      if (!m) continue;
      const ref = m[2];
      if (ref.startsWith("./") || ref.startsWith("docker://")) continue;
      const at = ref.lastIndexOf("@");
      if (at === -1) continue;
      const action = ref.slice(0, at);
      const version = ref.slice(at + 1);
      if (SHA_RE.test(version)) continue;
      const sha = await resolve(action, version);
      // Keep the human-readable version in a trailing comment; Dependabot reads it
      // to offer the next bump, and a reviewer needs to know what the SHA means.
      lines[i] = `${m[1]}${action}@${sha} # ${version}`;
      rewritten++;
      console.log(`  ${name}:${i + 1}  ${action}@${version} → ${sha}`);
    }
    writeFileSync(path, lines.join("\n"));
  }
  console.log(`\n✓ pinned ${rewritten} action reference(s).`);

  // Shut the door in the same pass. Pinning without enforcing is the state this
  // repository has been in since the rule landed: the pins would come undone on
  // the next bump and nothing would notice, because the exemption (STRICT = false,
  // RATCHET.pinned = 0) is what makes "0 of N pinned" a green run. Writing both
  // back here means the exemption ends in the same diff that earns the right to
  // end it — and a reviewer sees the two halves together or not at all.
  if (rewritten) {
    const selfPath = fileURLToPath(import.meta.url);
    const self = readFileSync(selfPath, "utf8");
    const total = inventory.length;
    const updated = self
      .replace(/^const STRICT = false;$/m, "const STRICT = true;")
      .replace(/^const RATCHET = \{ pinned: \d+ \};$/m, `const RATCHET = { pinned: ${total} };`);
    if (updated !== self) {
      writeFileSync(selfPath, updated);
      console.log(
        `✓ scripts/actions-pin.mjs: STRICT = true, RATCHET.pinned = ${total} — first-party actions are now ` +
          "required to carry a SHA, and the count may never fall below this floor."
      );
    } else {
      console.log(
        "⚠ could not write STRICT/RATCHET back into scripts/actions-pin.mjs (were they already set?). " +
          "Check them by hand before committing — pins that nothing enforces come undone."
      );
    }
  }
  console.log("\nNow run `npm run actions:check`: it must print \"N of N\" and stay green. Commit both files.");
  process.exit(0);
}

// --- report -----------------------------------------------------------------

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

say(`Actions policy — ${workflows.length} workflow(s), ${inventory.length} action reference(s)`);
say("");
for (const i of inventory) {
  const kind = SHA_RE.test(i.version) ? "sha" : i.firstParty ? "tag (first-party)" : "tag (third-party)";
  say(`  ${i.workflow}:${i.line}  ${i.action}@${i.version}  [${kind}]`);
}

// P6 — the pinning ratchet.
const pinnedCount = inventory.filter((i) => SHA_RE.test(i.version)).length;
say("");
say(`  SHA-pinned: ${pinnedCount} of ${inventory.length} (floor ${RATCHET.pinned})`);
if (pinnedCount < RATCHET.pinned) {
  violations.push(
    `SHA-pinned action refs fell to ${pinnedCount}, below the floor of ${RATCHET.pinned}. ` +
      "A pin was replaced by a mutable tag — restore it (`npm run actions:pin`), or lower the floor in " +
      "scripts/actions-pin.mjs with the reason in the commit message."
  );
} else if (pinnedCount < inventory.length) {
  say(
    `  → ${inventory.length - pinnedCount} ref(s) still on a mutable tag. \`npm run actions:pin\` resolves every ` +
      "one to its digest (needs network); then raise RATCHET.pinned to what this line prints."
  );
}

if (reported.length) {
  say("");
  say(`⚠ ${reported.length} first-party action(s) on a version tag — allowed today, see scripts/actions-pin.mjs.`);
}

if (violations.length) {
  say("");
  say(`✗ ${violations.length} policy violation(s):`);
  for (const v of violations) say(`  • ${v}`);
  printRemedy("actions:check", say);
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### Actions policy\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

if (violations.length) process.exit(1);
say("");
say(
  `✓ actions policy: permissions declared, none of the ${Object.keys(PRIVILEGED_TRIGGERS).length} privileged ` +
    "triggers, no moving-branch refs, " +
    "third-party actions pinned, container images digest-pinned, and no attacker-shaped context anywhere in a " +
    "workflow — not spliced into a `run:` script, a `with:` input or an `if:`, and not bound in `env:` either. " +
    "The event payload is read from `$GITHUB_EVENT_PATH` (scripts/workflow-event.mjs)."
);
