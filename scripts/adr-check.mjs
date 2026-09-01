#!/usr/bin/env node
/** ADR structure gate — keeps `docs/adr/` a record an agent can rely on rather
 *  than a folder of prose that quietly rots.
 *
 *  Runs as part of `npm run check:ci` (so: every CI run, and every local
 *  pre-push check). Exit non-zero fails the gate. What it enforces:
 *
 *    1. File naming — `NNNN-kebab-slug.md`, four-digit, numbers unique.
 *    2. Title      — first heading is `# ADR-NNNN — <title>`, number matching
 *                    the filename (so a copy-pasted ADR cannot keep the source's
 *                    number).
 *    3. Sections   — every ADR carries `## Status`, `## Context`, `## Decision`
 *                    and `## Consequences`, and Status names a known state.
 *    4. Index      — `docs/adr/README.md` links every ADR exactly once, and
 *                    links nothing that is missing. A new ADR that nobody
 *                    indexed is invisible to the agent reading the index, so
 *                    that is a failure, not a warning.
 *    5. Live paths — every repo path cited in inline code inside an ADR still
 *                    exists. This is the check that matters over time: an ADR
 *                    describing a seam that has since been renamed is worse than
 *                    no ADR, and a rename is exactly when nobody thinks to look
 *                    here. Tokens containing `*` are treated as globs and skipped.
 *    6. Hindsight   — a SETTLED record also carries `## Consequences observed`,
 *                    with something in it.
 *    7. Falsifier   — EVERY record carries `## Revisit when`: the observation that
 *                    would tell a reader this decision has stopped holding.
 *
 *  WHY 7 EXISTS, and why it is due immediately rather than on age like 6. These
 *  records say what was decided and (once settled) what it cost. Neither tells a
 *  reader arriving today whether the decision is a LIVE constraint or one nobody
 *  has re-examined in a year, and those two look identical in a well-written ADR —
 *  ADR-0008's no-formatter stance reads the same on the day it was argued and on
 *  the day the argument stopped being true. Without a stated trigger the only
 *  honest answer is "re-derive the whole argument", which nobody does, so the
 *  record quietly becomes authority instead of reasoning.
 *
 *  A trigger is knowable at the moment of the decision — it is the other half of
 *  the argument, the part that says what would change your mind — so unlike
 *  hindsight it is due at once, on every record, including a Proposed one. What it
 *  must be is FALSIFIABLE: an observation somebody could make ("the second driver
 *  stops being written", "a fourth deploy mode appears"), not a date and not "when
 *  it stops working". It is deliberately not a quality bar beyond that; the
 *  placeholder check below is the only shape refused, because a section added to
 *  make a gate green is the failure mode this rule would otherwise create.
 *
 *  WHY 6 EXISTS. Rules 1-5 keep the record present and its citations live; none of
 *  them can tell a reader whether the decision worked. An ADR is written at the
 *  moment of most confidence and least evidence: `## Consequences` is a
 *  prediction. What an agent scoping a change actually needs is whether the
 *  prediction held — the dual-store seam's twin cost, the rung discipline's
 *  never-raise rule, the "eleven dependencies" that are twelve now. Without a
 *  place for it, that knowledge lives in commit bodies and in nobody's head, and
 *  the ADR quietly becomes a claim about the past rather than guidance about the
 *  present.
 *
 *  WHEN A RECORD IS "SETTLED", with no dates to hand. These files carry no
 *  machine-readable decision date, and `git log` is not a dependency this gate
 *  should take (it has to run in a shallow CI checkout and in a worktree). So age
 *  is measured in successors: an Accepted record with SETTLED_AFTER or more
 *  higher-numbered records on top of it has been in force through enough
 *  subsequent decisions that its consequences are observable. That keeps the
 *  newest decisions cheap to write — the section becomes due later, on its own,
 *  without anyone scheduling it.
 *
 *  It is deliberately NOT a quality bar: any honest sentence passes, including
 *  "nothing has tested this yet". A placeholder (`TBD`, `TODO`, `n/a`) does not,
 *  because that is the shape of a section added to make a gate green.
 *
 *  Usage:  node scripts/adr-check.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { printRemedy } from "./gate-remedy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADR_DIR = join(ROOT, "docs", "adr");
const INDEX_NAME = "README.md";

const FILE_RE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const TITLE_RE = /^#\s+ADR-(\d{4})\s+—\s+\S/;
const REQUIRED_SECTIONS = ["## Status", "## Context", "## Decision", "## Consequences"];
const KNOWN_STATUS = ["Accepted", "Proposed", "Superseded", "Deprecated"];
/** Rule 6 — the hindsight section, and when it comes due (see the header). */
const OBSERVED_SECTION = "## Consequences observed";
const SETTLED_AFTER = 3;
/** Rule 7 — the falsifier, due on every record from the day it lands. Shorter
 *  than the hindsight minimum on purpose: one sentence naming an observation is a
 *  complete answer here, while a section that has to reach 120 characters invites
 *  padding around a trigger that was already stated. */
