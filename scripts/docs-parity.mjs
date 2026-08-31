#!/usr/bin/env node
/** Bilingual documentation parity — the app's i18n discipline, applied to the docs
 *  (zero-dependency).
 *
 *  The product's locale columns cannot drift: `TDict`/`Messages` make a key added
 *  on one side and not the other a `typecheck` failure, and `npm run i18n:gate` /
 *  `npm run i18n:audit` cover what types cannot see. The DOCUMENTATION had none of
 *  that, and it showed. For months README.md said a self-hosted production install
 *  boots and runs without Firestore or Google OAuth, while docs/README.cs.md still
 *  said self-hosting `zatím nefunguje` — the reader who happened to open the Czech
 *  edition planned around a constraint that had already been lifted. That is the
 *  specific harm here: a stale translation is not a gap, it is a confident wrong
 *  answer, and an agent has no way to tell which side is stale.
 *
 *  WHAT IT CHECKS. Not translation — the two files are deliberately different
 *  documents (an open-source entry point and a Czech product overview). It checks
 *  SHARED CLAIMS: each rule in docs/parity.json names one fact twice, once per
 *  language, and the check fails when either side stops stating it, or when the
 *  two state different values (version numbers, a licence id, a vendor list).
 *
 *  Matching is done after normalisation — CRLF dropped, blockquote markers
 *  stripped, whitespace collapsed — so a claim may wrap across lines or sit inside
 *  a `>` callout, as most of these do, without the pattern caring.
 *
 *  Rung: BLOCKING, inside `npm run check:ci` (ADR-0007 — it passes today, so red
 *  is a regression this change introduced). When it goes red the fix is never to
 *  delete the rule: the rule firing IS the drift being caught. Either the Czech
 *  fell behind (update it), or the English was reworded (re-read the Czech, make
 *  it say the same thing, then update the pattern).
 *
 *  Usage:
 *    node scripts/docs-parity.mjs
 *    node scripts/docs-parity.mjs --summary FILE
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = join(ROOT, "docs", "parity.json");

const argv = process.argv.slice(2);
const summaryIdx = argv.indexOf("--summary");
const SUMMARY_FILE = summaryIdx !== -1 ? argv[summaryIdx + 1] : null;

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};
const failures = [];

/** Markdown, flattened to one line of prose: no CR, no blockquote markers, no
 *  line wraps, one space between words. A claim that is wrapped in the file, or
 *  sits inside a `>` callout, still reads as the sentence its author wrote. */
function normalise(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:>\s?)+/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function compile(pattern, where) {
  try {
    return new RegExp(pattern);
  } catch (err) {
    failures.push(`${where}: \`${pattern}\` is not a valid regular expression — ${err.message}`);
    return null;
  }
}

// --- read the declaration ----------------------------------------------------

if (!existsSync(SPEC_PATH)) {
  console.error("✗ docs parity: docs/parity.json does not exist — nothing declares which documents are a pair.");
  process.exit(1);
}
let spec;
try {
  spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
} catch (err) {
  console.error(`✗ docs parity: docs/parity.json is not valid JSON — ${err.message}`);
  process.exit(1);
}
const pairs = Array.isArray(spec.pairs) ? spec.pairs : [];
if (!pairs.length) {
  console.error("✗ docs parity: docs/parity.json declares no pairs.");
  process.exit(1);
}

// --- verify ------------------------------------------------------------------

say(`Docs parity — ${pairs.length} bilingual pair(s) declared in docs/parity.json`);
say("");

for (const pair of pairs) {
  const label = `${pair.source} → ${pair.derived}`;
  const sourcePath = join(ROOT, pair.source);
  const derivedPath = join(ROOT, pair.derived);

  if (!existsSync(sourcePath) || !existsSync(derivedPath)) {
    failures.push(
      `${label}: ${!existsSync(sourcePath) ? pair.source : pair.derived} does not exist. A declared pair with a ` +
        "missing half is a pointer into nothing — fix the path, or drop the pair and say why."
    );
    continue;
  }

  const rawDerived = readFileSync(derivedPath, "utf8");
  const source = normalise(readFileSync(sourcePath, "utf8"));
  const derived = normalise(rawDerived);

  say(`  ${label}`);

  // The derived edition has to say, in its own header, that it is derived — the
  // way CLAUDE.md says it is a shim for AGENTS.md. Otherwise a reader who opens
  // only this file has no way to know which side wins when the two disagree.
  if (pair.marker && !rawDerived.includes(pair.marker)) {
    failures.push(
      `${label}: ${pair.derived} no longer carries its \`${pair.marker}\` marker. The derived edition must ` +
        "say which document it follows, or a reader landing on it cannot tell it is the side that loses."
    );
  }

  for (const rule of pair.rules ?? []) {
    const srcRe = compile(rule.source, `${label} · ${rule.id} (source)`);
    const drvRe = compile(rule.derived, `${label} · ${rule.id} (derived)`);
    if (!srcRe || !drvRe) continue;

    const sm = srcRe.exec(source);
    const dm = drvRe.exec(derived);

    if (!sm) {
      failures.push(
        `${label} · ${rule.id}: ${pair.source} no longer states this. ${rule.why ?? ""} ` +
          "Either the fact changed — in which case re-read " +
          `${pair.derived}, make it say the same thing, and update this rule's pattern in docs/parity.json — ` +
          "or the English was reworded and the Czech was not looked at."
      );
      continue;
    }
    if (!dm) {
      failures.push(
        `${label} · ${rule.id}: ${pair.derived} no longer states what ${pair.source} states. ${rule.why ?? ""} ` +
          `${pair.source} says: "${sm[0]}". The Czech edition is the derived side — bring it into step.`
      );
      continue;
    }
    if (sm[1] !== undefined && dm[1] !== undefined && sm[1] !== dm[1]) {
      failures.push(
        `${label} · ${rule.id}: the two editions state DIFFERENT values — ${pair.source} says "${sm[1]}", ` +
          `${pair.derived} says "${dm[1]}". ${rule.why ?? ""}`
      );
      continue;
    }

    const value = sm[1] !== undefined ? ` (${sm[1]})` : "";
    say(`    ✓ ${rule.id}${value}`);
  }
}

// --- report ------------------------------------------------------------------

if (failures.length) {
  say("");
  say(`✗ ${failures.length} parity problem(s):`);
  for (const f of failures) say(`  • ${f}`);
  say("");
  say("  Do not delete a rule to make this green. The rule going red IS the drift being caught;");
  say("  a bilingual doc whose stale half nobody notices is how an agent gets a confident wrong");
  say("  answer about what this repository can do.");
  printRemedy("docs:parity", say);
} else {
  say("");
  say("✓ docs parity: every declared pair states its shared facts on both sides, with the same values.");
}

if (SUMMARY_FILE) {
  try {
    appendFileSync(SUMMARY_FILE, `### Docs parity\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

process.exit(failures.length ? 1 : 0);
