---
name: perfect
description: Session-after-session product perfection loop for Adamant (systedo-case). The strongest available model (Fable) directs — it walks context-map.json context-by-context, proposes 5 challenged, high-value directions per context (features, design elevations, significant optimizations), gates them with the user until 10 are accepted, then orchestrates one Opus builder subagent per context in isolated worktrees while making every review/merge decision itself. All state lives in the repo's .perfect/ vault so any future session resumes the loop exactly where the last one stopped. Invoke with `/perfect [init|propose|build|status|reflect] [context-name]`.
---

# Perfect — the direction-and-delivery loop (Adamant edition)

> One model is best at *judgment* — seeing what would make a product excellent, challenging its own ideas, reviewing diffs ruthlessly. Cheaper strong models are great at *execution* inside a well-scoped brief. `/perfect` wires the two together in a permanent loop: **Fable directs, Opus builds, the vault remembers.** Each session moves the product measurably closer to the best UX, architecture, and feature quality it can have; no session ever starts from zero.

## Roles — Director and Builders

- **Director (the main session — Fable, or the strongest model available).** Owns everything that is judgment: opportunity-scoring contexts, drafting directions, adversarially challenging them before the user ever sees them, running the acceptance gate, writing builder briefs, answering builders' product questions mid-flight, reviewing every diff, deciding merge/redo/drop, running the repo gates, committing, and writing the vault. The Director **never delegates a decision** to a builder and never rubber-stamps a builder's diff.
- **Builders (Opus subagents, `model: "opus"`, one per context).** Each receives a tight brief (direction specs + acceptance criteria + the context's `filePaths` scope + repo-convention digest) and implements in its **own worktree**. Builders return a structured report; when they hit a genuine product ambiguity they **return the question instead of guessing** — the Director answers via `SendMessage` and the builder continues.
- **Scouts (Explore subagents, cheap).** Produce the per-context current-state brief the Director synthesizes directions from. Never used for judgment.

## The vault — durable loop state

Vault root resolution (first hit wins), then use `$VAULT/`:

```bash
for v in "C:/Users/kazda/Documents/Obsidian/systedo" "<repo>/.perfect"; do
  [ -d "$v" ] && VAULT="$v" && break
done
# Default for this repo: <repo>/.perfect/ — an Obsidian-openable folder, git-ignored
# (it must NOT enter commits: a concurrent vibeman agent shares this master).
```

```
.perfect/
  Perfect.md               # HOME / Map-of-Content — always reflects current truth:
                           #   mission, the scored context QUEUE with the CURSOR,
                           #   the ACCEPTED POOL (n/10), shipped ledger headline, link to last session
  config.md                # per-repo overlay: gates to run, worktree recipe, wave size,
                           #   direction sizing rules, cooldown, ## User taste, + ## Skill improvement log
  contexts/<slug>.md       # one per context-map context (long-lived, updated in place)
  directions/<slug>.md     # one per direction (long-lived; the atom of the whole loop)
  sessions/<YYYY-MM-DD[-n]>.md  # immutable run records, each ends with a `next:` pointer
```

**Context note** (`contexts/<slug>.md`):
```markdown
---
name: <context-map name>        type: perfect/context
group: <group>                  category: ui|api|logic|data|config
opportunity: <0-10>             # value reach × headroom × strategic fit (Director's judgment)
last_proposed: <YYYY-MM-DD|never>   cooldown_until: <date|—>
directions: ["[[<slug>]]", …]
---
## Current state   (scout brief digest + file:line evidence — refreshed each proposal pass)
## Direction history   (proposed / accepted / REJECTED-and-why — rejections are memory too)
## Shipped   (direction → commit SHA → observed effect)
```

**Direction note** (`directions/<slug>.md`):
```markdown
---
slug: <kebab, stable>           type: perfect/direction
context: "[[<context-slug>]]"   lens: feature|ux|optimization|robustness|wildcard
status: proposed | accepted | building | shipped | failed | dropped | rejected
size: S|M|L                     # must fit ONE builder session (≲15 files, no cross-context schema break)
proposed: <date>  accepted: <date|—>  shipped: <date|—>  commit: <sha|—>
---
## What & why   (the user value, one paragraph, no fluff)
## Evidence   (file:line of the gap/opportunity in today's code)
## Acceptance criteria   (3-6 checkable bullets — the builder's contract AND the review checklist)
## Risks / non-goals
## Build record   (builder report digest, review verdict, gate results — filled during build)
```

**Session note**: phases run, contexts covered, accept/reject tallies, build outcomes with SHAs, deltas, and **`next: <the exact resumption instruction for the following session>`**.

Vault hygiene: slugs are stable; **update notes, never duplicate**. Subagents may fail to write files in some harnesses — after any parallel phase the Director MUST `ls` the target dir and **backfill missing notes from the agents' returned content** before trusting "written".

## The loop — a vault-driven state machine

Every invocation starts the same way; the vault decides which phase runs.

### Phase 0 — Recall & register
1. Read `Perfect.md` (+ last session's `next:` pointer). If missing → run **init** (below).
2. Read `context-map.json`; diff against `contexts/*` — new contexts get notes + a queue slot, removed ones get archived (`status: retired` in frontmatter).
3. Scan auto-memory (MEMORY.md) for signals that veto or steer directions (e.g. "SPA rewrite rejected — don't re-suggest", "commit on master", "concurrent vibeman agent"). Honor cooldowns implied by freshly-shipped arcs.
4. Announce the resumption point in one sentence, then go where the state machine points: pool < 10 → **Propose**; pool ≥ 10 (or user said `build`) → **Build**.

### Init (first run only)
1. Scaffold the vault tree + `config.md` (record: gates = `npm run check` (tsc + eslint + next build), `npm run test:unit`, `npm run seed:check` when `scripts/generate-data.mjs` or seed data touched, LLM gate = pre-commit hook (~10 min, real models) auto-runs on commits touching `/api/ai` or LLM tool/registry files — background those commits; wave size = 3; cooldown = 2 rounds).
2. Score every context 0-10 for **opportunity** = user-facing reach × headroom (distance from "perfect", judged from context-map metadata, `docs/`, and memory) × strategic fit (active arcs in memory — e.g. the ship-loop verdict: lean on Sklik unification + diagnostics + price). Write the ranked **queue** into `Perfect.md` with the cursor at the top. Don't deep-read code yet — scoring is refined per-context at proposal time.
3. Write session note; proceed straight into Propose.

### Phase P — Propose (context by context, until the pool holds 10)
Loop while `pool < 10` and the user hasn't said stop:

1. **Cursor** = highest-opportunity context not on cooldown. **Prefetch**: before presenting context *k*, launch the scout for context *k+1* in the background.
2. **Scout** (Explore, "very thorough", read-only): given the context's `filePaths` and `crossRefs` → return a current-state brief: what exists, what's rough, dead ends, UX seams, perf smells, with `file:line` evidence. **A component only "exists" if it RENDERS — trace every surface the brief describes to an actual mount point** (a strip with zero consumers is not a live feature). In this repo also trace the store/resolver seam: is the surface sample-data-only, or wired to live/persisted data?
3. **Draft 5 directions** — one per lens by default: **feature** (new user value), **ux** (design/flow elevation), **optimization** (perf/cost/significant simplification), **robustness** (failure modes, observability, architecture), **wildcard** (the non-obvious idea a great PM would pitch). Each sized to ONE builder session; a bigger vision ships as its phase-1 slice.
   **Weight the slate by `config.md → ## User taste`** — the lens spread is a starting point, not a quota. Default depth is the *engine*, not the chrome: for any context with backend/algorithmic substance, most directions should be architecture-level (data model, algorithms, lifecycle, prompt/recall paths, cost structure); UI surfacing appears at most once-twice unless the user steers otherwise. Scout prompts must match this depth (trace the full pipeline, not just the components).
4. **Challenge before presenting** (the Director argues against itself; a direction that fails any check is replaced, not presented):
   - Does it already exist in code? (scout evidence, not assumption)
   - Was it already proposed/rejected/shipped? (check `contexts/<slug>.md` history + memory)
   - Does it conflict with an active arc or a "removed/rejected, don't re-suggest" memory?
   - Is the value claim concrete — can I name the user moment it improves?
   - Can one Opus session genuinely ship it behind the acceptance criteria?
5. **Present** the 5 in chat — numbered, each: title · lens · size · one-paragraph why · evidence · acceptance criteria. Then gate with **AskUserQuestion (multiSelect)** — the tool caps options at 4 per question, so use TWO questions in one call: Q1 = directions 1–3, Q2 = directions 4–5 (labels = `N · short title`, description = one-line value claim + size). The user can annotate via "Other" (e.g. `edit 2: …`, `stop`); selecting nothing in both = none accepted.
6. Record outcomes in the vault (rejected ones too, with the user's implied reason — rejections steer future proposals). Accepted → `directions/<slug>.md` with `status: accepted`, pool counter++, context gets `cooldown_until`. Update `Perfect.md` after every context, not at session end — a killed session must lose nothing.
7. **A `none` gate that carries a steer** (the user says what they wanted instead) is a re-scout order, not a rejection of the context: promote the steer to `config.md → ## User taste` if it generalizes, re-scout at the steered depth/angle, and re-propose the SAME context once before advancing the cursor. Never re-present any rejected direction.

### Phase B — Build (one Opus builder per context, Fable decides everything)
1. **Wave plan**: group the pool's accepted directions by context → one builder per context, ≤ `config.wave_size` (default 3) concurrent, and **≤ 3 directions per builder brief** (a 4-direction brief exceeds one agent-session budget — split a bigger context into two sequential builders). Present the wave plan in one screen; on user go (or when invoked as `/perfect build`), execute.
2. **Worktree per builder** — prepared by the Director, NOT via Agent-tool isolation (those worktrees lack `node_modules`):
   ```bash
   git worktree add .claude/worktrees/perfect-<ctx> -b worktree-perfect-<ctx>
   cmd //c mklink //J ".claude\\worktrees\\perfect-<ctx>\\node_modules" "..\\..\\..\\node_modules"   # junction, NOT copy
   ```
   Known worktree traps (from UAT sessions): only ONE `next dev` per machine (dev-lock), and Turbopack caches can go stale across worktrees — builders verify with `npx tsc --noEmit` + targeted unit tests, not by racing for the dev server.
3. **Brief** each builder (see template below); launch with `model: "opus"`, `subagent_type: "general-purpose"`, all briefs in one message so they run concurrently.
4. **Mid-flight decisions**: a builder returning `DECISION NEEDED: …` gets an answer from the Director via `SendMessage` — product calls, trade-offs, and scope cuts are Fable's alone. A builder that stops without its final report gets one `SendMessage` nudge.
   **Builder-death recovery (session limits WILL kill builders):** the instant a builder dies, `git add -A && git commit --no-verify` a `wip(…)` snapshot **inside its worktree** (isolated tree — add-all is safe there; never-lose-work beats commit hygiene). Then the Director either finishes the work inline (review the WIP diff, complete gaps, split into per-direction commits along file boundaries — same-file hunks may share a commit if the message says so) or re-briefs a fresh builder after the limit resets with "continue from the WIP commit".
5. **Review — the Director earns its title here.** Per builder branch: `git diff master...worktree-perfect-<ctx>` and review against each direction's acceptance criteria, repo conventions (Design System Primitives in `components/ui.tsx` + `icons.tsx`, dark-mode tokens `onyx-*`/`brand-accent`/`*-soft`, Cache Components rules, cs/en Messages dictionary, store/resolver seams, `generateStructured` chokepoint), and taste. Verdict per direction: **merge** / **redo with notes** (SendMessage, builder fixes in place) / **drop** (`status: failed`, reason recorded). Never merge on "tests pass" alone — read the diff.
   **Docs-vs-code check:** when a diff documents a behavior (contract text, formula, doc comment), grep for the code that implements it before merging — a contract describing behavior the code doesn't have is worse than nothing.
6. **Merge serially**: per direction, `git merge --squash` (or cherry-pick) → ONE atomic commit on master, message `feat(<context>): <direction title>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` footer. Stage per-file, verify `git diff --cached --stat` matches intent (foreign pre-staged files → `git restore --staged` them). Run the config gates on master after each merge; a red gate is fixed inline before the next merge.
   **Concurrent-vibeman-agent discipline (this repo's law):** another agent commits to this master in parallel. Stage ONLY your hunks (patch-level, never whole dirty files, never `git add -A` on the main tree), verify each commit builds in isolation, and keep commits path-scoped to the direction's context. A commit touching `/api/ai` or LLM tool/registry files triggers the ~10 min real-model pre-commit gate — run that commit `run_in_background` and continue reviewing while it gates.
   **Concurrent-session DIRTY files blocking a pick:** never stash, never wait — commit around them: stage `HEAD + your changes` directly into the index (`git hash-object -w` + `git update-index --cacheinfo`, content built by `git merge-file` when needed) and write `their-working-copy + your changes` to disk — their uncommitted work stays theirs.
6b. **Cross-builder integration gate:** parallel builders each verify against the master they forked from — their work can be mutually incompatible (one retires a type-union member another targeted). After ALL of a wave's picks land, run `npx tsc --noEmit` + the union of the wave's test suites on master BEFORE wrap; treat failures as Director-fixed integration commits, not builder redos. When two builders share a direction dependency, fork the dependent builder's worktree AFTER the dependency merges (sequenced builder).
7. **Doc-sync in the same turn**: user-visible changes update the mapped `docs/` page (features/contexts/roadmap) when one exists for the surface.
8. **Cleanup**: per worktree — `cmd //c rmdir` the node_modules **junction FIRST**, then `git worktree remove`, then delete the branch once its commits are on master.

### Phase W — Wrap (every session, even interrupted ones)
1. Update every touched vault note; write the session note with the **`next:` pointer** (e.g. `next: propose — cursor at metrics-analytics-engine, pool 7/10` or `next: build wave 2 — campaign-sync + local-seo remain`).
2. `Perfect.md` headline refreshed: pool count, queue cursor, shipped-total, last-session link.
3. **Reflect on the skill itself**: 2-4 bullets in `config.md → ## Skill improvement log` — what dragged, what the user overrode, what the next round should change. This log is the input for the between-rounds skill revision.

## Direction quality bar (what earns a slot in the 5)

- **Value-first**: names the user moment it improves; "nice refactor" is not a direction unless it unlocks something.
- **Evidence-backed**: cites today's code (`file:line`), not vibes.
- **One-session-shippable**: ≲15 files, no cross-context schema breaks; else slice it.
- **Novel to the vault**: not shipped, not pending, not previously rejected (unless the world changed — say so).
- **Lens-diverse**: default one per lens; substituting a second entry in one lens requires the Director to say why.

## Builder brief template

```
You are an Opus builder for the `<context>` context of Adamant (systedo-case) —
an adtech/marketing-automation SaaS: Next.js 16.3 (App Router, cacheComponents +
partialPrefetching) + React 19 + TypeScript + Tailwind 4; Firestore (firebase-admin)
with a LOCAL_DB sqlite twin behind store dispatchers; next-auth v5.
Work ONLY in this worktree: <abs path>. Your scope is this context's files:
<filePaths from context-map.json>. Touching other contexts requires DECISION NEEDED.

Implement these accepted directions, one atomic commit each, message `feat(<context>): <title>`:
<per direction: What & why · Acceptance criteria · Evidence file:line · Risks/non-goals>

COMMIT EACH DIRECTION THE MOMENT IT IS DONE AND VERIFIED — never batch commits
for the end of the session. Commit with --no-verify INSIDE the worktree (the
Director re-gates on master). An interrupted session must lose at most the
direction in progress, not everything.

FOREGROUND ONLY: run every compile/test as a blocking foreground command and
wait for it — NEVER spawn a background run and "wait for the notification".

SEARCH BEFORE BUILDING: before implementing any new mechanism, grep for an
existing implementation of the same concept and LAYER ON it rather than
forking a parallel system.

Repo law (non-negotiable):
- This is NOT the Next.js you know: read the relevant guide in
  node_modules/next/dist/docs/ before writing route/data code. Cache Components
  is ON — NEVER add `export const dynamic = "force-dynamic"` or runtime exports;
  wrap dynamic reads (cookies/session/fetch) in <Suspense> instead.
- Reuse Design System Primitives (components/ui.tsx: Container/Eyebrow/Pill/Button;
  icons.tsx; components/app/Modal.tsx) — never hand-roll buttons/modals/spinners.
- Dark mode is token-driven: use `onyx-*`, `brand-accent`, `*-soft` semantic tokens —
  never raw navy-800/brand-700/hex pairs.
- UI strings go through the cs/en locale system (typed Messages dictionary +
  {placeholder} interpolation) — cs is the primary locale; add both languages.
- Session/project reads via the cached helpers in @/lib/session (React cache()) —
  never re-read Firestore auth/project state ad hoc.
- Data surfaces follow the store+resolver seam: live/persisted data resolves over
  sample/seed data (resolve.ts/load.ts pattern) — never hardcode demo data into a component.
- All LLM calls go through the generateStructured chokepoint (src/lib/llm) — new AI
  operations register a tool + validator + gate coverage; never call a provider SDK directly.
- New dashboard module roots get the `stagger` class; heavy modal-gated components
  are lazy-loaded via next/dynamic + SectionSkeleton.
- Verify before claiming done: npx tsc --noEmit, targeted `npm run test:unit` where
  suites exist, `npm run lint`; report what you COULD NOT verify honestly.

If a product decision is ambiguous, STOP that direction and return `DECISION NEEDED: <question>`
with your recommendation — never guess. Final report format:
per direction → status (done|blocked|decision-needed), commits, files, verification evidence, open risks.
```

## Modes

- **`/perfect`** — resume the loop wherever the vault says it stopped (the default; covers init on first run).
- **`/perfect propose [context]`** — force a proposal pass (optionally jump the cursor to a named context).
- **`/perfect build`** — build now with the current pool even if < 10.
- **`/perfect status`** — read-only: queue, cursor, pool, in-flight builds, shipped ledger, last session. No agents.
- **`/perfect reflect`** — read `config.md → Skill improvement log` + last sessions and propose concrete edits to THIS skill file.

## Guardrails

- **Never stash, never `git add -A` on the main tree** — per-hunk staging, staged-count check before every commit; the concurrent vibeman agent's work is sacred (worktrees are isolated — add-all is fine there).
- **Cost discipline**: scouts are Explore-tier; Opus is spent only on accepted work; the Director never re-runs a scout whose brief is < 1 round old (it's in the context note).
- **Honest ledger**: a direction only reaches `shipped` with gates green AND the Director having read the diff; anything else is `failed` with a reason. No silent drops — every accepted direction's fate is recorded.
- **Interruptibility is a feature**: write the vault incrementally (after every context in P, after every merge in B) so a killed session resumes losslessly.
- **The user is the product owner**: the gate is theirs; the Director challenges but never overrides a rejection, and repeated rejections of a lens/context recalibrate the queue scores.
