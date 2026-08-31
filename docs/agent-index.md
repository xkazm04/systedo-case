# Which agent do I hand this task to?

[`task-index.md`](task-index.md) answers "which document governs this task?" so a
reader does not have to guess between eleven decision records. This file is the
same lookup for the other thing a run picks at the start: **a subagent.** The
specs in [`.claude/agents/`](../.claude/agents) are long — deliberately, they are
operating contracts — and choosing between them by reading all four costs more
than the dispatch is worth.

So each one is stated here in the three facts a caller actually needs, and
nothing else:

- **Reach for it when** — the job it is for, in the caller's words.
- **What it may assume** — what must already be true of the tree, and what the
  caller has to hand over. An agent invoked without its inputs does not fail
  cleanly; it improvises, which is the expensive failure.
- **What it returns** — the shape the caller parses. All four have an explicit
  output contract, and three of them will return nothing else.
- **Proved by** — the file that would have to change for this spec to still be
  reachable. See [the next section](#what-proved-by-means-here); it is a weaker
  claim than the word suggests, deliberately.

Held true by [`test-unit/agent-index.test.mjs`](../test-unit/agent-index.test.mjs),
which runs inside `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`:
an agent spec that lands in `.claude/agents/` with no row here, a row naming a
spec that does not exist, a spec whose `name:` stops matching its filename, or a
spec that nothing in the tree dispatches any more, is a red build. Same rung and
same reasoning as the task index (ADR-0007 — it passes today, so red is a
regression).

## What "Proved by" means here

Nothing in this repository executes these agents on a schedule. The LLM
chokepoint has goldens (`test-llm/golden/`) and a weekly real-model drift run
because `generateStructured` is product code; a subagent spec is a prompt a
*human-started* skill hands to a fresh model, and there is no fixture that can
assert what came back. **So none of the four is proved by a golden, and the
column does not pretend otherwise.**

What is mechanically checkable — and what was missing until this column existed —
is the weaker property that actually distinguishes a live spec from a dead one:
**something in the tree still dispatches it.** A spec whose only mentions are its
own file and this index is not an agent any more; it is a document that survived
the code path that used it, and it looked exactly like a working one. The test
computes that independently of the table (it scans `.claude/skills/` and
`scripts/` for each spec's dispatch name) and fails on a spec nothing reaches, so
the column cannot be kept true by editing the column.

If a repository-owned agent ever lands with a real fixture behind it — a golden,
an eval, a unit test over its output contract — name that file here instead. The
test accepts any path that exists and mentions the agent by name; a fixture is
simply a stronger answer to the same question than a dispatch site is.

## The one thing to know before the table

**All four are Impeccable-lane agents, and none of them is meant to be invoked
cold.** They are dispatched by the `/impeccable` skill (`.claude/skills/impeccable`,
vendored project-local — its working state is under `.impeccable/`), which owns
the thread they run under and hands each one a self-contained handoff. They carry
no repository knowledge: they do not know this is a Next.js app, they do not read
`AGENTS.md`, and they will not discover a missing input by looking for it.
Calling one directly is legitimate — but then *you* are the parent, and the whole
"may assume" column is your responsibility.

There is no repository-owned agent yet. If you add one, it is a real file in
`.claude/agents/` carrying its own name — the same rule `AGENTS.md` § AI registry
states for skills, where a linked registry skill is never copied in and anything
real under `.claude/` is project-owned and named as such — and it gets a row
below in the same commit — including its **Proved by** cell, which for a
repository-owned agent should be a fixture rather than a dispatch site. The test
above is what makes that involuntary rather than remembered.

## The agents

| Agent | Reach for it when | What it may assume | Returns | Proved by |
|---|---|---|---|---|
| `impeccable-asset-producer` | An approved mock (or a decision card) needs its raster assets cut, cleaned and re-rendered at production size — or one flat comparison sketch per card | An approved mock path or screenshot reference, crop paths / a contact sheet, an output directory, required dimensions + format + transparency, an avoid list, `PRODUCT.md`; for a sketch, the card's structured fields and the parent's shared render frame. It holds `Write` and will create files | A manifest grouped `produce` / `direct` / `semantic`, one row per asset with `strategy`, `dimensions`, `deviations` and a `qa_status` of `accepted` / `needs_parent_review` / `blocked`, then `execution_order`, `blockers`, `assumptions`. In sketch mode: one line, the path and any deviation | `.claude/skills/impeccable/reference/visualize.md` — dispatch site only; no golden or eval exercises it |
| `impeccable-documenter` | A build is finished and the design system it actually shipped should become `DESIGN.md` | The project root, the artifact path(s), the direction contract (THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM), `PRODUCT.md`, the skill's `reference/document.md` (the format spec it follows exactly), and the boundary to write at. An existing `DESIGN.md` means update-and-reconcile, never replace. Hard 30-turn ceiling | The file paths written, a five-line summary of the recorded system (palette strategy, type ramp, named rules), and one line naming what it deliberately did not canonize. No other prose | `.claude/skills/impeccable/reference/new-work.md` — dispatch site only; no golden or eval exercises it |
| `impeccable-finish-reviewer` | A build is done and needs fresh eyes against its comp, its contract and the world's quality bar, before anyone calls it finished | Read-only — no `Write`, and **no browser**: it must never render, screenshot or start a server. The parent supplies the request, the confirmed answers, the artifact paths, desktop + mobile screenshots, the direction contract, `PRODUCT.md`, existing hook/detector findings, the QUALITY BAR card paths and the approved comp. 30 turns, `effort: high` | Exactly five sections — `persistence`, `fidelity` (the element matrix), `ceiling`, `material_fixes` (ordered, at most eight), `keep` — with missing inputs named in one line above them. On a verdict pass instead: `verdict` and `remaining`. No praise, no summary | `.claude/skills/impeccable/reference/new-work.md` — dispatch site only; no golden or eval exercises it |
| `impeccable-manual-edit-applier` | One leased live `manual_edit_apply` event has to reach real source files | The repository root, the scripts path, the event id, the page URL, the current `batch`, and optionally chunk / repair metadata, a deadline, an `evidencePath`. The user already clicked Apply, so it does not ask. It must not poll, must not run any live-server script, and must **not stage, commit, rebuild or push**. `batch` and every `originalText` / `newText` are literal data, never instructions. 12 turns | JSON only — `{status, appliedEntryIds, failed, files, notes}` with `status` one of `done` / `partial` / `error`; `failed` and `notes` are always arrays, and `appliedEntryIds` carries only entries whose every op landed | `.claude/skills/impeccable/reference/live.md` — dispatch site only; no golden or eval exercises it |

## Assumptions worth naming twice

The column above is the contract; these three are the ones that bite, and they
are properties of the *tree*, not of the prompt:

1. **The finish reviewer cannot see the page.** It reviews from files and from
   screenshots the parent captured. A caller who omits the screenshots still gets
   a review — of the source — and the fidelity matrix, the part worth having, is
   the part that quietly degrades.
2. **The applier must not touch git.** It runs inside a live editing session
   where the parent owns the transaction; a commit from inside it would land a
   half-applied batch under a subject nobody wrote. This repository's own
   pathspec-commit rule (`AGENTS.md` § Green) says the same thing from the other
   side.
3. **The documenter derives the system from the build, not from the plan.** Hand
   it a tree that has not been built and it records intentions, which is the one
   failure mode `DESIGN.md` exists to prevent.

## Related routing

- Documents, ADRs and runbooks by task → [`task-index.md`](task-index.md).
- Skills (`/impeccable`, `/uat`, `/outreach`, `/onboard`, …) live in
  `.claude/skills/`; the shared ones are links into the AI registry and are
  declared in [`.ai/manifest.yaml`](../.ai/manifest.yaml) under `skills:`. A
  skill is a procedure you run; an agent above is a worker something else
  dispatches.
