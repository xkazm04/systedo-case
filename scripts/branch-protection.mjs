#!/usr/bin/env node
/** Is the enumeration actually ENFORCED? (zero-dependency; `--verify` shells out
 *  to `gh`, which is preinstalled on the runner.)
 *
 *  .github/required-checks.json says which checks may stop a change, and
 *  scripts/merge-gate.mjs keeps that list honest about the repository: each named
 *  check exists, runs on pull requests, keeps the display name GitHub matches, and
 *  can still fail. ADR-0011 wrote down the half it could not do — "the list can lie
 *  about GitHub's settings, because nothing here can read them without a token."
 *
 *  That gap has a cost that is not theoretical on this repository: the rubric review
 *  of the diff is one of those checks, and from OUTSIDE the tree a required check and
 *  a check that merely comments look identical. An automated reviewer nobody can
 *  confirm has teeth is an automated reviewer that gets ignored.
 *
 *  So this script closes it from both ends, and the two ends sit on different rungs
 *  (ADR-0007) because they can be proven in different places:
 *
 *    OFFLINE, BLOCKING (the default mode, and `checkDeclaredRuleset()` which
 *      scripts/merge-gate.mjs calls inside `npm run check:ci`): .github/branch-ruleset.json
 *      is a real GitHub Rulesets payload, and its `required_status_checks` contexts must
 *      be EXACTLY the `check` strings in .github/required-checks.json — no more, no
 *      fewer, no drifted wording. Adding a required check and forgetting the ruleset is
 *      a red build. No network, so it works in the pre-push hook and in a fork's CI.
 *
 *    NETWORKED, REPORTING (`--verify`, run weekly by
 *      .github/workflows/agent-review-history.yml): read the rules GitHub is ACTUALLY
 *      applying to the default branch and say, check by check, whether each one is
 *      enforced. It exits 0 whatever it finds — it needs a token, so it can never be a
 *      gate — but its answer is published into the trail issue, where a contributor who
 *      has never opened package.json can read it.
 *
 *  WHAT `--verify` CAN AND CANNOT SEE, stated so a green line is not over-read:
 *  `GET /repos/{owner}/{repo}/rules/branches/{branch}` returns the RULESETS that apply,
 *  and needs nothing more than read access — which is the point, since it makes the
 *  answer checkable by anyone. It does NOT return CLASSIC branch protection, and the
 *  classic API needs an admin token that GITHUB_TOKEN cannot be granted. So "not
 *  enforced by any ruleset" is reported as exactly that, never as "unprotected".
 *
 *  Usage:
 *    node scripts/branch-protection.mjs                    # offline consistency (exit 1 on drift)
 *    node scripts/branch-protection.mjs --verify           # + read the live rules (always exit 0)
 *    node scripts/branch-protection.mjs --verify --branch master --repo owner/name
 *                                       [--out FILE] [--summary FILE]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = join(ROOT, ".github", "required-checks.json");
const RULESET_PATH = join(ROOT, ".github", "branch-ruleset.json");

/** The declared ruleset, parsed — or a failure describing why it is unusable. */
function readDeclared() {
  if (!existsSync(RULESET_PATH)) {
    return {
      ruleset: null,
      failures: [
        ".github/branch-ruleset.json is missing — nothing declares what GitHub is supposed to " +
          "require on the default branch, so .github/required-checks.json is a claim with no counterpart.",
      ],
    };
  }
  try {
    return { ruleset: JSON.parse(readFileSync(RULESET_PATH, "utf8")), failures: [] };
  } catch (err) {
    return { ruleset: null, failures: [`.github/branch-ruleset.json is not valid JSON — ${err.message}`] };
  }
}

/** The `check` strings that .github/required-checks.json says may stop a change. */
function requiredCheckNames() {
  if (!existsSync(SPEC_PATH)) return null;
  try {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
    return (spec.required ?? []).map((r) => r.check).filter(Boolean);
  } catch {
    return null;
  }
}

/** The contexts a rules payload requires, flattened across every rule of that type. */
function contextsOf(rules) {
  const found = [];
  for (const rule of rules ?? []) {
    if (rule?.type !== "required_status_checks") continue;
    for (const c of rule?.parameters?.required_status_checks ?? []) {
      if (typeof c === "string") found.push(c);
      else if (c?.context) found.push(c.context);
    }
  }
  return found;
}

/** OFFLINE. The declared ruleset says the same thing as the enumeration.
 *  Returns [] when they agree; scripts/merge-gate.mjs turns anything else into a
 *  failed gate, which is what makes this blocking rather than advisory. */
export function checkDeclaredRuleset() {
  const names = requiredCheckNames();
  if (!names) return [".github/required-checks.json is missing or unreadable."];
  const { ruleset, failures } = readDeclared();
  if (!ruleset) return failures;

  const out = [];
  if (ruleset.target !== "branch") {
    out.push(`.github/branch-ruleset.json: target is "${ruleset.target}" — a branch ruleset is what protects a branch.`);
  }
  if (ruleset.enforcement !== "active") {
    out.push(
      `.github/branch-ruleset.json: enforcement is "${ruleset.enforcement}" — "evaluate" and "disabled" rulesets ` +
        "report without stopping anything, which is the state this file exists to make visible."
    );
  }
  const include = ruleset.conditions?.ref_name?.include ?? [];
  if (!include.length) {
    out.push(".github/branch-ruleset.json: `conditions.ref_name.include` names no branch, so the ruleset applies to none.");
  }

  const declared = contextsOf(ruleset.rules);
  if (!declared.length) {
    out.push(
      ".github/branch-ruleset.json declares no `required_status_checks` rule, so nothing it says would stop a " +
        "merge — while .github/required-checks.json names " +
        `${names.length} check(s) that must.`
    );
    return out;
  }

  const declaredSet = new Set(declared);
  for (const name of names) {
    if (!declaredSet.has(name)) {
      out.push(
        `"${name}" is enumerated in .github/required-checks.json but is not a required status check in ` +
          ".github/branch-ruleset.json. GitHub matches the check by that exact string — a check the ruleset " +
          "never names is a check that only reports."
      );
    }
  }
  const nameSet = new Set(names);
  for (const context of declaredSet) {
    if (!nameSet.has(context)) {
      out.push(
        `.github/branch-ruleset.json requires "${context}", which .github/required-checks.json does not ` +
          "enumerate. Either add it there with the reason it earns a red build, or drop it here — a required " +
          "check with no recorded reason is the thing ADR-0011 replaced."
      );
    }
  }
  return out;
}

