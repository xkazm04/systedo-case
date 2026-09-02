#!/usr/bin/env node
/** The inner loop: the same gate, minus the two stages that cost minutes.
 *
 *  WHY. `npm run check:ci` is sixteen stages, and two of them dominate it —
 *  `npm run check` (whose `next build` is minutes) and `npm run test:unit` (499
 *  files). The other fourteen are zero-dependency checks that read files and finish
 *  in seconds. That shape is right for a GATE, which runs once, at push time, and
 *  must be complete. It is the wrong shape for FEEDBACK: a one-line change pays
 *  exactly what a refactor pays, so the honest signal gets consulted once at the end
 *  of a run rather than after each step — and an agent iterating against a wall
 *  clock is the reader that costs the most, because every attempt it cannot afford
 *  is an attempt that becomes a human's problem instead.
 *
 *  `npm run test:fast` already scoped the SUITE to the tests that name what you
 *  changed. This scopes the CHAIN around it, so there is one command to run
 *  mid-edit:
 *
 *      npm run check:fast          # the cheap gates, typecheck, lint, scoped tests
 *      npm run check:fast -- --list
 *
 *  WHAT IT RUNS, and where the list comes from. The stages are read out of
 *  `scripts/gate-remedy.mjs`'s CHAIN — the one place the gate is declared — and
 *  selected by the `cost` each stage already carries, which
 *  `npm run check:ci:timed` holds to a clock on every CI run. So this cannot drift
 *  from the gate: a stage added to `check:ci` joins the fast lane automatically if
 *  it is cheap, and is skipped automatically if it is not.
 *
 *  WHAT IT DOES NOT RUN, and why that is printed every time:
 *
 *    • `next build` — the single most expensive stage, and the one that catches what
 *      typecheck and lint cannot (a server/client boundary error, a bad import in a
 *      route). A change can pass this lane and fail the build.
 *    • the full unit suite — `test:fast` selects the tests that NAME a file you
 *      changed, which is a subset, and a subset can be green while the suite is red.
 *
 *  IT IS NOT A GATE AND MUST NEVER BECOME ONE. `npm run check:ci` inside
 *  `.husky/pre-push` is what decides a push, for the same reason
 *  `scripts/test-fast.mjs` says it about itself: a partial answer that looks like a
 *  verdict is worse than no answer. test-unit/check-fast.test.mjs asserts this is
 *  not wired into `check:ci`, and this script says so on the way out, every time,
 *  whether it passed or failed.
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The cheap half of the declared chain, in the order the chain runs it. */
export const cheapStages = (chain = CHAIN) => chain.filter((s) => s.cost === "seconds").map((s) => s.stage);

/** What the gate runs and this deliberately does not, with what each one would have
 *  caught — a lane that lists its omissions as bare names teaches nobody. */
export const OMITTED = [
  {
    stage: "test:unit",
    instead: ["test:fast"],
    missing:
      "the whole unit suite. `test:fast` runs the tests that NAME a file you changed, plus the always tier — a " +
      "subset, which can be green while the suite is red.",
  },
  {
    stage: "check",
    instead: ["typecheck", "lint"],
    missing:
      "`next build` — a server/client boundary error, a route that imports something it may not, a page that " +
      "only fails when it is compiled. Nothing below runs it.",
  },
];

/** The lane: the cheap gates from the chain, then the two halves of `check` that are
 *  not the build, then the scoped suite. */
export const laneStages = (chain = CHAIN) => [...cheapStages(chain), "typecheck", "lint", "test:fast"];

const argv = process.argv.slice(2);
const LIST = argv.includes("--list");
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

/** Printed on both paths — a green here is not a verdict, and a reader who has just
 *  seen fourteen ticks is exactly the reader about to treat it as one. */
function sayWhatWasSkipped(write = console.log) {
  write("");
  write("This is NOT the gate. `npm run check:ci` is, and it also runs:");
  for (const o of OMITTED) {
    write(`  • ${o.stage} — ${o.missing}`);
  }
  write("");
  write("Run `npm run check:ci` before you push. `.husky/pre-push` runs it for you on a push to master.");
}

if (invokedDirectly) {
  const stages = laneStages();

  if (LIST) {
    console.log("`npm run check:fast` — the inner loop, in order:\n");
    for (const [n, stage] of stages.entries()) console.log(`  ${String(n + 1).padStart(2, " ")}. ${stage}`);
    sayWhatWasSkipped();
    process.exit(0);
  }

  console.log(`check:fast — ${stages.length} stage(s), cheapest first, no build and no full suite.\n`);

  const startedAt = Date.now();
  for (const stage of stages) {
    const res = spawnSync("npm", ["run", stage], { cwd: ROOT, stdio: "inherit", shell: true });
    if (res.status !== 0) {
      console.error(`\n✗ check:fast: \`npm run ${stage}\` failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
      console.error("  The remedy for every stage of the gate: npm run gates -- --stage " + stage);
      sayWhatWasSkipped((s = "") => console.error(s));
      process.exit(res.status ?? 1);
    }
  }

  console.log(`\n✓ check:fast: ${stages.length} stage(s) green in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
  sayWhatWasSkipped();
}
