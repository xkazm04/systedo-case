#!/usr/bin/env node
/** What to do when a gate goes red — one table, printed by the gate itself.
 *
 *  `npm run check:ci` chains fifteen first-party checks and every one of them
 *  states its finding well: which rule fired, on which file, and why the rule
 *  exists. What most of them did NOT state is the thing a reader who has never
 *  seen that gate before actually needs — the NEXT COMMAND. "`contract-ledger`:
 *  the sast allowlist holds 4 entries, ceiling 3" is a complete diagnosis and an
 *  empty instruction, and the reader is usually an agent with a wall clock, which
 *  is exactly the reader who reaches for the fastest thing that turns the build
 *  green rather than the right one.
 *
 *  So the remedy lives here, once, next to the chain it belongs to, and each gate
 *  prints its own entry on the way out with `printRemedy(<stage>)`. One table
 *  rather than fifteen strings, because the remedy has to stay true when a script
 *  is renamed — and `test-unit/gate-remedy.test.mjs` fails when an entry names an
 *  npm script package.json does not define, a file that does not exist, or when a
 *  `check:ci` stage has no entry at all.
 *
 *  IT IS ALSO THE CHAIN'S ORDER, and that is not decoration. The stages run
 *  cheapest-first: eleven zero-dependency checks that read files and finish in
 *  seconds run BEFORE `npm run check`, whose `next build` is minutes. A wrong
 *  change that trips `actions:check` used to cost a full build before saying so.
 *  `cost` records which rung of that ordering a stage sits on, and the test
 *  asserts the chain in package.json is still in this order.
 *
 *  Usage:
 *    npm run gates                  # the whole chain: what runs, what it costs,
 *                                   # and the remedy for each — before it fires
 *    node scripts/gate-remedy.mjs --stage contract:ledger:check
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { recordFiring } from "./fence-firings.mjs";

/** The `check:ci` chain, in the order it runs.
 *
 *  cost      — "seconds" (zero-dependency, reads files), "a minute" (runs the
 *              unit suite), "minutes" (typecheck + lint + `next build`).
 *  proves    — the invariant, in one line.
 *  next      — the exact commands, in order. This is the field that exists.
 *  records   — where an EXCEPTION to this rule is written down, when the rule is
 *              right and this change is the legitimate exception. `null` means
 *              there is no such place, which is itself the answer: fix the
 *              finding.
 */
