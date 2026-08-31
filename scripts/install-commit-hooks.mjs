#!/usr/bin/env node
/** Install the two commit-message hooks, on `npm install` (zero-dependency).
 *
 *  THE GAP THIS CLOSES. scripts/commit-attribution.mjs describes two hooks —
 *  `.husky/prepare-commit-msg`, which appends the authorship trailer, and
 *  `.husky/commit-msg`, which refuses a commit that still has none and applies
 *  the rubric A5 subject rules while the message is still free to change. Both
 *  were documented as a `printf` a maintainer was expected to run by hand, in a
 *  comment at the top of scripts/commit-check.mjs, ending "not committed yet".
 *  Nobody ran it. The result is the thing the log actually shows: ~97% agent
 *  authorship and roughly one commit in thirty that says so, and subjects that
 *  narrate the session surviving until a diff-time gate sees them, by which
 *  point fixing one means rewriting history.
 *
 *  A hook that has to be installed by hand is not a control, it is a suggestion.
 *  So `npm install` installs it: `prepare` runs `husky` and then this file, in
 *  every checkout, without anyone remembering.
 *
 *  WHAT IT WILL AND WILL NOT OVERWRITE. Each hook carries a MANAGED marker line.
 *  A missing hook is written; a hook carrying the marker is refreshed, so a
 *  change here reaches existing checkouts on the next install; a hook a human
 *  has edited (no marker) is LEFT ALONE and reported. Your local customisation
 *  is not something an installer gets to delete.
 *
 *  FAILS OPEN, ALWAYS. This runs inside `npm install`. A packaging step that can
 *  refuse an install is worse than an unenforced hook, so every error here is
 *  printed and swallowed — exit code 0 no matter what. `--check` is the mode
 *  that reports a non-zero status, and it is for a human asking "is my checkout
 *  wired?", not for `check:ci`: hooks live outside the tree a CI checkout uses
 *  and a runner never commits, so making CI red over them would fail the build
 *  in the one place the hooks cannot matter.
 *
 *  WHAT IT CANNOT DO — and this is the honest half. A lane that commits in a
 *  throwaway worktree where nobody ran `npm install` runs no hooks at all, which
 *  is the same hole rubric A5 has. That is why `npm run commit:check -- --range`
 *  reports attribution coverage over history and why scripts/agent-review.mjs
 *  lists a change's unattributed commits: a count that is visible can be argued
 *  with, one that nobody keeps cannot.
 *
 *  Usage:
 *    node scripts/install-commit-hooks.mjs           # install / refresh (always exit 0)
 *    node scripts/install-commit-hooks.mjs --check   # report only; exit 1 if not wired
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The line that says "this file is generated, refreshing it is safe". Removing
 *  it from a hook is how you tell this installer to keep its hands off. */
export const MANAGED_MARKER = "# managed by scripts/install-commit-hooks.mjs — delete this line to own the file";

/** The hooks, by filename. Bodies are `sh`, because that is what git runs and
 *  what the hooks already in .husky/ use. */
