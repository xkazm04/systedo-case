/** The stricter TypeScript project is an INSTRUMENT, and that is held true rather
 *  than merely written down.
 *
 *  THE PROBLEM. `tsconfig.strict.json` and `npm run typecheck:strict` are in this
 *  repository, and `npm run check:ci` does not run them. From the outside those two
 *  facts are indistinguishable from a gate someone wired up and forgot to add to
 *  the chain — which is the reading a maturity scan actually gave them. And an
 *  agent following the documented loop (`AGENTS.md` § Commands → `check:ci`) never
 *  met the stricter project at all, because until now nothing outside
 *  `package.json` and the config's own header mentioned it: not `AGENTS.md`, not
 *  `docs/task-index.md`. An instrument nobody is routed to is not an instrument,
 *  it is a file.
 *
 *  THE RULE. Exactly one of these is true at a time, and this file is what keeps
 *  them from drifting apart:
 *
 *    a) `typecheck:strict` is NOT a stage of `check:ci`, and then
 *       `tsconfig.strict.json` says so — in those words, with ADR-0007 named as
 *       the reason (a check blocks only once someone has measured that it passes)
 *       — and `AGENTS.md` names the command, so a reader meets the instrument on
 *       the same screen as the gates and can tell the two apart; or
 *    b) it IS a stage, it has been measured, and the "NOT A GATE" paragraph is
 *       gone because it is no longer true.
 *
 *  Promoting it is the good outcome and this file does not stand in its way — it
 *  only refuses the state where the config claims one thing and the chain does
 *  another. The ladder up is written in `tsconfig.strict.json` itself.
 *
 *  Rung: blocking (ADR-0007 — it passes today). Runs inside `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`.
 *
 *  Pure — reads files, runs nothing. It deliberately does NOT run `tsc`: what the
 *  strict project costs is a measurement, and a measurement belongs in a run the
 *  maintainer chose to pay for, not in every push.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** tsconfig files are JSONC by convention and this one carries its whole rationale
 *  in a leading comment block. Drop full-line `//` comments, then parse. */
const parseJsonc = (text) =>
  JSON.parse(
    text
      .split(/\r?\n/)
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n")
  );

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};
const STRICT_SCRIPT = "typecheck:strict";
const STRICT_CONFIG = "tsconfig.strict.json";

/** The stages `check:ci` chains, read the same way scripts/gate-timings.mjs reads
 *  them, so "is it in the chain?" has one answer here and there. */
