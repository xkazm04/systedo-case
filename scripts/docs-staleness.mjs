#!/usr/bin/env node
/** Documentation staleness — the failure mode parity cannot see (zero-dependency).
 *
 *  `npm run docs:parity` proves the bilingual pair states the same claims,
 *  `npm run adr:check` proves an ADR's cited paths still resolve, and
 *  test-unit/docs-task-index.test.mjs proves the routing table points at files that
 *  exist. All three check INTERNAL consistency, and all three are green on a page
 *  that is spelled identically in both languages, routed to correctly, and
 *  describing a seam that moved six months ago. On a repository where an agent
 *  orients from documents before it reads code, that page is worse than a missing
 *  one: it is a confident wrong answer at the moment a reader has no other.
 *
 *  WHAT IT MEASURES. For every entry in .github/docs-staleness.json, two dates out
 *  of git: when the DOC was last committed, and the newest commit to any path in
 *  its `watches`. Two ways to be stale:
 *
 *    overtaken  the code the doc describes has moved since the doc was last
 *               touched. This is the one that matters — staleness measured in
 *               commits to the things the doc names, not in calendar days. A
 *               runbook for a seam nobody has touched in a year is not stale, it
 *               is finished.
 *    aged       the doc itself has gone longer than its `maxAgeDays` without
 *               anyone looking at it. The backstop for a doc whose subject is not
 *               a set of paths.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md). `ratchet.stale` is null until
 *  somebody runs this, so `--check` prints and exits 0 — a check whose baseline has
 *  never been measured has not earned the right to block, and a gate that goes red
 *  the day it lands teaches everyone to skip it. Accept the count once:
 *
 *      npm run docs:staleness
 *      npm run docs:staleness -- --accept --reason "..."
 *
 *  and from then on the count may never rise. The way back down is to read the doc,
 *  never to raise the ratchet (AGENTS.md § Conventions that bite).
 *
 *  What is blocking TODAY is the registry's shape: test-unit/docs-staleness.test.mjs
 *  fails an entry naming a document or a watched path that does not exist, and a
 *  runbook that lands with no budget.
 *
 *  Usage:
 *    node scripts/docs-staleness.mjs                     # report
 *    node scripts/docs-staleness.mjs --check             # ratchet (see above)
 *    node scripts/docs-staleness.mjs --accept --reason "…"
 *    node scripts/docs-staleness.mjs --summary FILE
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_REL = ".github/docs-staleness.json";
const CONFIG = join(ROOT, CONFIG_REL);

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const CHECK = argv.includes("--check");
const ACCEPT = argv.includes("--accept");
const REASON = flag("--reason");
const SUMMARY = flag("--summary");

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

function die(message) {
  console.error(`✗ docs staleness: ${message}`);
  process.exit(1);
}

if (!existsSync(CONFIG)) die(`${CONFIG_REL} does not exist — there is no budget to measure against.`);
let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (err) {
  die(`${CONFIG_REL} is not valid JSON — ${err.message}`);
}
const entries = Array.isArray(config.docs) ? config.docs : [];
if (!entries.length) die(`${CONFIG_REL} governs no documents.`);

/** The commit date (epoch seconds) of the newest commit touching `path`, or null
 *  when git cannot answer — an unborn history, a path never committed, or no git
 *  at all. A measurement this cannot make is reported as unknown, never as fresh:
 *  a gate that silently scores an unanswerable question as a pass is the shape
 *  ADR-0007 exists to refuse. */