export const CHAIN = [
  {
    stage: "adr:check",
    script: "scripts/adr-check.mjs",
    cost: "seconds",
    proves: "every decision record is numbered, sectioned, indexed, and cites paths that still exist.",
    next: [
      "A renamed path inside an ADR: update the ADR — the rename is what nobody thinks to look here for.",
      "A new record nobody indexed: add its line to docs/adr/README.md and its route to docs/task-index.md.",
      "A settled record with no `## Consequences observed`: write what actually happened, honestly.",
    ],
    records: "docs/adr/README.md",
  },
  {
    stage: "docs:parity",
    script: "scripts/docs-parity.mjs",
    cost: "seconds",
    proves: "the bilingual doc pairs still state their shared claims, with the same values.",
    next: [
      "Restate the claim on the side that lost it — README.md is the source, docs/README.cs.md is transcreated.",
      "Never delete the rule to go green: the rule firing IS the drift being caught.",
    ],
    records: "docs/parity.json",
  },
  {
    stage: "agents:surface",
    script: "scripts/agent-surface.mjs",
    cost: "seconds",
    proves:
      "the generated instruction blocks are the ones that were accepted, carry no instruction nobody read, " +
      "and the map's counts hold.",
    next: [
      "A generated block that changed: read it, decide whether the guidance it now gives agents is",
      "guidance you want, then accept it on purpose:",
      '  npm run agents:surface -- --accept "what changed and why it is fine"',
      "A line in a generated block that TELLS an agent to do something: it is data, not guidance",
      "(docs/adr/0012-generated-regions-are-data.md). Read it, and only then add --accept-instructions.",
    ],
    records: ".github/agent-surface.lock.json",
  },
  {
    stage: "checkpoint:check",
    script: "scripts/agent-checkpoint.mjs",
    cost: "seconds",
    proves: "every checkpoint an interrupted run left is still readable by the run that picks it up.",
    next: [
      "npm run checkpoint          # read what is open before touching the file",
      "Fix the unparseable JSON, or delete the file and say so in the commit body.",
    ],
    records: ".agent/README.md",
  },
  {
    stage: "actions:check",
    script: "scripts/actions-pin.mjs",
    cost: "seconds",
    proves: "workflow token scope, action pinning, and that no attacker-shaped value enters a workflow.",
    next: [
      "npm run actions:pin         # resolves every tag to its digest (needs network)",
      "An expression in a `run:` body: bind it in the step's `env:` and use \"$VAR\".",
      "A `github.event.*` field: read it from $GITHUB_EVENT_PATH — node scripts/workflow-event.mjs --get <field> --out <file>",
    ],
    records: null,
  },
  {
    stage: "merge-gate",
    script: "scripts/merge-gate.mjs",
    cost: "seconds",
    proves: "every check that may stop a change still exists, still runs on pull requests, and can still fail.",
    next: [
      "Renamed a job? Update its entry in .github/required-checks.json and .github/branch-ruleset.json.",
      "Genuinely should stop blocking? Move it off the list WITH the reason — do not soften it in place.",
    ],
    records: ".github/required-checks.json",
  },
  {
    stage: "contract:ledger:check",
    script: "scripts/contract-ledger.mjs",
    cost: "seconds",
    proves:
      "no exception list, ratchet baseline or gate threshold has crossed the pin that pays for it — and none " +
      "of them is unpinned.",
    next: [
      "npm run contract:ledger     # what each list, baseline and threshold holds today, and its pin",
      "Adding an exception is a TWO-LINE diff: the entry, and its ceiling in .github/contract-ledger.json,",
      "next to each other where a reviewer reads both. Adding the entry alone is not allowed.",
      "Raising a ratchet baseline, or lowering a number a gate compares against, is the same two-line diff:",
      "the digit, and the `ceiling`/`floor` that pays for it. Never lower a pin to make your own change pass.",
    ],
    records: ".github/contract-ledger.json",
  },
  {
    stage: "context:decay:check",
    script: "scripts/context-decay.mjs",
    cost: "seconds",
    proves: "this change did not make a mapped file import a feature group it did not import before.",
    next: [
      "npm run context:decay       # the census: what already crosses, and between which groups",
      "Three ways out, in order of preference: import through a shared context; move the file to the",
      "context it belongs to; or declare the crossing in the importing context's `cross_refs`.",
    ],
    records: "context-map.json",
  },
  {
    stage: "review:agent:gate",
    script: "scripts/agent-review.mjs",
    cost: "seconds",
    proves:
      "Part A of the rubric over this change: component size, route config, deleted tests, new deps, commit subjects.",
    next: [
      "npm run review:agent -- --base origin/master     # the same report, readable",
      "A5 (commit subject): reword with `git commit --amend`; rules in scripts/commit-subject.mjs.",
      "A3/A4 (deleted test, new dependency): put `Ack: <why>` in the commit message or the PR body.",
    ],
    records: ".github/agent-review-rubric.md",
  },
  {
    stage: "llm:gate:check",
    script: "scripts/llm-gate.mjs",
    cost: "seconds",
    proves: "every generateStructured call site is tagged, registered and unchanged against its golden.",
    next: [
      "npm run llm:list            # the call sites and their `// llm-tool:` tags",
      'npm run llm:eval:update -- --reason "why the prompt changed and why the new shape is right"',
      "A chokepoint violation is never fixed by an eslint-disable: route the call through src/lib/llm/.",
    ],
    records: "test-llm/golden/CHANGELOG.md",
  },
  {
    stage: "llm:quality:check",
    script: "scripts/quality-gate.mjs",
    cost: "seconds",
    proves: "the baked quality scorecard has not dropped below the floor recorded for the models we serve.",
    next: [
      "npm run llm:quality         # re-bake against real models (AMBER: spends money — say so in the commit)",
      'npm run llm:quality:baseline -- --reason "..."   # only when the new floor is the right one',
    ],
    records: "test-llm/quality/CHANGELOG.md",
  },
  {
    stage: "llm:budget:check",
    script: "scripts/llm-budget.mjs",
    cost: "seconds",
    proves: "no registered LLM operation costs more on the input side than its recorded ceiling.",
    next: [
      "npm run llm:budget          # what each operation costs now, against its ceiling",
      'npm run llm:budget -- --accept --reason "what got more expensive and why that is right"',
    ],
    records: "test-llm/budget.json",
  },
  {
    stage: "seed:check",
    script: "scripts/generate-data.mjs",
    cost: "seconds",
    proves: "the committed demo dataset is what its generator produces.",
    next: ["npm run seed                # regenerate src/data/performance.json, then commit it"],
    records: null,
  },
  {
    stage: "check",
    script: null,
    cost: "minutes",
    proves: "typecheck, lint (the three seam fences included) and `next build` all pass.",
    next: [
      "npm run typecheck           # the fastest half — run this first while iterating",
      "npm run lint",
      "A fence violation (LLM chokepoint, store seam, route segment config) is fixed at the seam,",
      "never with an eslint-disable. See AGENTS.md § Conventions that bite.",
    ],
    records: "eslint.config.mjs",
  },
  {
    stage: "test:unit",
    script: null,
    cost: "a minute",
    proves: "the node:test suites in test-unit/, including the ones that assert this repository's own wiring.",
    next: [
      "npm run test:unit -- --test-name-pattern '<part of the test name>'",
      "Deleting a test needs an `Ack: <why>` line in the commit message (rubric A4).",
    ],
    records: null,
  },
];