const chainStages = [...String(scripts["check:ci"] ?? "").matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
const inChain = chainStages.includes(STRICT_SCRIPT);

test("the script and the project it names both exist", () => {
  assert.ok(
    scripts[STRICT_SCRIPT],
    `package.json no longer defines \`${STRICT_SCRIPT}\`. If the stricter project was retired, delete ` +
      `${STRICT_CONFIG} and its route in docs/task-index.md in the same change — a config with no way to run it ` +
      "is the state this file exists to prevent."
  );
  assert.match(
    scripts[STRICT_SCRIPT],
    new RegExp(STRICT_CONFIG.replace(/\./g, "\\.")),
    `\`${STRICT_SCRIPT}\` no longer points at ${STRICT_CONFIG}, so the command and the config have come apart.`
  );
  assert.ok(existsSync(join(ROOT, STRICT_CONFIG)), `${STRICT_CONFIG} is gone but \`${STRICT_SCRIPT}\` still runs it.`);
});

test("the stricter project actually measures something the normal one does not", () => {
  // The quiet failure: the strict config is emptied down to `extends` and the
  // command keeps passing, so `typecheck:strict` becomes a slower `typecheck` and
  // nothing says so. A flag promoted into tsconfig.json is the GOOD outcome and is
  // allowed here — what is not allowed is the strict project measuring nothing.
  const strict = parseJsonc(read(STRICT_CONFIG));
  const base = parseJsonc(read("tsconfig.json"));
  assert.equal(strict.extends, "./tsconfig.json", `${STRICT_CONFIG} must extend the project it is stricter than.`);

  const strictOpts = strict.compilerOptions ?? {};
  const baseOpts = base.compilerOptions ?? {};
  const extra = Object.keys(strictOpts).filter((k) => strictOpts[k] !== baseOpts[k]);
  assert.ok(
    extra.length > 0,
    `${STRICT_CONFIG} sets no compiler option that tsconfig.json does not already set, so \`${STRICT_SCRIPT}\` ` +
      "is now a second, slower `typecheck`. Either it has a flag to measure, or it should be deleted."
  );
});

test("the config and the chain agree about whether it is a gate", () => {
  // (a) and (b) from the header. The failure this catches is the drift between
  // them, in either direction: a config still claiming to be an instrument after
  // it was promoted reads as stale prose, and is how a reader learns to stop
  // trusting the prose.
  const config = read(STRICT_CONFIG);
  const declaresInstrument = /NOT A GATE/.test(config);

  if (inChain) {
    assert.ok(
      !declaresInstrument,
      `\`${STRICT_SCRIPT}\` is now a stage of check:ci, but ${STRICT_CONFIG} still says "NOT A GATE". Delete that ` +
        "paragraph and record what the measurement was — the file is now describing the opposite of what runs."
    );
    return;
  }

  assert.ok(
    declaresInstrument,
    `\`${STRICT_SCRIPT}\` is not a stage of check:ci and ${STRICT_CONFIG} does not say why. From the outside that ` +
      "is indistinguishable from a gate someone forgot to wire, which is exactly how it has been read. Say it is " +
      "an instrument, and say what would promote it."
  );
  assert.match(
    config,
    /ADR-0007|0007-gate-rung-discipline/,
    `${STRICT_CONFIG} says it is not a gate without naming the rule that makes that the right call. ADR-0007 is ` +
      "why: a check blocks only once someone has measured that it passes today."
  );
  assert.match(
    config,
    new RegExp(`npm run ${STRICT_SCRIPT}`),
    `${STRICT_CONFIG} never states the command that runs it, so a reader who opens the config still has to go ` +
      "looking in package.json for the number it exists to produce."
  );
});

test("something actually RUNS it — an instrument nobody measures produces no number", () => {
  // The gap this closes. Being documented and routed to is necessary and was not
  // sufficient: `npm run typecheck:strict` still only ran when a maintainer thought
  // to run it, so the count ADR-0007 says a promotion decision needs was never
  // produced and the frontier could only move by accident. It is now measured on
  // every push and pull request, on the reporting rung, next to the i18n audit.
  assert.match(
    scripts["typecheck:strict:check"] ?? "",
    /scripts\/typecheck-strict\.mjs/,
    "`typecheck:strict:check` no longer runs the measurement. The raw `typecheck:strict` prints compiler output; " +
      "this is the one that counts it, clusters it and compares it against the baseline."
  );
  assert.match(
    scripts["typecheck:strict:accept"] ?? "",
    /--accept/,
    "there is no way to pin the measured count, so the reporting rung has no rung above it."
  );
  const ci = read(".github/workflows/ci.yml");
  assert.match(
    ci,
    /typecheck:strict:check/,
    "no CI job runs the stricter typecheck. That is the state this test exists to end: a second standard that " +
      "nothing executes gives no feedback to the author of a change."
  );
});

test("the baseline record is readable, and honest about not being measured yet", () => {
  const record = JSON.parse(read(".github/typecheck-strict.json"));
  assert.equal(record.schema, 1, ".github/typecheck-strict.json changed schema — scripts/typecheck-strict.mjs reads it.");
  assert.ok(
    record.accepted === null || typeof record.accepted?.errors === "number",
    "`accepted` must be null (nobody has measured it) or carry a numeric `errors` count. Anything else is a " +
      "baseline that cannot be compared against."
  );
  if (record.accepted) {
    assert.ok(
      String(record.accepted.reason ?? "").trim().length >= 12,
      "an accepted baseline with no sentence behind it is a number nobody can argue with, which is how it gets raised."
    );
  }
});

test("a reader following the documented loop meets it", () => {
  // The actual gap. AGENTS.md § Commands is the list an agent works from; the
  // instrument was absent from it, so the only way to meet the stricter project
  // was to already know it existed.
  const agents = read("AGENTS.md");
  const commands = /## Commands\s*\n+```bash\n([\s\S]*?)\n```/.exec(agents);
  assert.ok(commands, "AGENTS.md no longer has a fenced `## Commands` block — the command list is the loop.");
  assert.ok(
    commands[1].includes(STRICT_SCRIPT),
    `AGENTS.md § Commands does not list \`${STRICT_SCRIPT}\`. An agent following the documented loop then meets ` +
      "the stricter project only by accident, which is the same as it not being here."
  );
  assert.ok(
    read("docs/task-index.md").includes(STRICT_CONFIG),
    `docs/task-index.md does not route to ${STRICT_CONFIG}. "Why is this not in check:ci?" is exactly the ` +
      "question the task index exists to answer without guesswork."
  );
});
