/** The permission policy is declared, derived from the prose, and not drifting.
 *
 *  AGENTS.md § "What you may do unattended" tells an agent what it may run without
 *  asking. Every rule around it grew a fence — the seams are lint rules, the
 *  security rules are `npm run sast`, the token scopes are
 *  `.github/workflow-permissions.json` — and this one stayed a paragraph, in a
 *  repository holding live Google Ads, Sklik, Resend, Leonardo and provider
 *  credentials, where ~97% of commits are written by an agent working alone.
 *
 *  `.github/agent-permissions.json` is the machine-readable half and
 *  `.claude/settings.json` § permissions is the enforced one. This asserts three
 *  things, all of which pass today (blocking, ADR-0007), inside `npm run test:unit`
 *  → `check:ci` → `.husky/pre-push`:
 *
 *    • the declaration is well formed — every rule carries the AGENTS.md sentence
 *      it comes from, its rung matches the list it sits on, and no pattern is on
 *      two lists at once;
 *    • every quote is STILL a sentence in AGENTS.md, so a reworded rule cannot
 *      leave a pattern enforcing a policy nobody states any more;
 *    • and, the direction worth catching, the settings file may not enforce a
 *      policy other than the declared one. A checkout that has not run
 *      `npm run agent:permissions -- --install` yet has no block at all and is not
 *      a breach — `npm run agent:permissions:check` is what reports that.
 *
 *  The failure this exists for: somebody adds `Bash(git push:*)` to the allow list
 *  because one run needed it, and nothing anywhere goes red.
 *
 *  Pure — reads files, runs nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DECLARATION_REL,
  LISTS,
  SETTINGS_REL,
  checkDeclaration,
  checkSettings,
  policyOf,
} from "../scripts/agent-permissions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const declaration = JSON.parse(read(DECLARATION_REL));
const agentsMd = read("AGENTS.md");
const policy = policyOf(declaration);

test("the declaration is well formed and every rule is quoted from AGENTS.md", () => {
  const problems = checkDeclaration(declaration, agentsMd);
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("the three red rules a command string can carry are all denied", () => {
  // Not a re-listing of the file: these are the specific boundaries where being
  // wrong is expensive and irreversible, and the cheapest way to make a run go
  // smoothly is to quietly drop one of them.
  const denied = new Set(policy.deny);
  const must = ["Bash(git push:*)", "Bash(git stash:*)", "Bash(git add -A:*)", "Read(./.env)", "Write(./.env)"];
  for (const pattern of must) {
    assert.ok(
      denied.has(pattern),
      `${pattern} is no longer denied. AGENTS.md says never, and this list is the only thing that makes ` +
        "\"never\" more than a sentence the next run has to remember having read."
    );
  }
  assert.ok(
    policy.deny.some((p) => p.includes("SKLIK_WRITES_ENABLED")),
    "arming SKLIK_WRITES_ENABLED from a shell is no longer denied — that is the one boundary here where being " +
      "wrong spends an advertiser's money."
  );
});

test("nothing green is also amber, and nothing amber is also red", () => {
  // checkDeclaration already refuses a pattern declared twice; this refuses the
  // subtler version, where the SAME rung word ends up on two different lists.
  const rungs = new Map();
  for (const rule of declaration.rules) {
    const seen = rungs.get(rule.rung);
    if (seen) assert.equal(seen, rule.list, `rung "${rule.rung}" maps to both \`${seen}\` and \`${rule.list}\`.`);
    rungs.set(rule.rung, rule.list);
  }
  for (const [list, rung] of Object.entries(LISTS)) {
    assert.ok(
      declaration.rules.some((r) => r.list === list && r.rung === rung),
      `no rule sits on the \`${list}\` list. A policy with an empty list has stopped saying something it used to.`
    );
  }
});

test("the settings file may not enforce a policy other than the declared one", () => {
  const path = join(ROOT, SETTINGS_REL);
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const { installed, problems } = checkSettings(policy, settings);
  assert.deepEqual(
    problems,
    [],
    `${SETTINGS_REL} and ${DECLARATION_REL} disagree:\n${problems.join("\n")}\n` +
      "Two answers to \"may an agent run this?\" is worse than one. `npm run agent:permissions -- --install` " +
      "rewrites the settings from the declaration."
  );
  // Deliberately not asserted: that the block is INSTALLED. A fresh checkout has
  // not run the installer, and failing the unit suite for that would fail the
  // build in the one place a permission rule cannot matter — a CI runner does not
  // run an agent. `npm run agent:permissions:check` is where that is reported.
  if (!installed) {
    console.log(`  (note: ${SETTINGS_REL} carries no permissions block yet — npm run agent:permissions:check)`);
  }
});

test("the policy is reachable from the document every agent reads first", () => {
  assert.ok(
    agentsMd.includes(DECLARATION_REL),
    `AGENTS.md does not name ${DECLARATION_REL}, so the machine-readable half is unreachable from the prose ` +
      "that is canonical for it — which is how the two start describing different policies."
  );
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.scripts["agent:permissions"], "package.json defines no `agent:permissions` script.");
  assert.ok(pkg.scripts["agent:permissions:check"], "package.json defines no `agent:permissions:check` script.");
});