function lastCommit(path) {
  try {
    const stdout = execFileSync("git", ["log", "-1", "--format=%ct", "--", path], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return stdout ? Number(stdout) : null;
  } catch {
    return null;
  }
}

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;
const days = (from) => Math.floor((NOW - from) / DAY);
const fmtDays = (n) => (n === null ? "  ?" : String(n).padStart(3));

const rows = [];
for (const entry of entries) {
  const docAt = lastCommit(entry.doc);
  let watchAt = null;
  let watchPath = null;
  for (const w of entry.watches ?? []) {
    const at = lastCommit(w);
    if (at !== null && (watchAt === null || at > watchAt)) {
      watchAt = at;
      watchPath = w;
    }
  }
  const docAge = docAt === null ? null : days(docAt);
  const overtaken = docAt !== null && watchAt !== null && watchAt > docAt;
  const aged = docAge !== null && typeof entry.maxAgeDays === "number" && docAge > entry.maxAgeDays;
  rows.push({
    doc: entry.doc,
    docAge,
    behindBy: overtaken ? days(docAt) - days(watchAt) : 0,
    overtakenBy: overtaken ? watchPath : null,
    aged,
    maxAgeDays: entry.maxAgeDays ?? null,
    unknown: docAt === null,
    stale: overtaken || aged,
  });
}

const stale = rows.filter((r) => r.stale);
const unknown = rows.filter((r) => r.unknown);

say(`Documentation staleness — ${rows.length} governed document(s), read from ${CONFIG_REL}`);
say("");
say("  age  doc                                            verdict");
for (const r of rows.slice().sort((a, b) => (b.docAge ?? -1) - (a.docAge ?? -1))) {
  const verdict = r.unknown
    ? "unknown (no commit touches it — is it committed?)"
    : r.overtakenBy
      ? `OVERTAKEN — ${r.overtakenBy} moved ${r.behindBy}d after it was last read`
      : r.aged
        ? `AGED — ${r.docAge}d without a touch, budget ${r.maxAgeDays}d`
        : "fresh";
  say(`  ${fmtDays(r.docAge)}d ${r.doc.padEnd(46)} ${verdict}`);
}
say("");
say(`  stale: ${stale.length} of ${rows.length}${unknown.length ? ` (${unknown.length} unmeasurable)` : ""}`);

// --- --accept: pin the count -------------------------------------------------

if (ACCEPT) {
  if (!REASON || REASON.trim().length < 12) {
    die(
      '--accept needs `--reason "…"` saying what was read and why this count is the right one to hold. ' +
        "A baseline nobody explained is a number the next reader cannot argue with."
    );
  }
  config.ratchet = {
    stale: stale.length,
    acceptedOn: new Date().toISOString().slice(0, 10),
    reason: REASON.trim(),
  };
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  say("");
  say(`✓ ${CONFIG_REL}: ratchet.stale = ${stale.length}. The count may never rise — commit the file.`);
  process.exit(0);
}

// --- --check: the ratchet ----------------------------------------------------

let code = 0;
if (CHECK) {
  const floor = config.ratchet?.stale;
  if (typeof floor !== "number") {
    say("");
    say(
      "⚠ reporting only: ratchet.stale is not set, so nothing can fail yet. A check whose baseline has never " +
        "been measured has not earned the right to block (docs/adr/0007-gate-rung-discipline.md)."
    );
    say(`  Next: npm run docs:staleness -- --accept --reason "what you read and why ${stale.length} is right"`);
  } else if (stale.length > floor) {
    say("");
    say(`✗ ${stale.length} stale document(s), above the accepted ceiling of ${floor}:`);
    for (const r of stale) say(`  • ${r.doc} — ${r.overtakenBy ? `overtaken by ${r.overtakenBy}` : `${r.docAge}d old`}`);
    say("");
    say("  Read the document and bring it back into line with the code it describes, then commit both.");
    say("  Raising the ceiling is the wrong fix: the rule firing IS the drift being caught.");
    say(`  Next: open the file above; then \`npm run docs:staleness\` to confirm the count fell.`);
    code = 1;
  } else {
    say("");
    say(`✓ ${stale.length} stale document(s), within the accepted ceiling of ${floor}.`);
  }
}

if (SUMMARY) {
  try {
    appendFileSync(SUMMARY, `### Documentation staleness\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

process.exit(code);
