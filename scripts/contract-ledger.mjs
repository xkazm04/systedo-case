#!/usr/bin/env node
/** The contract, read back: which of this repository's rules actually catch
 *  anything (zero-dependency, offline).
 *
 *  WHY THIS EXISTS. `AGENTS.md` is coherent and most of it is machine-checked —
 *  ESLint fences, SAST rules, the rubric's Part A, a dozen gates. What none of
 *  that could tell you is which rules are *earning their place*. A rule that fires
 *  every week is either a real hazard or a badly drawn line. A rule that has never
 *  fired is either holding a line nobody crosses any more, or drawn somewhere the
 *  work does not go — and from inside a single green build those two look
 *  identical. Guidance that cannot be read back is guidance that only grows.
 *
 *  So this keeps a ledger: one row per rule in the contract, what enforces it,
 *  what it is currently absorbing, and every breach that has been recorded against
 *  it. `.github/contract-ledger.json` is the record; this script keeps it honest
 *  and prints it.
 *
 *  RUNG DISCIPLINE (docs/adr/0007-gate-rung-discipline.md). Two halves:
 *
 *    BLOCKING — passes on the tree today, so red is a regression:
 *      • every rule DISCOVERED in the sources has a row (a new fence lands with a
 *        line in the ledger, or it lands invisible);
 *      • every row that claims a discovered rule still resolves to one (a renamed
 *        or deleted rule cannot leave a row behind claiming to cover it);
 *      • every hand-written row's `probe` still appears in the file it names.
 *
 *    REPORTING — the numbers. Absorbed debt (allowlist entries, ratchet baselines,
 *      files already over a limit) is MEASURED live from the same files the gates
 *      read, so it cannot be stale. Recorded breaches come from `--record`, which
 *      takes the JSON an agent-review run writes (`scripts/agent-review.mjs
 *      --json`). Neither ever fails the build: a count is a question for the weekly
 *      triage, not a verdict on the change in front of it.
 *
 *  WHAT TO DO WITH IT. Two lists at the bottom of the report:
 *    • a FENCE that has never fired and absorbs nothing — ask whether the sentence
 *      in AGENTS.md that it came from is still describing this repository;
 *    • a PROSE rule with no fence and no counter — it is enforced by whoever
 *      happens to read it. Either it becomes a fence, or the sentence is doing
 *      nothing and should go. AGENTS.md is read in full by every agent on every
 *      run; a paragraph that changes no behaviour is not free.
 *
 *  Usage:
 *    node scripts/contract-ledger.mjs                  # print the ledger
 *    node scripts/contract-ledger.mjs --check          # + fail on a parity break
 *    node scripts/contract-ledger.mjs --record FILE    # fold in a review's --json
 *    node scripts/contract-ledger.mjs --summary FILE --out FILE
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, ".github", "contract-ledger.json");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const CHECK = argv.includes("--check");
const RECORD_FILE = arg("--record");
const SUMMARY_FILE = arg("--summary");
const OUT_FILE = arg("--out");

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : null);

// --- 1. discovery: the rules the sources actually define ---------------------
//
// Three sources define a rule as a structured id, so the ledger can be held to
// them mechanically. Everything else in the contract is a whole script or a
// paragraph, and those rows carry a `probe` or are marked prose instead.

const DISCOVERY = {
  /** Part A of the rubric — the mechanical half that refuses a push. */
  "agent-review": {
    file: "scripts/agent-review.mjs",
    extract: (text) => [...text.matchAll(/rule:\s*"([^"]+)"/g)].map((m) => m[1]),
  },
  /** The security rules, keyed by the id each finding is reported under. */
  sast: {
    file: "scripts/sast.mjs",
    extract: (text) => {
      const from = text.indexOf("const RULES = [");
      const body = from === -1 ? text : text.slice(from);
      return [...body.matchAll(/^\s*id:\s*"([^"]+)",\s*$/gm)].map((m) => m[1]);
    },
  },
  /** The lint fences — named config blocks, so a fence cannot be deleted quietly. */
  eslint: {
    file: "eslint.config.mjs",
    extract: (text) => [...text.matchAll(/name:\s*"(adamant\/[^"]+)"/g)].map((m) => m[1]),
  },
};

const discovered = new Map(); // source → string[]
const discoveryErrors = [];
for (const [source, spec] of Object.entries(DISCOVERY)) {
  const text = read(spec.file);
  if (text === null) {
    discoveryErrors.push(`${spec.file} does not exist, so the rules it defines cannot be checked against the ledger.`);
    discovered.set(source, []);
    continue;
  }
  const ids = spec.extract(text);
  if (!ids.length) {
    discoveryErrors.push(
      `${spec.file} defines no rule ids any more. Either the rules were removed, or their shape changed and ` +
        "the extractor in scripts/contract-ledger.mjs has to follow."
    );
  }
  discovered.set(source, ids);
}

// --- 2. the ledger ------------------------------------------------------------

if (!existsSync(LEDGER)) {
  console.error(`✗ contract ledger: ${LEDGER} is missing — it is the record this script keeps.`);
  process.exit(1);
}