const REVISIT_SECTION = "## Revisit when";
const REVISIT_MIN_CHARS = 60;
/** Enough prose that the section says something. Two of the shortest observed
 *  sections in the tree are ~400 characters; 120 refuses a one-word placeholder
 *  without turning the section into an essay quota. */
const OBSERVED_MIN_CHARS = 120;
const PLACEHOLDER_RE = /^(tbd|todo|t\.b\.d\.?|n\/a|none|none yet|nothing yet|\(none\)|-|—)\.?$/i;
// A path-looking inline-code token: a known top-level directory plus a relative
// path. Root files (`Dockerfile`, `vercel.json`) are deliberately NOT matched —
// requiring a slash keeps env names and identifiers out of the path check.
const PATH_RE = /^(?:src|scripts|docs|test-unit|test-llm|tests|uat|public|\.github|\.claude)\/[A-Za-z0-9._[\]\-/]+$/;

const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(ADR_DIR)) {
  console.error(`✗ ADR gate: ${ADR_DIR} does not exist.`);
  process.exit(1);
}

const entries = readdirSync(ADR_DIR).filter((f) => f.endsWith(".md") && f !== INDEX_NAME);
if (entries.length === 0) fail("docs/adr/ holds no ADRs — an empty record is not a record.");

const numbers = new Map();
/** [{ file, number, status, lines }] — collected here because rule 6 is a
 *  statement about a record's place in the SEQUENCE, which no single file knows. */
const records = [];

for (const file of entries) {
  const m = FILE_RE.exec(file);
  if (!m) {
    fail(`${file}: name must be NNNN-kebab-slug.md`);
    continue;
  }
  const number = m[1];
  if (numbers.has(number)) fail(`${file}: ADR number ${number} is already used by ${numbers.get(number)}`);
  else numbers.set(number, file);

  const text = readFileSync(join(ADR_DIR, file), "utf8");
  const lines = text.split(/\r?\n/);

  const heading = lines.find((l) => l.startsWith("# "));
  if (!heading || !TITLE_RE.test(heading)) {
    fail(`${file}: first heading must read "# ADR-${number} — <title>" (em dash), got ${heading ?? "(none)"}`);
  } else if (TITLE_RE.exec(heading)[1] !== number) {
    fail(`${file}: heading says ADR-${TITLE_RE.exec(heading)[1]} but the filename says ${number}`);
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!lines.some((l) => l.trim() === section)) fail(`${file}: missing required section "${section}"`);
  }

  const statusIdx = lines.findIndex((l) => l.trim() === "## Status");
  let status = "";
  if (statusIdx !== -1) {
    const statusLine = lines.slice(statusIdx + 1).find((l) => l.trim() !== "");
    status = (statusLine ?? "").trim();
    const named = KNOWN_STATUS.some((s) => status.startsWith(s));
    if (!named) {
      fail(`${file}: Status must start with one of ${KNOWN_STATUS.join(" / ")}, got ${JSON.stringify(statusLine ?? "")}`);
    }
  }

  records.push({ file, number: Number(number), status, lines });

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    if (token.includes("*") || !PATH_RE.test(token)) continue;
    if (!existsSync(join(ROOT, token))) fail(`${file}: cites \`${token}\`, which does not exist in the tree`);
  }
}

/** The lines under `heading`, up to the next heading of the same depth or above.
 *  Shared by rules 6 and 7 so "is this section actually said anything in?" is one
 *  answer rather than two that can drift. */
