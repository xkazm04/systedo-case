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
 *
 *  And this REPORTS: first-party actions still on a version tag. The repo depends
 *  on actions/checkout, actions/setup-node and actions/upload-artifact; those tags
 *  are moved by GitHub itself, so the exposure is materially different from a
 *  random marketplace action. Pinning them is still better, and `--update`
 *  resolves every tag to its SHA in one pass (it needs network). Promote P4 to
 *  cover first-party actions — set STRICT below to true — once that has been run
 *  and Dependabot's `github-actions` ecosystem is keeping the pins fresh.
 *
 *  Usage:
 *    node scripts/actions-pin.mjs            # check (exit 1 on a violation)
 *    node scripts/actions-pin.mjs --summary FILE
 *    node scripts/actions-pin.mjs --update   # resolve tags → SHAs, rewrite files
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");

/** Flip to true once every first-party `uses:` carries a SHA (see header). */
const STRICT = false;

const argv = process.argv.slice(2);
const UPDATE = argv.includes("--update");
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

const FIRST_PARTY = new Set(["actions", "github"]);
const USES_RE = /^(\s*(?:-\s*)?uses:\s*)([^\s#]+)(.*)$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const MOVING = new Set(["main", "master", "HEAD"]);

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
  console.log(`\n✓ pinned ${rewritten} action reference(s). Re-run without --update to verify, then set STRICT = true.`);
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
say("✓ actions policy: permissions declared, no pull_request_target, no moving-branch refs, third-party actions pinned.");