// --- CLI ---------------------------------------------------------------------

// Imported by scripts/merge-gate.mjs for the offline half; run directly for either.
const SELF = fileURLToPath(import.meta.url);
const ENTRY = process.argv[1] ? resolve(process.argv[1]) : "";
const invokedDirectly = ENTRY === SELF || ENTRY.toLowerCase() === SELF.toLowerCase();

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  const VERIFY = argv.includes("--verify");
  const OUT_FILE = arg("--out");
  const SUMMARY_FILE = arg("--summary");
  const REPO = arg("--repo") || process.env.GITHUB_REPOSITORY || "";
  const BRANCH = arg("--branch") || process.env.GITHUB_DEFAULT_BRANCH || "master";

  const out = [];
  const say = (s = "") => {
    out.push(s);
    console.log(s);
  };

  const finish = (code) => {
    if (SUMMARY_FILE) {
      try {
        appendFileSync(SUMMARY_FILE, out.join("\n") + "\n");
      } catch (err) {
        console.error(`(could not write summary: ${err.message})`);
      }
    }
    if (OUT_FILE) {
      try {
        writeFileSync(OUT_FILE, out.join("\n") + "\n");
      } catch (err) {
        console.error(`(could not write ${OUT_FILE}: ${err.message})`);
      }
    }
    process.exit(code);
  };

  say("## Required checks — declared, and enforced?");
  say("");

  const names = requiredCheckNames() ?? [];
  const drift = checkDeclaredRuleset();

  say(`\`.github/required-checks.json\` enumerates **${names.length}** check(s) that may stop a change.`);
  say(
    "`.github/branch-ruleset.json` is the ruleset this repository declares for its default branch — " +
      "the same list, in the shape GitHub accepts."
  );
  say("");
  if (drift.length) {
    say(`❌ The two disagree (${drift.length}):`);
    say("");
    for (const d of drift) say(`- ${d}`);
  } else {
    say("✅ The declaration matches the enumeration, check for check.");
  }
  say("");

  if (!VERIFY) {
    // Offline mode is a gate: drift is a failure, not a note.
    finish(drift.length ? 1 : 0);
  }

  // --- networked half: what is GitHub actually applying? ---------------------

  /** `gh api <path>` → { ok, body }. Never throws; a 403/404 is an answer. */
  const api = (path) => {
    const res = spawnSync("gh", ["api", "-H", "Accept: application/vnd.github+json", path], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (res.error || res.status !== 0) return { ok: false, body: null };
    try {
      return { ok: true, body: JSON.parse(res.stdout) };
    } catch {
      return { ok: false, body: null };
    }
  };

  say(`### Live rules on \`${BRANCH}\``);
  say("");

  if (!REPO) {
    say("_No repository to query (`GITHUB_REPOSITORY` unset and no `--repo`), so this half is unanswered._");
    finish(0);
  }

  const live = api(`repos/${REPO}/rules/branches/${encodeURIComponent(BRANCH)}`);
  if (!live.ok || !Array.isArray(live.body)) {
    say(
      "_Could not read the branch's rules (is `gh` authenticated?). Reported, not failed — this half needs a " +
        "token and so can never be a gate._"
    );
    finish(0);
  }

  const enforced = new Set(contextsOf(live.body));
  say(`GitHub is applying **${live.body.length}** rule(s) to this branch, requiring **${enforced.size}** status check(s).`);
  say("");
  say("| Check that may stop a change | Enforced by a ruleset on the default branch |");
  say("| --- | --- |");
  for (const name of names) {
    say(`| ${name} | ${enforced.has(name) ? "yes" : "**no**"} |`);
  }
  const missing = names.filter((n) => !enforced.has(n));
  say("");
  if (!missing.length && names.length) {
    say(
      "Every enumerated check is enforced by a live ruleset, so the rubric review of the diff blocks a merge " +
        "rather than commenting on one — and that is now readable by anyone with read access, not only by " +
        "someone inside the settings page."
    );
  } else {
    say(
      `**${missing.length} of ${names.length} enumerated check(s) are not required by any live ruleset.** ` +
        "Apply `.github/branch-ruleset.json` (the command is in its own header) — until then those checks " +
        "report on a pull request without being able to stop it."
    );
    say("");
    say(
      "_Caveat, so this line is not over-read: this API returns rulesets only. CLASSIC branch protection is " +
        "invisible to it, and the classic endpoint needs an admin token that `GITHUB_TOKEN` cannot be granted. " +
        "A `no` above means 'no ruleset requires it', never 'the branch is unprotected'._"
    );
  }

  // Reporting rung, permanently: exit 0 whatever the answer is (ADR-0007).
  finish(0);
}