function sectionBody(lines, heading) {
  const idx = lines.findIndex((l) => l.trim() === heading);
  if (idx === -1) return null;
  const body = [];
  for (const line of lines.slice(idx + 1)) {
    if (/^#{1,3}\s/.test(line)) break;
    body.push(line);
  }
  return body;
}

/** Prose length and at least one line that is not a placeholder — the shape a
 *  section added to satisfy a gate has, and the one thing refused. */
function saysSomething(body, minChars) {
  const prose = body.join("\n").trim();
  const meaningful = body.filter((l) => l.trim() !== "" && !PLACEHOLDER_RE.test(l.trim().replace(/^[-*]\s*/, "")));
  return prose.length >= minChars && meaningful.length > 0;
}

// --- rule 7: the falsifier, on every record ----------------------------------
//
// Due immediately, unlike rule 6: what would change your mind is part of the
// argument, not a thing time reveals. See the header.

const withTrigger = [];

for (const rec of records) {
  const body = sectionBody(rec.lines, REVISIT_SECTION);
  if (body === null) {
    fail(
      `${rec.file}: no "${REVISIT_SECTION}" section. A record that states no revisit trigger cannot tell a ` +
        "reader whether it is a live constraint or a decision nobody has re-examined — name the observation " +
        "that would mean this decision has stopped holding (a seam that stops being written, a mode that gains " +
        "a fourth member, a count that crosses a line), not a date and not \"when it stops working\"."
    );
    continue;
  }
  if (!saysSomething(body, REVISIT_MIN_CHARS)) {
    fail(
      `${rec.file}: "${REVISIT_SECTION}" is empty or a placeholder. The trigger has to be something somebody ` +
        "could actually observe; if the honest answer is that this decision has no foreseeable trigger, write " +
        "that sentence and why."
    );
    continue;
  }
  withTrigger.push(rec.file);
}

// --- rule 6: hindsight on the records old enough to have some ----------------
//
// Reported as well as enforced: the count of settled records that carry the
// section is the only number saying whether this repo's decisions are being read
// back at all, and a gate that only speaks when it fails cannot show that.

const settled = [];
const pending = [];

for (const rec of records) {
  const successors = records.filter((r) => r.number > rec.number).length;
  const isSettled = rec.status.startsWith("Accepted") && successors >= SETTLED_AFTER;
  if (!isSettled) {
    pending.push(`${rec.file} (${successors} successor(s), status "${rec.status.split(" ")[0] || "?"}")`);
    continue;
  }
  settled.push(rec.file);

  const idx = rec.lines.findIndex((l) => l.trim() === OBSERVED_SECTION);
  if (idx === -1) {
    fail(
      `${rec.file}: settled record (${successors} later ADRs) with no "${OBSERVED_SECTION}" section. ` +
        "Say what actually happened — which prediction held, which did not, and what a reader should do " +
        "differently now. An honest \"nothing has tested this yet\" is a valid answer; a placeholder is not."
    );
    continue;
  }

  const body = [];
  for (const line of rec.lines.slice(idx + 1)) {
    if (/^#{1,3}\s/.test(line)) break;
    body.push(line);
  }
  const prose = body.join("\n").trim();
  const meaningful = body.filter((l) => l.trim() !== "" && !PLACEHOLDER_RE.test(l.trim().replace(/^[-*]\s*/, "")));
  if (prose.length < OBSERVED_MIN_CHARS || meaningful.length === 0) {
    fail(
      `${rec.file}: "${OBSERVED_SECTION}" is empty or a placeholder (${prose.length} chars). ` +
        "The section exists to record what the decision actually cost or bought — if that is genuinely " +
        "unknown, write that sentence and why."
    );
  }
}

// --- index parity -----------------------------------------------------------
const indexPath = join(ADR_DIR, INDEX_NAME);
if (!existsSync(indexPath)) {
  fail("docs/adr/README.md is missing — the index is how an agent finds these at all.");
} else {
  const index = readFileSync(indexPath, "utf8");
  const linked = [...index.matchAll(/\]\((\d{4}-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  for (const file of entries) {
    const hits = linked.filter((l) => l === file).length;
    if (hits === 0) fail(`${file}: not linked from docs/adr/README.md`);
    if (hits > 1) fail(`${file}: linked ${hits} times from docs/adr/README.md`);
  }
  for (const link of new Set(linked)) {
    if (!entries.includes(link)) fail(`docs/adr/README.md links ${link}, which does not exist`);
  }
}

if (failures.length) {
  console.error(`\n✗ ADR gate: ${failures.length} problem(s)\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error("");
  printRemedy("adr:check");
  process.exit(1);
}

console.log(`✓ ADR gate: ${entries.length} record(s), indexed, sectioned, and every cited path still exists.`);
console.log(
  `  revisit triggers: ${withTrigger.length} of ${records.length} record(s) say what would tell a reader the ` +
    "decision has stopped holding."
);
console.log(
  `  hindsight: ${settled.length} settled record(s) (Accepted, ${SETTLED_AFTER}+ successors) carry ` +
    `"${OBSERVED_SECTION}"; ${pending.length} not due yet.`
);
if (pending.length) console.log(`  not due: ${pending.join(", ")}`);