let ledger;
try {
  ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
} catch (err) {
  console.error(`✗ contract ledger: .github/contract-ledger.json is not parseable JSON — ${err.message}`);
  process.exit(1);
}
const rows = ledger.rules ?? [];

// --- 3. --record: fold a review's findings in ---------------------------------
//
// scripts/agent-review.mjs --json writes one record per reviewed change. Folding
// it in here is what turns "the build went red once" into "A1 has fired four
// times this quarter, always on the same two files".

if (RECORD_FILE) {
  if (!existsSync(RECORD_FILE)) {
    console.error(`✗ --record: ${RECORD_FILE} does not exist.`);
    process.exit(1);
  }
  let record;
  try {
    record = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
  } catch (err) {
    console.error(`✗ --record: ${RECORD_FILE} is not parseable JSON — ${err.message}`);
    process.exit(1);
  }
  const head = String(record.head ?? "").slice(0, 8);
  const at = String(record.generatedAt ?? new Date().toISOString()).slice(0, 10);
  let added = 0;
  for (const finding of record.blocking ?? []) {
    const row = rows.find((r) => r.id === finding.rule);
    if (!row) {
      console.error(
        `⚠ --record: no ledger row for rule "${finding.rule}" — add one to .github/contract-ledger.json ` +
          "(this is the case `--check` refuses, so it should not survive a CI run)."
      );
      continue;
    }
    row.breaches = row.breaches ?? [];
    if (row.breaches.some((b) => b.head === head && b.path === (finding.path ?? null))) continue;
    row.breaches.push({ at, head: head || null, path: finding.path ?? null });
    added += 1;
  }
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`✓ recorded ${added} breach(es) from ${RECORD_FILE} into .github/contract-ledger.json.`);
  process.exit(0);
}

// --- 4. parity: the ledger against the sources --------------------------------

const failures = [];

for (const [source, ids] of discovered) {
  for (const id of ids) {
    const row = rows.find((r) => r.id === id && r.source === source);
    if (!row) {
      failures.push(
        `${DISCOVERY[source].file} defines rule \`${id}\` and the ledger has no row for it. ` +
          "A fence that lands without a row is a rule nobody can ever ask whether it fired — add it to " +
          ".github/contract-ledger.json with what it is for."
      );
    }
  }
}

for (const row of rows) {
  if (row.source) {
    const ids = discovered.get(row.source);
    if (!ids) {
      failures.push(`${row.id}: names unknown discovery source "${row.source}".`);
    } else if (!ids.includes(row.id) && ids.length) {
      failures.push(
        `${row.id}: the ledger says ${DISCOVERY[row.source].file} enforces this, and it no longer defines it. ` +
          "Either the rule was renamed (rename the row) or it was deleted (delete the row, and say in the " +
          "commit what replaced it)."
      );
    }
    continue;
  }
  if (row.surface === "prose") continue; // nothing mechanical to point at — that IS the row's finding
  if (!row.probe?.file || !row.probe?.contains) {
    failures.push(`${row.id}: a non-prose row needs either a discovery \`source\` or a \`probe\` naming what enforces it.`);
    continue;
  }
  const text = read(row.probe.file);
  if (text === null) {
    failures.push(`${row.id}: probe file ${row.probe.file} does not exist.`);
  } else if (!text.includes(row.probe.contains)) {
    failures.push(
      `${row.id}: ${row.probe.file} no longer contains ${JSON.stringify(row.probe.contains)}, so the ledger's ` +
        "claim that this rule is enforced there is stale."
    );
  }
}

// --- 5. measurement: what each rule is absorbing right now ---------------------
//
// Everything here is derived from the files the gates themselves read, so the
// ledger cannot report a number that was true last month. A measurement that
// throws is reported as unknown — a broken counter must not fail a build.

function walk(dir, exts) {
  const out = [];
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "node_modules" && !entry.startsWith(".")) stack.push(path);
      } else if (exts.some((e) => entry.endsWith(e))) {
        out.push(path);
      }
    }
  }
  return out;
}

