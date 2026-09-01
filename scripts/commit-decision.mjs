#!/usr/bin/env node
/** WHICH DECISION did this commit act on? (zero-dependency, ADR-0008)
 *
 *  THE GAP THIS CLOSES. This log is already filterable two ways. Conventional
 *  prefixes say what SHAPE a change is (`feat`, `fix`, `chore`), and
 *  scripts/commit-attribution.mjs says what ORIGIN it had (`Co-Authored-By`,
 *  `Agent-Harness`, and which lane). Twelve ADRs and a twelve-rule rubric govern the
 *  seams, and nothing recorded the third fact, which is the one a reader three weeks
 *  later actually wants: WHICH of those a commit was acting on.
 *
 *  That question gets asked in two directions and neither had an answer:
 *
 *    forward   "ADR-0001 says one interface over two backends. Which changes have
 *              actually been made under it, and did any of them argue with it?"
 *    backward  "rubric A6 fires constantly. Which commits fixed a finding it raised,
 *              and which absorbed one?" — the decision docs/agent-lessons.md is for,
 *              taken today by reading prose bodies and guessing.
 *
 *  `git log -- <paths>` plus .github/adr-ownership.json answers a NEIGHBOURING
 *  question — which commits touched code an ADR governs — and it is not the same
 *  question. A change to src/lib/db.ts is governed by ADR-0001 whether or not the
 *  author had ever read it; a change that was made BECAUSE of it, or in tension with
 *  it, is a fact only the author holds. So it is written down at the moment it is
 *  still known, in a trailer git can count:
 *
 *      Decision: ADR-0001
 *      Decision: rubric-A6, ADR-0007
 *
 *  WHAT BLOCKS AND WHAT DOES NOT (docs/adr/0007-gate-rung-discipline.md).
 *
 *    BLOCKING   a `Decision:` that names something which does not exist. A reference
 *               to `ADR-0013` on a repository with twelve records, or to `rubric-A9`,
 *               is worse than no trailer: it is a citation, and a citation is read
 *               with confidence. `.husky/commit-msg` refuses it while the message is
 *               still free to change, and `npm run commit:check -- --range` fails on
 *               one already in history. It passes today by construction — nothing in
 *               this log carries the trailer yet — which is the rung a new check
 *               earns.
 *    REPORTING  coverage. Most commits act on no recorded decision and should carry
 *               nothing; a rule that demanded one would produce a log where every
 *               commit cites ADR-0007 and the field means nothing. What is printed is
 *               how many name one, and which — the same rung, and for the same
 *               reason, as the authorship trailer beside it.
 *
 *  WHAT IT CANNOT DO. Nothing derives this. A hook cannot read intent out of an
 *  environment variable the way it reads the harness, and auto-filling it from
 *  .github/adr-ownership.json would put a citation in every commit that touched a
 *  governed path — which is the neighbouring question again, answered as if it were
 *  this one. A trailer nobody wrote is not evidence.
 *
 *  Usage (through scripts/commit-check.mjs, which is what the hook and npm run):
 *    npm run commit:check -- --range origin/master..HEAD
 *    npm run commit:check -- --range origin/master..HEAD --decision ADR-0001
 *    npm run commit:check -- --decisions            # what may be cited here
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DECISION_TRAILER = "Decision";
export const ADR_DIR = "docs/adr";
export const RUBRIC = ".github/agent-review-rubric.md";

const DECISION_RE = /^[ \t]*Decision[ \t]*:[ \t]*(\S.*)$/gim;

/** Every value a message's `Decision:` trailers name, in order, de-duplicated.
 *  Comma-separated on one line and repeated lines both work — a change can serve
 *  two decisions, and forcing it into one would make the field a lie. */
export function decisionsOf(message) {
  const out = [];
  const text = String(message ?? "");
  DECISION_RE.lastIndex = 0;
  let m;
  while ((m = DECISION_RE.exec(text)) !== null) {
    for (const part of m[1].split(",")) {
      const value = part.trim();
      if (value && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

/**
 * What may legitimately be cited, read out of the tree rather than listed.
 *
 * ADRs come from their filenames (`docs/adr/0007-….md` → `ADR-0007`) and rubric
 * rules from the rubric's own headings, so a record that lands, or a rule that is
 * renumbered, changes what is citable without anybody editing this file.
 */
export function knownDecisions({ root = ROOT } = {}) {
  const adrs = new Set();
  const adrDir = join(root, ADR_DIR);
  if (existsSync(adrDir)) {
    for (const file of readdirSync(adrDir)) {
      const m = /^(\d{4})-.+\.md$/.exec(file);
      if (m) adrs.add(`ADR-${m[1]}`);
    }
  }

  const rules = new Set();
  const rubric = join(root, RUBRIC);
  if (existsSync(rubric)) {
    for (const line of readFileSync(rubric, "utf8").split(/\r?\n/)) {
      const m = /^#{2,4}\s+([AB]\d+)\s/.exec(line);
      if (m) rules.add(`rubric-${m[1]}`);
    }
  }
  return { adrs, rules };
}

/** The citation forms, normalised: `adr-7`, `ADR-0007` and `adr 0007` are the same
 *  reference and a reader writing any of them meant the same record. Anything else
 *  is returned unchanged, so it fails loudly rather than being coerced into a
 *  citation nobody made. */
export function normalizeDecision(value) {
  const raw = String(value ?? "").trim();
  const adr = /^adr[\s_-]*0*(\d{1,4})$/i.exec(raw);
  if (adr) return `ADR-${adr[1].padStart(4, "0")}`;
  const rule = /^(?:rubric[\s_-]*)([AB])\s*(\d+)$/i.exec(raw);
  if (rule) return `rubric-${rule[1].toUpperCase()}${rule[2]}`;
  return raw;
}

/**
 * What is wrong with the decisions this message cites — `[]` when it cites none,
 * because citing nothing is the common and correct case.
 */
export function decisionProblems(values, known = knownDecisions()) {
  const problems = [];
  for (const value of values ?? []) {
    const id = normalizeDecision(value);
    if (known.adrs.has(id) || known.rules.has(id)) continue;
    if (/^ADR-\d{4}$/.test(id)) {
      problems.push(
        `\`Decision: ${value}\` names ${id}, and ${ADR_DIR}/ has no such record. A citation that does not resolve ` +
          `is worse than none — it is read with confidence. Known: ${[...known.adrs].sort().join(", ")}`
      );
      continue;
    }
    if (/^rubric-[AB]\d+$/.test(id)) {
      problems.push(
        `\`Decision: ${value}\` names ${id}, and ${RUBRIC} has no such rule. Known: ` +
          `${[...known.rules].sort().join(", ")}`
      );
      continue;
    }
    problems.push(
      `\`Decision: ${value}\` is not a reference this repository can resolve. Cite a decision record ` +
        "(`ADR-0007`) or a rubric rule (`rubric-A6`); everything else belongs in the body, where nothing objects " +
        "to it."
    );
  }
  return problems;
}

/** Does this message cite `id` (in any of the forms above)? Used by the reverse
 *  query — "which commits acted on ADR-0001?" — which is the whole point of the
 *  trailer and the thing the log could not answer at all. */
export function citesDecision(message, id) {
  const target = normalizeDecision(id);
  return decisionsOf(message).some((v) => normalizeDecision(v) === target);
}
