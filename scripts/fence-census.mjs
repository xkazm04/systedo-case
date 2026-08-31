#!/usr/bin/env node
/** Which fences have ever fired, and which exception lists have been widened
 *  (zero-dependency; reads git for dates, nothing over the network).
 *
 *  THE QUESTION. Every rule in `.github/contract-ledger.json` blocks, and the
 *  ledger already answers "what is each one absorbing right now" live, off the
 *  files the gates read. What it has never answered is the other half, and it says
 *  so in its own `$breaches` note: every `breaches` array is empty, for every row,
 *  because the only thing that could fill one was a `--record` pass somebody was
 *  expected to run by hand. So a fence that has caught eleven real problems and a
 *  fence that has never caught anything look identical, and both are inherited
 *  rather than argued about.
 *
 *  .github/workflows/agent-review-history.yml already asks exactly this of the
 *  rubric's Part A rules, and states the reasoning in those words: "a rule that
 *  never fires is dead weight in a blocking gate, and a rule that fires constantly
 *  is either a real problem or a badly drawn line". It can do it because Part A
 *  emits check annotations. This is the same question asked of everything else —
 *  the `check:ci` chain, the SAST rules, the lint fences — off evidence that now
 *  exists because the gates record it (scripts/fence-firings.mjs).
 *
 *  THREE FACTS PER FENCE, each from evidence rather than from a claim:
 *
 *    fired        how often, and when last, from the rolling trail the gates
 *                 append to, plus any `breaches` folded into the ledger. "no
 *                 record" is printed as "no record", never as zero — the trail
 *                 starts empty and a fence with nothing behind it yet has not been
 *                 shown to be dead.
 *    absorbing    the exception list it carries and the ceiling that pays for it,
 *                 straight out of the contract ledger.
 *    widened      when the file holding that exception list was last touched, from
 *                 `git log`. This is the number the second question needs: an
 *                 exception list that grows every month is a fence being negotiated
 *                 with, and one nobody has touched in a year is a fence being kept.
 *
 *  REPORTING RUNG, permanently (docs/adr/0007-gate-rung-discipline.md). It reads a
 *  trail rather than the tree, so there is nothing here a change can break and
 *  nothing it should be allowed to fail a build over. What DOES block is the
 *  inventory: test-unit/fence-census.test.mjs fails when a fence exists that this
 *  census cannot see, so a rule added to the ledger or a stage added to `check:ci`
 *  arrives inside the count rather than outside it.
 *
 *  Usage:
 *    npm run fences                    # the table
 *    npm run fences -- --summary FILE  # append to $GITHUB_STEP_SUMMARY
 *    npm run fences -- --out FILE      # the publishable copy (weekly trail issue)
 *    npm run fences -- --json          # the same census as data
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFirings, summarise, FIRINGS_PATH } from "./fence-firings.mjs";
import { CHAIN } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, ".github", "contract-ledger.json");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const SUMMARY = arg("--summary");
const OUT = arg("--out");
const AS_JSON = argv.includes("--json");

const out = [];
const say = (s = "") => {
  out.push(s);
  if (!AS_JSON) console.log(s);
};

/** ISO date of the last commit touching `path`, or null. Never throws: this runs
 *  outside a git checkout often enough (a tarball, a container) that failing here
 *  would make the census unavailable exactly where it is most wanted. */
export function lastTouched(path, root = ROOT) {
  try {
    const res = spawnSync("git", ["log", "-1", "--format=%cI", "--", path], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    if (res.error || res.status !== 0) return null;
    const iso = String(res.stdout ?? "").trim();
    return iso || null;
  } catch {
    return null;
  }
}

const days = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);
const ago = (iso) => {
  const d = days(iso);
  return d == null ? "—" : d === 0 ? "today" : `${d}d ago`;
};

/** The file whose history says when this rule's exception list last moved. A rule
 *  with no exception list has nothing to widen, which is its own answer. */
export function exceptionFileFor(rule) {
  const m = rule.measure;
  if (!m) return null;
  if (m.kind === "allowlist") return ".github/security/sast-allowlist.json";
  if (m.kind === "exemptions" && m.file) return m.file;
  if (m.file) return m.file;
  return null;
}

/**
 * The census: one row per fence, from the contract ledger plus every `check:ci`
 * stage. The ledger is keyed by the ENFORCEMENT and the chain is keyed by the
 * STAGE, and both are fences somebody can trip — a rule present in both appears
 * once, under the ledger's id.
 *
 * `touched` is injectable so a test can build a census without shelling out to git
 * once per rule; the real one is `lastTouched`.
 */