function measure(spec) {
  if (!spec) return null;
  switch (spec.kind) {
    /** Deliberate exceptions to a SAST rule: each one is a breach that was read
     *  and accepted, which is exactly the number this ledger is for. */
    case "allowlist": {
      const text = read(".github/security/sast-allowlist.json");
      if (text === null) return null;
      const entries = JSON.parse(text)[spec.rule] ?? {};
      return { count: Object.keys(entries).length, unit: "allowlisted exception(s)", detail: Object.keys(entries) };
    }
    /** A ratchet baseline IS a count of findings that were absorbed rather than
     *  fixed — the honest number for "how often is this rule broken". */
    case "ratchet": {
      const text = read(spec.file);
      if (text === null) return null;
      const from = text.indexOf("const RATCHET");
      const body = from === -1 ? text : text.slice(from);
      const m = new RegExp(`\\b${spec.key}:\\s*(\\d+)`).exec(body);
      return m ? { count: Number(m[1]), unit: `${spec.key} baseline`, detail: [] } : null;
    }
    /** Files already past a limit the rule polices. A1 blocks *growth* past 200
     *  lines, so the population over the line is what the rule is living with. */
    case "locOver": {
      const files = walk(spec.dir, spec.ext);
      const over = files.filter((p) => readFileSync(p, "utf8").replace(/\n$/, "").split(/\r?\n/).length > spec.loc);
      return {
        count: over.length,
        unit: `file(s) over ${spec.loc} lines`,
        detail: over.map((p) => relative(ROOT, p).replace(/\\/g, "/")).sort(),
      };
    }
    /** Live occurrences of the thing a rule forbids. Zero is the expected answer;
     *  a non-zero one means the fence is being routed around somewhere. */
    case "occurrences": {
      const files = walk(spec.dir, spec.ext);
      const re = new RegExp(spec.pattern);
      const hits = [];
      for (const p of files) {
        const lines = readFileSync(p, "utf8").split(/\r?\n/);
        lines.forEach((l, i) => {
          if (re.test(l)) hits.push(`${relative(ROOT, p).replace(/\\/g, "/")}:${i + 1}`);
        });
      }
      return { count: hits.length, unit: "occurrence(s)", detail: hits.slice(0, 10) };
    }
    default:
      return null;
  }
}

const measured = new Map();
for (const row of rows) {
  try {
    measured.set(row.id, measure(row.measure));
  } catch (err) {
    measured.set(row.id, { count: null, unit: `unmeasurable — ${err.message}`, detail: [] });
  }
}

// --- 6. report ----------------------------------------------------------------

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const breachCount = (row) => (row.breaches ?? []).length;
const lastBreach = (row) =>
  (row.breaches ?? []).map((b) => b.at).sort().slice(-1)[0] ?? null;

say("## The contract, read back");
say("");
say(
  `${rows.length} rule(s) in the ledger · ${[...discovered.values()].reduce((n, ids) => n + ids.length, 0)} ` +
    "discovered from source · " +
    `${rows.reduce((n, r) => n + breachCount(r), 0)} recorded breach(es)`
);
say("");
say("| Rule | Enforced by | Absorbing now | Breaches recorded | Last |");
say("| --- | --- | ---: | ---: | --- |");

const sorted = [...rows].sort((a, b) => {
  const score = (r) => breachCount(r) * 100 + (measured.get(r.id)?.count ?? 0);
  return score(b) - score(a);
});
for (const row of sorted) {
  const m = measured.get(row.id);
  const absorbing = m ? (m.count === null ? m.unit : `${m.count} ${m.unit}`) : row.surface === "prose" ? "—" : "0";
  say(
    `| \`${row.id}\` | ${row.enforcedBy ?? (row.source ? DISCOVERY[row.source].file : "nothing — prose")} | ` +
      `${absorbing} | ${breachCount(row)} | ${lastBreach(row) ?? "—"} |`
  );
}
say("");

const neverFired = rows.filter(
  (r) => r.surface !== "prose" && breachCount(r) === 0 && (measured.get(r.id)?.count ?? 0) === 0
);
if (neverFired.length) {
  say(`### ${neverFired.length} fence(s) with nothing recorded against them`);
  say("");
  say(
    "Not a problem — a fence nobody crosses may be why nobody crosses it. It IS a question: is the sentence " +
      "in AGENTS.md that this came from still describing this repository, or is it describing a mistake that " +
      "stopped being possible?"
  );
  say("");
  for (const r of neverFired) say(`- \`${r.id}\` — ${r.why ?? ""}`);
  say("");
}

const unfenced = rows.filter((r) => r.surface === "prose");
if (unfenced.length) {
  say(`### ${unfenced.length} rule(s) enforced by nothing but reading`);
  say("");
  say(
    "Each of these is a paragraph every agent reads on every run and nothing checks. That is the right shape " +
      "for some of them and a fence waiting to be written for others — the ledger's job is to make the choice " +
      "explicit rather than let the paragraph accumulate."
  );
  say("");
  for (const r of unfenced) say(`- \`${r.id}\` — ${r.why ?? ""}${r.verdict ? ` **${r.verdict}**` : ""}`);
  say("");
}

if (discoveryErrors.length) {
  say("### Discovery problems");
  say("");
  for (const e of discoveryErrors) say(`- ${e}`);
  say("");
}

if (failures.length) {
  say(`### ✗ ${failures.length} ledger parity failure(s)`);
  say("");
  for (const f of failures) say(`- ${f}`);
  say("");
}

say(
  "_Absorbing now_ is measured live from the same files the gates read (allowlists, ratchet baselines, the " +
    "population already over a limit). _Breaches recorded_ come from `--record`, fed the JSON a rubric review " +
    "writes. Neither number fails a build; the parity check above does."
);

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

if (failures.length || discoveryErrors.length) {
  if (CHECK) process.exit(1);
  console.error("\n(reporting run — `--check` would have failed here.)");
}
