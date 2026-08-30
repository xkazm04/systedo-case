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
 *    P2  No `pull_request_target`. It runs with a writable token in the base
 *        repository's context, and combined with a checkout of the PR head it is
 *        the standard way repositories get their secrets stolen by a fork.
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
const USES_RE = /^(\s*(?:-\s*)?uses:\s*)([^\s#]+)(.*)$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const MOVING = new Set(["main", "master", "HEAD"]);
/** P5: the `run:` key, with its leading dash captured so the KEY's column can be
 *  computed — a block scalar's body is everything indented past that column. */
const RUN_RE = /^(\s*)(-\s+)?run:\s*(.*)$/;
const EXPR_RE = /\$\{\{/;

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

  // P2
  lines.forEach((l, i) => {
    if (/^\s*pull_request_target\s*:/.test(l)) {
      violations.push(`${name}:${i + 1}: pull_request_target — runs a fork's PR with a writable token in the base repo's context.`);
    }
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

  lines.forEach((l, i) => {
    const m = USES_RE.exec(l);
    if (!m) return;
    const ref = m[2];
    if (ref.startsWith("./") || ref.startsWith("docker://")) return; // local / container step

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
  console.log(
    `\n✓ pinned ${rewritten} action reference(s). Re-run without --update to verify, then RAISE ` +
      "RATCHET.pinned to the count it prints (so the pins cannot silently come undone) and set STRICT = true."
  );
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
  "✓ actions policy: permissions declared, no pull_request_target, no moving-branch refs, " +
    "third-party actions pinned, no expression interpolated into a `run:` script."
);
