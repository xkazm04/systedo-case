/** The commit-subject contract — the rules, with no I/O (zero-dependency).
 *
 *  Imported by two callers so there is exactly one definition of what a subject
 *  owes a reader:
 *
 *    scripts/agent-review.mjs   — rule A5 of .github/agent-review-rubric.md. It
 *                                 BLOCKS, on every push and pull request and
 *                                 inside `npm run check:ci`, which .husky/pre-push
 *                                 runs before any push that updates master.
 *    scripts/commit-check.mjs   — the same rules on demand, over a range or a
 *                                 single message, for auditing and for a local
 *                                 commit-msg hook where one is installed.
 *
 *  WHY CONTENT AND NOT SHAPE. The conventional-commit shape is already followed on
 *  100% of the commits here, so a shape-only rule would never fire. What has
 *  actually gone wrong is subjects that describe the SESSION rather than the
 *  change:
 *
 *      fix: Done. Here's what I found and changed
 *      fix: Agent session exceeded 20 min and was stopped
 *
 *  Both are well-formed conventional commits. Neither lets anyone decide, six
 *  months later, whether that commit is the one that broke something — and the
 *  second is not a change at all, it is a loop event that got committed because
 *  the loop commits on exit. With ~97% of commits agent-written and the log as the
 *  main artifact a future agent bisects, that is a real cost, paid later.
 */

/** Conventional-commit types accepted here. */
export const TYPES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "build",
  "ci",
  "style",
  "revert",
];

const HEADER_RE = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9._/-]*\\))?(!)?: (.+)$`);
const MAX_DESCRIPTION = 72;
const MAX_HEADER = 100;
const MIN_DESCRIPTION = 10;

/** Subjects git writes itself, or that are addressed to a later rebase rather
 *  than to a reader. Rewriting them is not this rule's business. */
const EXEMPT = [/^Merge\b/, /^Revert "/, /^(fixup|squash|amend)!/];

/** Each rule names the fix rather than the rule, because what an author reads is
 *  the message, at the moment the commit is refused. */
export const NARRATION_RULES = [
  {
    id: "session-report",
    re: /\bhere(?:'s| is)? what\b/i,
    say: "the subject reports back to a reader (\"here's what …\") instead of naming the change.",
  },
  {
    id: "first-person",
    re: /(^|\W)(i|i'm|i've|my|me)(\W|$)/i,
    say: "the subject is written in the first person. The log records what the change does, not who did it.",
  },
  {
    id: "opens-with-done",
    re: /^done\b/i,
    say: '"Done" is the session\'s status, not the change\'s. Name what the commit changes.',
  },
  {
    id: "loop-mechanics",
    re: /\b(agent|claude|assistant|model)\s+session\b/i,
    say:
      "the subject describes an agent session rather than a change. A session is not a commit — if the run " +
      "produced no change, do not commit; if it did, describe the change.",
  },
  {
    id: "session-outcome",
    re: /\b(session|run|loop)\s+(was\s+)?(exceeded|stopped|timed\s*out|timeout|expired|ended|killed)\b/i,
    say:
      "the subject records how the run ended. Loop mechanics belong in the run's own log, not in the history " +
      "a future bisect reads.",
  },
  {
    id: "elapsed-time",
    re: /\bexceeded\s+\d+\s*(m|min|mins|minute|minutes|s|sec|secs|hour|hours)\b/i,
    say: "the subject reports elapsed time, which says nothing about what the tree now does differently.",
  },
  {
    id: "placeholder",
    re: /\b(wip|tbd|asdf|temp commit|test commit)\b/i,
    say: "the subject is a placeholder. Placeholders become permanent the moment they are pushed.",
  },
  {
    id: "addressed-to-a-person",
    re: /\b(as requested|let me know|per your|hope this)\b/i,
    say: "the subject is addressed to a person, in a conversation the log does not contain.",
  },
  {
    id: "no-change",
    re: /^no (changes?|op|diff)\b/i,
    say: "a commit that says it changes nothing should not exist. Drop it.",
  },
];

/** Git's message file carries comment lines and, with `commit.verbose`, the whole
 *  diff. The subject is the first line that is neither. */
export function subjectOf(message) {
  for (const raw of String(message ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    return line;
  }
  return "";
}

/** [] when the subject is fine; otherwise one plain-English problem per entry. */
export function checkSubject(subject) {
  const s = String(subject ?? "").trim();
  if (!s) return ["the commit message is empty."];
  if (EXEMPT.some((re) => re.test(s))) return [];

  const m = HEADER_RE.exec(s);
  if (!m) {
    return [
      "not a conventional-commit subject. Expected `<type>(<scope>): <what changed>`, with type one of " +
        `${TYPES.join(", ")}.`,
    ];
  }

  const text = m[4].trim();
  const problems = [];

  if (s.length > MAX_HEADER) {
    problems.push(`the subject line is ${s.length} characters; keep the whole line under ${MAX_HEADER}.`);
  }
  if (text.length > MAX_DESCRIPTION) {
    problems.push(
      `the description is ${text.length} characters; keep it under ${MAX_DESCRIPTION} so it survives ` +
        "`git log --oneline`. The rest goes in the body, below a blank line."
    );
  }
  if (text.length < MIN_DESCRIPTION || text.split(/\s+/).length < 2) {
    problems.push(
      `"${text}" is too short to identify the change. Name the artefact and what happened to it — ` +
        '"fix(campaigns): stop triage double-counting Sklik spend", not "fix: bug".'
    );
  }
  if (/\.$/.test(text)) {
    problems.push("the description ends with a full stop. A subject is a label, not a sentence.");
  }
  if (/\.\s+\S/.test(text)) {
    problems.push(
      "the description runs to a second sentence. A subject is one clause; put the rest in the body."
    );
  }

  for (const rule of NARRATION_RULES) {
    if (rule.re.test(text)) problems.push(`${rule.say} [${rule.id}]`);
  }

  return problems;
}

/** What to write instead — printed under a failure, in both callers. */
export const GUIDANCE = [
  "A subject answers one question: six months from now, is THIS the commit that changed the thing",
  "I am looking at? So it names the artefact and what happened to it.",
  "",
  "    feat(kampane): add portfolio budget-shift recommendation",
  "    fix(llm): keep the demo fallback deterministic without a provider",
  "    chore(ci): move the actions supply-chain policy into check:ci",
  "",
  "What the run did, how long it took and how it ended are the run's business. A session that",
  "produced no change does not owe the log a commit.",
];
