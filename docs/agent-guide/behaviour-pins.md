# Behaviour pins for the canonical guidance

Questions that only `AGENTS.md` answers. Run them against the file before and after any edit
that shortens or reorganises it: a trim that keeps every rule but drops one of these answers has
deleted behaviour, and nothing else in this repository would notice. They pin the permissive
branches as well as the prohibitions, because a rewrite loses hedges first.

**How to run.** In a headless session in this checkout, with every tool disallowed, ask all
questions at once and require a numbered answer per line ("not in my instructions" counts as
a miss). An answer passes when it matches the pattern, case-insensitively. It needs a model, so
it is amber: on demand, never in `check:ci`. Read the first request's input and cache tokens
from the same run to price the always-loaded surface.

**Record.** 2026-09-24, before and after the trim that moved the reasoning to
[`conventions.md`](conventions.md): 18/18 in every run (Sonnet x2, Opus x1 per arm);
first request 55,868 -> 39,977 tokens.

| # | Question | Pass pattern |
|---|---|---|
| 1 | May you run git push in this repository? | `(no\|never\|not allowed\|denied)` |
| 2 | How must you stage and commit files here? | `pathspec` |
| 3 | What should you run first at the start of a task, to see work an interrupted run left? | `checkpoint` |
| 4 | Through which function must every LLM text call go? | `generateStructured` |
| 5 | What comment must every such LLM call site carry? | `llm-tool` |
| 6 | Which npm command is the fast inner loop while you edit? | `check:fast` |
| 7 | Which npm command is the full chain CI runs? | `check:ci` |
| 8 | What must a commit or PR carry when you delete a test or add a runtime dependency? | `Ack` |
| 9 | May you set SKLIK_WRITES_ENABLED to check the write path? | `(no\|never\|ask\|stop)` |
| 10 | What is the size limit for a component? | `200` |
| 11 | May you reformat a file you are not otherwise changing? | `(no\|not\|never\|don't\|do not)` |
| 12 | Adding an entry to the SAST allowlist requires what second change in the same diff? | `(ceiling\|contract-ledger)` |
| 13 | Where do a component's UI strings live? | `(const T\|TDict\|useT\|colocated)` |
| 14 | Which document tells you which ADR, runbook or contract governs a task? | `task-index` |
| 15 | Which file states, as patterns, what may run unattended? | `agent-permissions` |
| 16 | A test is flaky. Name the allowed responses (re-running is not one). | `(quarantin\|flaky-tests)` |
| 17 | A new AI operation must record what, besides its golden shape? | `(cost\|budget)` |
| 18 | What trailer names the ADR a commit acted on? | `Decision` |
