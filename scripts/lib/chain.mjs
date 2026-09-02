/** The `check:ci` chain, parsed — once, in one place.
 *
 *  The chain is DECLARED once, in package.json's `check:ci` entry, and that has
 *  always been the rule. What was not once was the PARSING of it: the same
 *  `matchAll(/npm run ([\w:-]+)/g)` was written out again in
 *  scripts/gate-timings.mjs and in four test files that hold the chain to the
 *  remedy table, the constraint map, the timings and the delivery contract. Five
 *  copies of one regex is five chances for them to disagree about what a stage
 *  name may contain — and the failure would be silent in the worst way, because a
 *  stage a parser cannot see is a stage every check built on that parser skips.
 *
 *  Zero-dependency and I/O-free, so a test can import it without running anything.
 */

/** A stage name as it appears in an npm script chain: `npm run <name>`. */
const STAGE_RE = /npm run ([\w:-]+)/g;

/**
 * The stages an npm script chain runs, in the order it runs them.
 *
 * @param {string|undefined|null} script  the `check:ci` entry, or any `&&` chain
 * @returns {string[]}
 */
export const stagesFrom = (script) => [...String(script ?? "").matchAll(STAGE_RE)].map((m) => m[1]);

/**
 * The `check:ci` chain of a parsed package.json.
 *
 * @param {{scripts?: Record<string,string>}} pkg
 * @returns {string[]}
 */
export const chainStages = (pkg) => stagesFrom(pkg?.scripts?.["check:ci"]);