export const HOOKS = {
  "prepare-commit-msg": `#!/usr/bin/env sh
${MANAGED_MARKER}
#
# Machine-readable authorship AND provenance, without anyone remembering.
#
# ~97% of the commits here are agent-written and the log cannot say which, so a
# commit made while an agent session is driving gets a \`Co-Authored-By:\` trailer
# below a blank line. A PERSON'S commit gets none: the detection is
# environment-based on purpose (scripts/commit-attribution.mjs), because claiming
# an assistant wrote a human's commit is the same lie in the other direction.
#
# And "an assistant wrote it" is not the fact you want three weeks later, when
# nearly every commit has that property. So the same pass writes WHICH LANE, out
# of the environment the harness is already running in: \`Agent-Harness\` always,
# and \`Agent-Model\` / \`Agent-Spec\` / \`Agent-Session\` / \`Agent-Lane\` when the
# environment states them. Nothing is guessed — a field nobody stated is omitted.
#
# Runs for \`git commit -m\` too, which is how automation commits. Fails open — a
# hook on every commit must never be the reason a commit cannot be made.
node scripts/commit-attribution.mjs "$1" "$2"
`,
  "commit-msg": `#!/usr/bin/env sh
${MANAGED_MARKER}
#
# The commit-subject contract, at the one moment the message is still free to
# change without rewriting history.
#
# Rubric A5 (scripts/commit-subject.mjs) already blocks a subject that narrates
# the run instead of naming the change — but it runs on a DIFF, in
# agent-review.yml and inside \`npm run check:ci\`, which is after the commit
# exists. Here the fix is an edit instead of a rebase.
#
# Bypass, and own it:  git commit --no-verify
node scripts/commit-check.mjs "$1" || exit 1

# The braces for that belt: prepare-commit-msg appends the authorship trailer and
# the harness that wrote it, and this refuses an agent-written commit carrying
# neither. \`Agent-Model\` / \`Agent-Spec\` / \`Agent-Session\` stay best effort — a
# fact the environment never stated cannot be produced by insisting on it.
node scripts/commit-attribution.mjs --check "$1" || exit 1
`,
};

/** `installed` (written or refreshed), `kept` (locally owned), `missing`
 *  (--check only: absent or stale). Never throws. */
export function installHooks(huskyDir, { write = true } = {}) {
  const result = { installed: [], kept: [], missing: [], errors: [] };
  try {
    if (write && !existsSync(huskyDir)) mkdirSync(huskyDir, { recursive: true });
  } catch (err) {
    result.errors.push(`could not create ${huskyDir}: ${err.message}`);
    return result;
  }

  for (const [name, body] of Object.entries(HOOKS)) {
    const path = join(huskyDir, name);
    let current = null;
    try {
      if (existsSync(path)) current = readFileSync(path, "utf8");
    } catch (err) {
      result.errors.push(`could not read ${name}: ${err.message}`);
      continue;
    }

    if (current !== null && !current.includes(MANAGED_MARKER)) {
      result.kept.push(name); // a human owns this file
      continue;
    }
    if (current === body) continue; // already current

    if (!write) {
      result.missing.push(name);
      continue;
    }
    try {
      writeFileSync(path, body);
      try {
        chmodSync(path, 0o755); // no-op on Windows, required on POSIX
      } catch {
        /* mode is advisory here; git runs the hook through sh either way */
      }
      result.installed.push(name);
    } catch (err) {
      result.errors.push(`could not write ${name}: ${err.message}`);
    }
  }
  return result;
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const check = process.argv.slice(2).includes("--check");
  const huskyDir = join(ROOT, ".husky");
  const r = installHooks(huskyDir, { write: !check });

  for (const name of r.installed) console.log(`✓ commit hooks: installed .husky/${name}`);
  for (const name of r.kept) {
    console.log(
      `· commit hooks: .husky/${name} is locally owned (no managed marker) — left alone. ` +
        "Delete it and re-run `npm install` to take the managed version."
    );
  }
  for (const e of r.errors) console.log(`(commit hooks: ${e})`);

  if (check) {
    if (r.missing.length) {
      console.error("");
      console.error(`✗ commit hooks: ${r.missing.map((n) => `.husky/${n}`).join(", ")} not installed or stale.`);
      console.error("  Run `npm install` (or `node scripts/install-commit-hooks.mjs`) to wire this checkout.");
      console.error("  Without them an agent's commit carries no authorship trailer and a session-narrating");
      console.error("  subject is only caught later, on a diff, when fixing it means rewriting history.");
      console.error("");
      process.exit(1);
    }
    console.log("✓ commit hooks: prepare-commit-msg and commit-msg are installed and current.");
  }
  // Install mode always succeeds: see the header. `npm install` must not fail here.
  process.exit(0);
}
