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
 *      • every hand-written row's `probe` still appears in the file it names;
 *      • every EXCEPTION LIST has a ceiling, and is under it (see below).
 *
 *    REPORTING — the rest of the numbers. Absorbed debt (ratchet baselines, files
 *      already over a limit) is MEASURED live from the same files the gates read,
 *      so it cannot be stale. Recorded breaches come from `--record`, which takes
 *      the JSON an agent-review run writes (`scripts/agent-review.mjs --json`).
 *      Neither fails the build: a count is a question for the weekly triage, not a
 *      verdict on the change in front of it.
 *
 *  THE CEILING, AND WHY IT IS THE ONE NUMBER THAT BLOCKS. Two of this repository's
 *  fences are drawn narrow on purpose — the ESLint seams name the modules that
 *  exist, and `.github/security/sast-allowlist.json` names the files a security
 *  rule fires on and is right about anyway. Both are the correct shape, and both
 *  are one entry away from being the wrong one: an exception list that can grow by
 *  a line per inconvenient diff erodes its fence without ever turning a build red,
 *  and an agent under time pressure adds an entry as readily as it fixes a cause
 *  (AGENTS.md § amber). Nothing measured the growth, so nothing could refuse it.
 *
 *  So a row that measures an exception list carries a `ceiling`:
 *
 *      "ceiling": { "max": 5, "reason": "…", "comesOffWhen": "…" }
 *
 *  `max` is what the list holds TODAY, so the gate is green on arrival (ADR-0007)
 *  and red the moment a list grows. `reason` is why the entries are collectively
 *  defensible; `comesOffWhen` is the condition under which they stop being needed,
 *  which is the field an exemption list normally never has and the reason they
 *  become permanent. Required on every allowlist/exemption row, so a NEW fence
 *  cannot land with an uncapped exception list.
 *
 *  Raising a ceiling is allowed and is the point: it is one line in a reviewed
 *  diff, next to the entry it pays for, with a sentence saying why. What is no
 *  longer possible is adding the entry and nothing else.
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
 *                                                      #   or an exception list
 *                                                      #   over its ceiling
 *    node scripts/contract-ledger.mjs --record FILE    # fold in a review's --json
 *    node scripts/contract-ledger.mjs --ledger FILE    # read a different ledger
 *                                                      #   (test-unit uses it)
 *    node scripts/contract-ledger.mjs --summary FILE --out FILE
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};
const CHECK = argv.includes("--check");
const RECORD_FILE = arg("--record");
const SUMMARY_FILE = arg("--summary");
const OUT_FILE = arg("--out");
/** The ledger this run reads. Overridable so a test can point the REAL rules at a
 *  fixture and prove the ceiling actually refuses a grown list — a gate nobody has
 *  seen fail is a gate nobody knows is wired. */
const LEDGER = arg("--ledger") ?? join(ROOT, ".github", "contract-ledger.json");

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
    /** The other exception list, and the one nothing was counting: the names a
     *  LINT fence waves through. Read out of the named config block in
     *  eslint.config.mjs — every string in an `allowImportNames` array (a symbol
     *  that crosses the fence) plus every rule the block switches `"off"` (a whole
     *  directory that does not have to obey it). Text, not `import`: this script
     *  is zero-dependency and offline (ADR-0008), and importing the config would
     *  pull in eslint and eslint-config-next to count three strings. */
    case "exemptions": {
      const text = read(spec.file);
      if (text === null) return null;
      const opener = `name: "${spec.block}"`;
      const start = text.indexOf(opener);
      if (start === -1) return null;
      const after = text.slice(start + opener.length);
      const end = after.indexOf('name: "');
      const body = end === -1 ? after : after.slice(0, end);
      const allowed = [...body.matchAll(/allowImportNames:\s*\[([^\]]*)\]/g)].flatMap((m) =>
        [...m[1].matchAll(/"([^"]+)"/g)].map((s) => `allowImportNames: ${s[1]}`)
      );
      const off = [...body.matchAll(/"([^"]+)":\s*"off"/g)].map((m) => `${m[1]}: off`);
      return {
        count: allowed.length + off.length,
        unit: "exception(s) on the fence",
        detail: [...allowed, ...off],
      };
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

