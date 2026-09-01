#!/usr/bin/env node
/** The tool-permission policy, from prose to a boundary the harness reads.
 *
 *  AGENTS.md § "What you may do unattended" is the one paragraph in this
 *  repository that stayed prose while everything around it grew a fence: the
 *  seams are lint rules, the security rules are `npm run sast`, the token scopes
 *  are `.github/workflow-permissions.json`, the exception lists are the contract
 *  ledger. What an agent may run WITHOUT ASKING — in a tree holding live Google
 *  Ads, Sklik, Resend, Leonardo and provider credentials — was a list somebody had
 *  to remember having read.
 *
 *  Two files, and the drift between them is what is measured:
 *
 *    .github/agent-permissions.json   the DECLARATION. Every pattern with its
 *                                     rung, the AGENTS.md sentence it comes from,
 *                                     and — the half a permission list never
 *                                     carries — what the pattern cannot see.
 *    .claude/settings.json            the ENFORCED half, read by the harness. A
 *                                     `deny` rule is refused outright; an `ask`
 *                                     rule stops for a human before the command
 *                                     runs.
 *
 *  WHY NOT ONE FILE. The settings file is a tool's, in a schema that tool owns,
 *  and it has no room for a reason. A permission list with no reasons is the one
 *  that gets widened in a hurry: nobody can tell an argued entry from a shortcut.
 *  So the reasons live here and the gate refuses the two to disagree — an entry
 *  added to the settings and not declared, or declared and not enforced, is red.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md). The DECLARATION's own shape is
 *  blocking, on every build, through test-unit/agent-permissions.test.mjs: a rule
 *  with no AGENTS.md quote, a rung that does not match the list it is on, a pattern
 *  on two lists at once. The comparison against `.claude/settings.json` is blocking
 *  THE MOMENT the block exists — installing a policy other than the declared one is
 *  the failure worth catching — and this script's `--check` is what reports the
 *  block being absent, because a checkout that has not run `--install` is not a
 *  breach of the rule, it is a checkout that has not been wired yet.
 *
 *  Usage:
 *    npm run agent:permissions              # print the policy, and whether it is wired
 *    npm run agent:permissions -- --install # write it into .claude/settings.json
 *    npm run agent:permissions:check        # exit 1 when the two disagree
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DECLARATION_REL = ".github/agent-permissions.json";
export const SETTINGS_REL = ".claude/settings.json";

/** The three lists, and the rung each one is the enforcement of. */
export const LISTS = { deny: "red", ask: "amber", allow: "green" };

/** The declared policy as `{ deny, ask, allow }`, each an array of patterns in
 *  declaration order. Pure — takes the parsed declaration, touches no disk, so the
 *  test can run it against a fixture. */
export function policyOf(declaration) {
  const policy = { deny: [], ask: [], allow: [] };
  for (const rule of declaration.rules ?? []) {
    const list = rule.list;
    if (!(list in policy)) continue;
    for (const p of rule.patterns ?? []) policy[list].push(p);
  }
  return policy;
}

/** Every way the declaration can be wrong, as one problem per entry. `[]` is a
 *  well-formed policy. `agentsMd` is the text of AGENTS.md — passed in rather than
 *  read, so a fixture can be checked the same way. */
export function checkDeclaration(declaration, agentsMd) {
  const problems = [];
  const flat = (s) => String(s).replace(/\s+/g, " ");
  const doc = flat(agentsMd);
  const seen = new Map();

  const rules = declaration.rules ?? [];
  if (!rules.length) problems.push(`${DECLARATION_REL} declares no rules — an empty policy enforces nothing.`);

  for (const rule of rules) {
    const id = rule.id ?? "(no id)";
    for (const key of ["id", "rung", "list", "rule", "quote", "why"]) {
      if (!rule[key] || typeof rule[key] !== "string") problems.push(`${id}: missing \`${key}\`.`);
    }
    if (!Array.isArray(rule.patterns) || !rule.patterns.length) {
      problems.push(`${id}: declares no \`patterns\` — a rule with no pattern is prose again.`);
    }
    if (!(rule.list in LISTS)) {
      problems.push(`${id}: unknown list "${rule.list}" (expected ${Object.keys(LISTS).join(" | ")}).`);
    } else if (LISTS[rule.list] !== rule.rung) {
      problems.push(
        `${id}: rung "${rule.rung}" sits on the "${rule.list}" list, which is the enforcement of ` +
          `"${LISTS[rule.list]}". An amber rule on \`deny\` refuses work the guidance allows; a red one on ` +
          "`allow` is worse."
      );
    }
    if (rule.quote && !doc.includes(flat(rule.quote))) {
      problems.push(
        `${id}: AGENTS.md no longer contains "${rule.quote}". The prose is canonical — either the sentence ` +
          "moved and this quote should follow it, or the rule was dropped and this pattern is enforcing a " +
          "policy nobody states."
      );
    }
    for (const p of rule.patterns ?? []) {
      if (seen.has(p)) {
        problems.push(
          `${p} is declared by both \`${seen.get(p)}\` and \`${id}\`. A pattern on two lists resolves by ` +
            "whichever the harness reads first, which is not a policy anybody wrote."
        );
      }
      seen.set(p, id);
      if (!/^[A-Za-z]+\(.+\)$/.test(p)) {
        problems.push(`${id}: "${p}" is not a \`Tool(specifier)\` rule the harness can parse.`);
      }
    }
  }
  return problems;
}

