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
 *  A5 IS THE ONE THAT BITES, and it bites late on purpose: a hook binds only the
 *  checkout that installed it, and the commits that keep failing this rule are
 *  written by automation lanes in throwaway worktrees that never ran `npm
 *  install`. So the rule has to hold over a RANGE — every commit between
 *  `origin/master` and HEAD — at the moment those commits try to reach master.
 *  That is `npm run check:ci` (`.husky/pre-push`, before the push that IS the
 *  release) and `.github/workflows/agent-review.yml` on every push and pull
 *  request. Which means the rules below are the whole enforcement: a family they
 *  do not name is a family that lands.
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
 *
 *  WHAT THE FIRST DRAFT OF THESE RULES MISSED. The families above are refused, and
 *  the log kept filling with the same shape anyway, because an automation lane
 *  writes a commit subject by taking the first line of the run's REPORT. That line
 *  is not always "Done." — it is also:
 *
 *      fix: Read AGENTS.md (canonical), CLAUDE.md, docs/adr/0007
 *      fix: Done. Three of four items closed; two skipped with reasons
 *
 *  The first names only documents the run consulted (reading is not a change, and
 *  a subject that lists three of them names no artefact the commit touched); the
 *  second scores the run and then joins a second clause with a semicolon, which is
 *  the same "second sentence" the shape rules already refuse with a full stop. Both
 *  are in this repository's recent history. `consulted-documents`, `item-tally` and
 *  the semicolon clause below are drawn around exactly those, deliberately narrow:
 *  a subject that merely CONTAINS one of those words ("read the token from the
 *  path") is a change and stays legal.
 *
 *  AND WHAT THE SECOND DRAFT STILL MISSED — the family that was audited out of this
 *  log afterwards, and which every rule above lets through:
 *
 *      fix: Top priority
 *
 *  It narrates nothing. It is a well-formed conventional commit, one clause, third
 *  person, no "Done", no tally, no list of documents — and it is made entirely of
 *  the run's own WORK QUEUE. It says where the change sat in somebody's ordering,
 *  which is a fact about the session that produced it and not a fact about the
 *  tree. `queue-position` below is drawn around that: a rank word ("top", "next",
 *  "misc", "various", "final") followed by a filler noun ("priority", "items",
 *  "fixes", "cleanup"), ANCHORED to the whole description so that it fires on
 *  "Top priority" and never on "raise the priority of the retry queue". The
 *  existing length rules do not reach it — "Top priority" is twelve characters and
 *  two words, and both minimums are met.
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

/** The two halves of `queue-position` (below), spelled out here because the rule
 *  is only safe while it is ANCHORED to the whole description, and that is easier
 *  to see when the vocabulary is not buried inside the regex.
 *
 *  RANK is where a piece of work sat in a queue; FILLER is a noun that stands in
 *  for the artefact instead of naming one. Neither is a problem on its own — both
 *  lists are full of words that belong in real subjects ("fix the priority queue",
 *  "cleanup after a failed upload"). A description made of NOTHING BUT them is the
 *  one that tells the next reader only that a session got round to something. */
const RANK =
  "top|topmost|highest|high|medium|mid|low|lowest|first|second|third|next|final|last|remaining|leftover|" +
  "other|another|further|additional|extra|more|some|few|misc|miscellaneous|various|several|assorted|" +
  "general|overall|minor|small|quick|initial|main|primary|secondary|outstanding|pending";
const FILLER =
  "priority|priorities|item|items|thing|things|stuff|step|steps|task|tasks|point|points|fix|fixes|" +
  "update|updates|change|changes|improvement|improvements|tweak|tweaks|cleanup|clean-up|polish|" +
  "touches|touch-ups|work|bits|edit|edits|adjustment|adjustments|refinement|refinements|" +
  "follow-up|follow-ups|followups|round|rounds|pass|passes|batch|batches";
/** `^…$` is the whole point: the description must be rank words and a filler noun
 *  and NOTHING else. "Top priority" matches; "raise the priority of the retry
 *  queue" and "chore(deps): minor version bumps for six packages" do not. */
const QUEUE_POSITION_RE = new RegExp(`^(?:the\\s+)?(?:(?:${RANK})\\s+)+(?:${FILLER})$`, "i");

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
    // "Read AGENTS.md (canonical), CLAUDE.md, docs/adr/0007" — an observation verb
    // followed by a LIST. The comma is what makes this narrow enough to be a rule:
    // "read the feed token from the path" describes a change and has none.
    id: "consulted-documents",
    re: /^(re-?read|read|reviewed?|reviewing|reading|opened|consulted|inspected|skimmed|explored)\b[^,]*,/i,
    say:
      "the subject lists what the run READ, not what the change does. Consulting a document changes nothing — " +
      "name the artefact the commit touched.",
  },
  {
    // "Three of four items closed; two skipped with reasons" — the run's own
    // scoreboard. Anchored to a tally IMMEDIATELY followed by the thing being
    // tallied, so "cut 3 of 4 duplicate queries" is untouched.
    id: "item-tally",
    re: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+of\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^,;]{0,20}\b(items?|tasks?|findings?|issues?|recommendations?|checks?|todos?)\b/i,
    say:
      "the subject scores the run rather than naming the change. How many items a run closed is the run's " +
      "bookkeeping; the log needs what the tree now does differently.",
  },
  {
    // "Top priority" — a real subject from this log, and the one the narration
    // rules above were all too specific to catch. Nothing about it describes a
    // session in words; it describes one in SUBSTANCE, by naming the change's
    // place in a queue rather than the change.
    id: "queue-position",
    re: QUEUE_POSITION_RE,
    say:
      "the subject names where the work sat in a queue, not what the change does. Which item a run reached " +
      "first is the run's ordering; six months from now the log needs the artefact and what happened to it.",
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
  // The same fault with different punctuation. A report line reaches for a
  // semicolon exactly where a subject would have stopped ("…items closed; two
  // skipped with reasons"), and the full-stop rule above never sees it.
  if (/;\s+\S/.test(text)) {
    problems.push(
      "the description joins a second clause with a semicolon. A subject is one clause — the half after the " +
        "semicolon belongs in the body, below a blank line."
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
  "",
  "IF YOU ARE AN AUTOMATION LANE composing this subject from the first line of a run's report,",
  "that line is the commit subject — write it as one. Not \"Done. Here's what I did\", not",
  "\"Three of four items closed\": name the artefact and what happened to it, in one clause, the",
  "way `chore(registry-map): regenerate with priorNotApplicable ranking hint` does. The report's",
  "prose belongs in the body, under a blank line, where nothing here objects to it.",
  "",
  "AND IF THE RUN WAS STOPPED MID-TASK, the record already has a place to go, and it is not",
  "a `fix:` commit and not a `wip:` prefix — it is the checkpoint the next run reads first:",
  "",
  "    npm run checkpoint -- --next \"the very next step\"     # .agent/checkpoints/<session>.json",
  "",
  "If the stopped run also changed the tree, commit the change under a subject that names it.",
  "The two are separate facts and only one of them belongs in the log.",
];