// --- 5b. the ceiling on an exception list -------------------------------------
//
// Blocking, and the only measured number here that is. See the header: a fence
// whose exception list can grow by one entry per inconvenient diff is a fence
// that erodes without a build ever going red. Two invariants:
//
//   • a row that measures an exception list MUST carry a ceiling, with a reason
//     and — once there is anything to come off — the condition under which it
//     does. That is what stops a new fence landing with an uncapped list.
//   • no measured count may exceed its row's ceiling. Growing a list is then a
//     two-line diff (the entry, and the ceiling that pays for it), which is
//     exactly the conversation the entry deserves.
//
// A count that could not be measured is never a failure — a broken counter must
// not be able to stop a change.

/** Measures whose whole content is "exceptions somebody accepted". */
const EXCEPTION_KINDS = new Set(["allowlist", "exemptions"]);

for (const row of rows) {
  const kind = row.measure?.kind;
  const ceiling = row.ceiling;

  if (EXCEPTION_KINDS.has(kind) && !ceiling) {
    failures.push(
      `${row.id}: measures an exception list and declares no \`ceiling\`. An exception list with no ceiling ` +
        "grows one entry at a time and never turns a build red — add " +
        '`"ceiling": { "max": <today\'s count>, "reason": "…", "comesOffWhen": "…" }`.'
    );
    continue;
  }
  if (!ceiling) continue;

  if (typeof ceiling.max !== "number" || !Number.isInteger(ceiling.max) || ceiling.max < 0) {
    failures.push(`${row.id}: \`ceiling.max\` must be a non-negative integer — it is what the list holds today.`);
    continue;
  }
  if (!String(ceiling.reason ?? "").trim()) {
    failures.push(
      `${row.id}: the ceiling has no \`reason\`. A number with no sentence is a limit nobody can argue with, ` +
        "which is how it gets raised."
    );
  }
  if (ceiling.max > 0 && !String(ceiling.comesOffWhen ?? "").trim()) {
    failures.push(
      `${row.id}: the ceiling allows ${ceiling.max} exception(s) and records no \`comesOffWhen\`. An exemption ` +
        "with no removal condition is permanent by default — say what would make these unnecessary."
    );
  }

  const m = measured.get(row.id);
  if (!m || m.count === null || m.count === undefined) continue; // unmeasurable: reported, never blocking
  if (m.count > ceiling.max) {
    const added = (m.detail ?? []).slice(0, 10);
    failures.push(
      `${row.id}: ${m.count} ${m.unit}, over the ceiling of ${ceiling.max}. ` +
        (added.length ? `Now: ${added.join(", ")}. ` : "") +
        "Either fix the cause the new entry was papering over, or raise the ceiling in the same commit with " +
        "the reason — the point of this gate is that the second one is a line a reviewer sees."
    );
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
say("| Rule | Enforced by | Absorbing now | Ceiling | Breaches recorded | Last |");
say("| --- | --- | ---: | ---: | ---: | --- |");

const sorted = [...rows].sort((a, b) => {
  const score = (r) => breachCount(r) * 100 + (measured.get(r.id)?.count ?? 0);
  return score(b) - score(a);
});
for (const row of sorted) {
  const m = measured.get(row.id);
  const absorbing = m ? (m.count === null ? m.unit : `${m.count} ${m.unit}`) : row.surface === "prose" ? "—" : "0";
  const ceiling = typeof row.ceiling?.max === "number" ? String(row.ceiling.max) : "—";
  say(
    `| \`${row.id}\` | ${row.enforcedBy ?? (row.source ? DISCOVERY[row.source].file : "nothing — prose")} | ` +
      `${absorbing} | ${ceiling} | ${breachCount(row)} | ${lastBreach(row) ?? "—"} |`
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
  "_Absorbing now_ is measured live from the same files the gates read (allowlists, lint-fence exception " +
    "lists, ratchet baselines, the population already over a limit). _Ceiling_ is what that number may not " +
    "exceed without a reviewed diff raising it, and it is the one measured number that DOES fail the build — " +
    "see the ceiling section in scripts/contract-ledger.mjs. _Breaches recorded_ come from `--record`, fed the " +
    "JSON a rubric review writes, and never fail anything; the parity check above does."
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
  printRemedy("contract:ledger:check");
  if (CHECK) process.exit(1);
  console.error("\n(reporting run — `--check` would have failed here.)");
}