/** Stage → entry. Named lookups only; a typo returns undefined rather than a
 *  plausible-looking wrong remedy. */
export function remedyFor(stage) {
  return CHAIN.find((s) => s.stage === stage) ?? null;
}

/** Print the remedy for a gate that has just failed. Goes to stderr by default,
 *  next to the finding, because that is where the failing reader already is —
 *  and a gate that collects its report for a job summary passes its own `write`
 *  so the remedy lands there too. Silent (and harmless) for an unknown stage: a
 *  gate must never fail to fail. */
/**
 * Print a stage's remedy, and record that the stage fired.
 *
 * @param {string} stage
 * @param {(s?: string) => void} [write]
 * @param {{record?: boolean}} [opts]  `record: false` when this is a LOOKUP rather
 *   than a firing — `npm run gates -- --stage <name>` prints a remedy for a gate
 *   that is perfectly green, and counting that would make the trail a record of
 *   who read the table.
 */
export function printRemedy(stage, write, { record = true } = {}) {
  const entry = remedyFor(stage);
  if (!entry) return;
  // Every gate already calls this on the way out when it goes red, which makes it
  // the one place in the chain that knows a fence fired. Nothing kept that fact
  // before, so "which of these rules has ever caught anything?" was unanswerable
  // for everything except the rubric (scripts/fence-firings.mjs · npm run fences).
  // Never throws and never changes the exit code.
  if (record) recordFiring(entry.stage);
  const say = write ?? ((s = "") => console.error(s));
  say("");
  say(`  → what to do next (\`${entry.stage}\`):`);
  for (const line of entry.next) say(`      ${line}`);
  if (entry.records) {
    say(`    the exception, when this change IS the legitimate one, is recorded in: ${entry.records}`);
  }
  say("    rung discipline: docs/adr/0007-gate-rung-discipline.md · full chain: npm run gates");
  say("");
}

// --- CLI: the whole chain, before it fires ------------------------------------

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--stage");
  const only = i !== -1 ? argv[i + 1] : null;

  if (only) {
    const entry = remedyFor(only);
    if (!entry) {
      console.error(`✗ gates: no stage called \`${only}\`. Run \`npm run gates\` for the chain.`);
      process.exit(1);
    }
    console.log(`${entry.stage} — ${entry.proves}`);
    // A lookup, not a firing — see printRemedy's `record` option.
    printRemedy(only, (s = "") => console.log(s), { record: false });
    process.exit(0);
  }

  console.log("`npm run check:ci` — what runs, in order, and what to do when each one goes red.");
  console.log("");
  for (const [n, entry] of CHAIN.entries()) {
    console.log(`${String(n + 1).padStart(2, " ")}. ${entry.stage}  [${entry.cost}]`);
    console.log(`    ${entry.proves}`);
    for (const line of entry.next) console.log(`      → ${line}`);
    if (entry.records) console.log(`      exception recorded in: ${entry.records}`);
    console.log("");
  }
  console.log(
    "Cheapest first: the eleven zero-dependency checks run before `next build`, so a wrong change is\n" +
      "refused in seconds rather than after a full build. Rungs: docs/adr/0007-gate-rung-discipline.md."
  );
}
