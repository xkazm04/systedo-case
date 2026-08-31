/** Instruction-shaped text inside a GENERATED region of the guidance surface.
 *
 *  WHY THIS EXISTS. `AGENTS.md` opens with a block `next dev` writes, and
 *  `CLAUDE.md` carries a context map a scan regenerates. Both sit inside the
 *  documents every agent on this repository treats as law, and neither is written
 *  by this team. `.github/agent-surface.lock.json` already catches that a region
 *  CHANGED — that is the rung that exists. It cannot tell a reader WHAT changed
 *  into: a vendor reword that adds "skip the pre-push check when iterating" reads
 *  exactly like a vendor reword that fixes a typo, and both arrive as a lock
 *  mismatch to be accepted.
 *
 *  So the region's content gets classified, not just hashed. A generated region is
 *  DATA — "this project has 117 contexts", "this Next.js differs from your
 *  training data" — and the moment it contains an imperative addressed to the
 *  reader, it is guidance nobody on this team wrote. This module finds those
 *  lines; `scripts/agent-surface.mjs` decides what to do about them, and
 *  `docs/adr/0012-generated-regions-are-data.md` records why.
 *
 *  DELIBERATELY A CLASSIFIER, NOT A PARSER. It over-matches rather than under-
 *  matches: "Read the relevant guide" is flagged even though it is benign, because
 *  the gate's job is to put every instruction-shaped line in front of a human at
 *  the moment they accept it. What is benign is decided by the person accepting,
 *  once, and recorded in the lock file — not by a regex.
 *
 *  Zero-dependency and pure (ADR-0008): strings in, findings out.
 */

/** Imperative verbs that address a reader. First word of a clause only — "Read
 *  the guide" is an instruction, "a read of the guide" is not. */
const IMPERATIVES = new Set([
  "add",
  "apply",
  "avoid",
  "bypass",
  "call",
  "check",
  "commit",
  "consult",
  "copy",
  "delete",
  "disable",
  "disregard",
  "edit",
  "ensure",
  "follow",
  "generate",
  "heed",
  "ignore",
  "install",
  "keep",
  "load",
  "make",
  "move",
  "note",
  "open",
  "override",
  "prefer",
  "push",
  "put",
  "read",
  "regenerate",
  "remove",
  "rename",
  "replace",
  "rescan",
  "rewrite",
  "run",
  "scope",
  "set",
  "skip",
  "treat",
  "update",
  "use",
  "verify",
  "write",
]);

/** Phrases that address the reader wherever they appear in the line. The second
 *  group is the one this gate is really for: text that tells an agent to stand
 *  down from something this repository requires. */
const ADDRESSED = [
  [/\byou (?:must|should|shall|need to|have to|are required to|are expected to)\b/i, "tells the reader what they must do"],
  [/\b(?:do not|don't|never|always)\b/i, "states a rule for the reader"],
  [/\b(?:ignore|disregard|override|bypass|skip)\b[^.;]{0,40}\b(?:instruction|guidance|rule|check|gate|test|policy|previous|prior|above|earlier)/i,
   "tells the reader to stand down from a rule, a check or earlier guidance"],
  [/\b(?:instead of|rather than)\b[^.;]{0,40}\b(?:AGENTS\.md|CLAUDE\.md|guidance|instructions|the rules)\b/i,
   "redirects the reader away from this repository's guidance"],
];

/** Markdown decoration that is not part of the sentence. */
const LEADING = /^[>\s]*(?:[-*+]\s+|#{1,6}\s+|\d+[.)]\s+)?/;
const DECORATION = /^[*_`"'([“‘]+/;
/** Clause boundaries — a sentence's start, and the mid-line punctuation this
 *  repository's generated blocks actually use to hang an instruction off a fact
 *  ("… the project root — read it at task start"). */
const CLAUSES = /(?:\.\s+|;\s+|:\s+|\?\s+|!\s+|\s—\s|\s–\s)/;

/** Findings for one line, or null. `{ line, why }`. */
export function directiveIn(line) {
  const text = String(line ?? "");
  if (!text.trim()) return null;

  for (const [re, why] of ADDRESSED) {
    if (re.test(text)) return { line: text, why };
  }

  const body = text.replace(LEADING, "");
  for (const clause of body.split(CLAUSES)) {
    const first = clause.replace(DECORATION, "").trim().split(/[\s,]+/)[0] ?? "";
    const word = first.toLowerCase().replace(/[^a-z']/g, "");
    if (word && IMPERATIVES.has(word)) {
      return { line: text, why: `opens a clause with the imperative "${word}"` };
    }
  }
  return null;
}

/** Every instruction-shaped line in a generated region, in order. */
export function directiveLines(lines) {
  const out = [];
  for (const line of lines ?? []) {
    const hit = directiveIn(line);
    if (hit) out.push(hit);
  }
  return out;
}
