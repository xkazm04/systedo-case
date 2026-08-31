/** The commit hooks install themselves.
 *
 *  THE GAP. scripts/commit-attribution.mjs and scripts/commit-check.mjs both
 *  described two hooks — `.husky/prepare-commit-msg` (append the authorship
 *  trailer) and `.husky/commit-msg` (refuse an agent commit without one, and
 *  apply the rubric A5 subject rules while the message can still be edited) — as
 *  a `printf` a maintainer was expected to run by hand. Nobody ran it, for long
 *  enough that the log now shows ~97% agent authorship with about one commit in
 *  thirty saying so, and session-narrating subjects that were only caught later,
 *  on a diff, when fixing one means rewriting history.
 *
 *  A hook that must be installed by hand is a suggestion, not a control. So
 *  `npm install` installs it, through `prepare`, and these tests hold that
 *  wiring: the hook BODIES are exercised against a temp directory rather than
 *  against `.husky/`, so the suite proves the installer works on a checkout that
 *  has none — which is the state it exists for.
 *
 *  Rung (docs/adr/0007-gate-rung-discipline.md): BLOCKING. It passes today, so a
 *  red here is a regression. It runs in `npm run test:unit` → `npm run check:ci`
 *  → `.husky/pre-push`.
 *
 *  What this CANNOT prove, and the reason attribution stays reporting-rung: a
 *  lane that commits in a throwaway worktree where nobody ran `npm install` runs
 *  no hooks at all. That is the same hole rubric A5 has, and it is why
 *  `npm run commit:check -- --range` keeps a visible coverage count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOOKS, MANAGED_MARKER, installHooks } from "../scripts/install-commit-hooks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const scratch = () => mkdtempSync(join(tmpdir(), "systedo-hooks-"));

// --- the wiring ---------------------------------------------------------------

test("`npm install` is what installs the hooks — `prepare` runs the installer", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(
    pkg.scripts.prepare,
    /install-commit-hooks\.mjs/,
    "`prepare` no longer runs scripts/install-commit-hooks.mjs, so a fresh checkout gets no commit-msg hooks " +
      "and every agent commit made in it is unattributed again."
  );
  assert.match(pkg.scripts.prepare, /husky/, "`prepare` must still run husky — it is what points git at .husky/.");
  assert.equal(pkg.scripts["hooks:check"], "node scripts/install-commit-hooks.mjs --check");
});

test("both hooks are covered, and each calls the script that carries its rule", () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ["commit-msg", "prepare-commit-msg"]);
  assert.match(
    HOOKS["prepare-commit-msg"],
    /node scripts\/commit-attribution\.mjs "\$1" "\$2"/,
    "prepare-commit-msg no longer appends the authorship trailer."
  );
  assert.match(
    HOOKS["commit-msg"],
    /node scripts\/commit-check\.mjs "\$1"/,
    "commit-msg no longer applies the rubric A5 subject rules at the one moment the message can still change."
  );
  assert.match(
    HOOKS["commit-msg"],
    /node scripts\/commit-attribution\.mjs --check "\$1"/,
    "commit-msg no longer refuses an agent-written commit that carries no authorship trailer."
  );
  for (const [name, body] of Object.entries(HOOKS)) {
    assert.match(body, /^#!\/usr\/bin\/env sh\n/, `${name} has no shebang — git runs these as scripts.`);
    assert.ok(body.includes(MANAGED_MARKER), `${name} carries no managed marker, so a refresh would skip it.`);
  }
});

// --- installing ---------------------------------------------------------------

test("a checkout with no hooks gets both, byte-for-byte", () => {
  const dir = scratch();
  const r = installHooks(dir);
  assert.deepEqual(r.installed.sort(), ["commit-msg", "prepare-commit-msg"]);
  assert.deepEqual(r.errors, []);
  for (const [name, body] of Object.entries(HOOKS)) {
    assert.equal(readFileSync(join(dir, name), "utf8"), body);
  }
});

test("it creates the hook directory when there is not one", () => {
  const dir = join(scratch(), "nested", ".husky");
  installHooks(dir);
  assert.deepEqual(readdirSync(dir).sort(), ["commit-msg", "prepare-commit-msg"]);
});

test("running it twice changes nothing — `npm install` runs on every install", () => {
  const dir = scratch();
  installHooks(dir);
  const second = installHooks(dir);
  assert.deepEqual(second.installed, [], "the second pass rewrote a hook that was already current.");
});

test("a stale managed hook is refreshed, so a change here reaches existing checkouts", () => {
  const dir = scratch();
  writeFileSync(join(dir, "commit-msg"), `#!/usr/bin/env sh\n${MANAGED_MARKER}\n# an older body\n`);
  const r = installHooks(dir);
  assert.ok(r.installed.includes("commit-msg"));
  assert.equal(readFileSync(join(dir, "commit-msg"), "utf8"), HOOKS["commit-msg"]);
});

test("a hook a human owns is left alone and reported, never overwritten", () => {
  const dir = scratch();
  const mine = "#!/usr/bin/env sh\n# my own hook\nexit 0\n";
  writeFileSync(join(dir, "commit-msg"), mine);
  const r = installHooks(dir);
  assert.deepEqual(r.kept, ["commit-msg"], "a hook with no managed marker must be reported as locally owned.");
  assert.equal(readFileSync(join(dir, "commit-msg"), "utf8"), mine, "an installer deleted a human's hook.");
  assert.deepEqual(r.installed, ["prepare-commit-msg"], "the other hook should still have been installed.");
});

test("--check reports without writing: it must never repair the thing it measures", () => {
  const dir = scratch();
  mkdirSync(join(dir, "keep"), { recursive: true });
  const r = installHooks(dir, { write: false });
  assert.deepEqual(r.missing.sort(), ["commit-msg", "prepare-commit-msg"]);
  assert.deepEqual(readdirSync(dir), ["keep"], "--check wrote a hook; then it can never report one missing.");
});

// --- failing open --------------------------------------------------------------

test("an unwritable target is an error it reports, not an exception that fails `npm install`", () => {
  const dir = scratch();
  // A directory where a hook file should be: writeFileSync cannot replace it.
  mkdirSync(join(dir, "commit-msg"));
  const r = installHooks(dir);
  assert.ok(r.errors.length >= 1, "a failed write must be collected as an error rather than thrown.");
  assert.deepEqual(r.installed, ["prepare-commit-msg"], "one bad hook must not stop the other.");
});

test("install mode exits 0 unconditionally — a packaging step must not refuse an install", () => {
  const src = read("scripts/install-commit-hooks.mjs");
  assert.ok(
    src.trimEnd().endsWith("process.exit(0);\n}"),
    "the CLI no longer ends on an unconditional exit(0); a broken hook install could now fail `npm install`."
  );
  assert.equal(
    /\bthrow\b/.test(src),
    false,
    "install-commit-hooks.mjs throws somewhere; it runs inside `npm install` and must only report."
  );
});