/** The declared policy against what `.claude/settings.json` actually enforces, in
 *  BOTH directions. `settings` is the parsed settings object, or null when the file
 *  is absent. Returns `{ installed, problems }`. */
export function checkSettings(policy, settings) {
  const enforced = settings?.permissions;
  if (!enforced) return { installed: false, problems: [] };

  const problems = [];
  for (const list of Object.keys(LISTS)) {
    const declared = policy[list] ?? [];
    const actual = Array.isArray(enforced[list]) ? enforced[list] : [];
    for (const p of declared) {
      if (!actual.includes(p)) {
        problems.push(
          `${SETTINGS_REL} § permissions.${list} does not carry \`${p}\`, which ${DECLARATION_REL} declares. ` +
            "The declaration is what a reviewer reads; the settings file is what actually stops a command."
        );
      }
    }
    for (const p of actual) {
      if (!declared.includes(p)) {
        problems.push(
          `${SETTINGS_REL} § permissions.${list} enforces \`${p}\` and ${DECLARATION_REL} does not declare it. ` +
            "A permission with no recorded reason is the one that gets widened in a hurry — add the rule, with " +
            "the AGENTS.md sentence it comes from, in the same diff."
        );
      }
    }
  }
  return { installed: true, problems };
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const CHECK = argv.includes("--check");
  const INSTALL = argv.includes("--install");

  const declaration = JSON.parse(readFileSync(join(ROOT, DECLARATION_REL), "utf8"));
  const agentsMd = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  const policy = policyOf(declaration);

  const settingsPath = join(ROOT, SETTINGS_REL);
  let settings = null;
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch (err) {
      console.error(`✗ ${SETTINGS_REL} is not parseable JSON — ${err.message}`);
      process.exit(1);
    }
  }

  if (INSTALL) {
    if (!settings) {
      console.error(`✗ ${SETTINGS_REL} does not exist — nothing to wire. Create it first.`);
      process.exit(1);
    }
    settings.permissions = { ...(settings.permissions ?? {}), ...policy };
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    console.log(
      `✓ wired ${policy.deny.length} deny, ${policy.ask.length} ask and ${policy.allow.length} allow rule(s) ` +
        `into ${SETTINGS_REL}. Commit it — it is tracked, and a policy only one machine holds is not one.`
    );
    process.exit(0);
  }

  const problems = checkDeclaration(declaration, agentsMd);
  const { installed, problems: drift } = checkSettings(policy, settings);
  problems.push(...drift);

  console.log(`Tool permissions — ${(declaration.rules ?? []).length} rule(s), from ${declaration.statedIn}`);
  console.log("");
  for (const rule of declaration.rules ?? []) {
    console.log(`  ${rule.rung.padEnd(5)} ${rule.list.padEnd(5)} ${rule.id}  (${rule.patterns.length} pattern(s))`);
    console.log(`        ${rule.rule}`);
  }
  console.log("");
  console.log(
    installed
      ? `  ✓ ${SETTINGS_REL} carries a permissions block, and it is compared against the declaration above.`
      : `  ✗ ${SETTINGS_REL} carries NO permissions block — the policy is declared and nothing enforces it.\n` +
        "    Wire it: npm run agent:permissions -- --install   (then commit the file)"
  );
  for (const line of declaration.$cannotSee ?? []) console.log(`  · cannot see: ${line}`);

  if (problems.length) {
    console.log("");
    console.log(`✗ ${problems.length} problem(s):`);
    for (const p of problems) console.log(`  • ${p}`);
  }

  if (CHECK) {
    if (problems.length) process.exit(1);
    if (!installed) {
      console.log("");
      console.log(`✗ agent:permissions: the declared policy is not enforced by ${SETTINGS_REL}.`);
      process.exit(1);
    }
  }
  process.exit(0);
}