export function buildCensus({ ledger, chain, firings, touched = lastTouched }) {
  const fired = summarise(firings);
  const rows = [];
  const seen = new Set();

  for (const rule of ledger.rules ?? []) {
    seen.add(rule.id);
    const file = exceptionFileFor(rule);
    rows.push({
      id: rule.id,
      kind: rule.source ?? "rule",
      enforcedBy: rule.enforcedBy ?? "",
      ceiling: rule.ceiling?.max ?? null,
      exceptionFile: file,
      widenedAt: file ? touched(file) : null,
      // A breach folded into the ledger by hand counts the same as one the gate
      // recorded: both are evidence this rule caught something.
      recorded: (rule.breaches?.length ?? 0) + (fired[rule.id]?.count ?? 0),
      lastFired: fired[rule.id]?.last ?? null,
      ci: fired[rule.id]?.ci ?? 0,
      local: fired[rule.id]?.local ?? 0,
    });
  }

  for (const stage of chain) {
    if (seen.has(stage.stage)) continue;
    seen.add(stage.stage);
    rows.push({
      id: stage.stage,
      kind: "check:ci",
      enforcedBy: stage.script ?? "",
      ceiling: null,
      exceptionFile: stage.records ?? null,
      widenedAt: stage.records ? touched(stage.records) : null,
      recorded: fired[stage.stage]?.count ?? 0,
      lastFired: fired[stage.stage]?.last ?? null,
      ci: fired[stage.stage]?.ci ?? 0,
      local: fired[stage.stage]?.local ?? 0,
    });
  }

  // Anything the trail saw that neither source declares. A fence recording under a
  // name nothing knows is a rename nobody propagated, and silently dropping it
  // would make the census quietly incomplete.
  for (const id of Object.keys(fired)) {
    if (seen.has(id)) continue;
    rows.push({
      id,
      kind: "unknown",
      enforcedBy: "(nothing in the ledger or the chain declares this id)",
      ceiling: null,
      exceptionFile: null,
      widenedAt: null,
      recorded: fired[id].count,
      lastFired: fired[id].last,
      ci: fired[id].ci,
      local: fired[id].local,
    });
  }

  return rows;
}

// --- report -------------------------------------------------------------------

if (!existsSync(LEDGER)) {
  console.error(`✗ fences: ${LEDGER} does not exist — there is no inventory to census.`);
  process.exit(0); // reporting rung: never a build failure
}

let ledger = { rules: [] };
try {
  ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
} catch (err) {
  console.error(`✗ fences: ${LEDGER} is not valid JSON — ${err.message}`);
  process.exit(0);
}

const firings = readFirings();
const rows = buildCensus({ ledger, chain: CHAIN, firings });

if (AS_JSON) {
  const payload = { schema: 1, at: new Date().toISOString(), trail: FIRINGS_PATH, fences: rows };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (OUT) writeFileSync(OUT, text);
  else process.stdout.write(text);
  process.exit(0);
}

const withEvidence = rows.filter((r) => r.recorded > 0);
say(`Fence census — ${rows.length} fence(s), ${firings.length} recorded firing(s)`);
say("");
say(
  firings.length
    ? `Trail: ${FIRINGS_PATH.replace(ROOT, ".")} (rolling, git-ignored — this machine and this runner only)`
    : "Trail: EMPTY. The gates record from the first red run; nothing here has gone red yet, so every" +
        ' "no record" below means untested rather than dead.'
);
say("");
say("| fence | kind | fired | last | exception list | last widened |");
say("|---|---|---|---|---|---|");
for (const r of rows.slice().sort((a, b) => b.recorded - a.recorded || a.id.localeCompare(b.id))) {
  const fired = r.recorded ? `${r.recorded}${r.ci || r.local ? ` (ci ${r.ci}, local ${r.local})` : ""}` : "no record";
  const ceiling = r.ceiling != null ? ` (ceiling ${r.ceiling})` : "";
  say(
    `| \`${r.id}\` | ${r.kind} | ${fired} | ${ago(r.lastFired)} | ` +
      `${r.exceptionFile ? `\`${r.exceptionFile}\`${ceiling}` : "—"} | ${ago(r.widenedAt)} |`
  );
}

say("");
say("### What to do with this");
say("");
say(
  `- **${withEvidence.length} of ${rows.length}** fences have evidence of ever catching anything. The rest are ` +
    "either genuinely quiet or simply older than this trail — the trail is what tells the two apart, and it " +
    "only tells you after it has run for a while."
);
say(
  "- A fence with no record after several months of real changes is a candidate to argue about, not to keep " +
    "by default: it is in a chain every change pays for."
);
say(
  "- A fence firing constantly is the other finding. Fix it at the source or redraw the line — widening its " +
    "exception list is the move this census exists to make visible, which is why `last widened` is next to it."
);
say(
  "- Before widening any list: read when it last moved. A list that grows every month is a fence being " +
    "negotiated with. The ceiling that pays for an entry lives in `.github/contract-ledger.json`."
);
say("");
say(
  "Not covered: the three ESLint fences (`adamant/seams`, `adamant/seams-lib`, `adamant/route-segment-config`) " +
    "record nothing, because `eslint` does not run any of this repository's code on the way out. Their " +
    "exception lists ARE counted above, so widening one is visible; a firing is not. Closing that would mean " +
    "wrapping `npm run lint`, which is the command that gates every other change here."
);

if (SUMMARY) {
  try {
    appendFileSync(SUMMARY, `${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}
if (OUT) {
  try {
    writeFileSync(OUT, `${out.join("\n")}\n`);
  } catch (err) {
    console.error(`(could not write ${OUT}: ${err.message})`);
  }
}

// Reporting rung: this reads a trail, it never judges a change.
process.exit(0);
