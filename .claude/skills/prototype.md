---
name: prototype
description: Iteratively prototype a UI component through directional variants behind an in-app tab switcher, then consolidate and refactor the winner. Use when the user wants to redesign a component they consider a pillar of the app (visual appeal, creativity, UX clarity) and wants to A/B the directions live in the running app — not as a static mockup.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Prototype — Directional Variant Workflow

A disciplined A/B prototyping loop for refining a UI component. Start from a named file, produce radically different directional variants **behind a tab switcher scaffolded into the real component** (so the user flips between them live in the running app), let the user prune/fuse across rounds until one direction wins, then consolidate + refactor.

> Adapted for **systedo-case** (Next.js 16 App Router, Tailwind token system, CSS transitions, i18n via `useT`/`getT`). The workflow structure is codebase-agnostic; the calibration in Phase 3a and the coordination/animation rules are specific to this repo.
>
> Adopted from the canonical `prototype` skill in the sibling `personas` project (`.claude/skills/prototype/skill.md`). The A/B directional-variant loop is carried over verbatim; personas-only specifics (framer-motion SVG animation, the `active-runs.md` ledger, git worktrees, `typo-*`/`ThemedSelect` primitives) are intentionally dropped — systedo has none of them — and replaced with the systedo equivalents (CSS transitions, vibeman path-scoped commits, `@/components/ui` + `inputClass`, LLM-gate awareness).

**The key deliverable is in-app switching.** The variants render inside the component's real call site (e.g. `CreateProjectForm` renders inside `ProjectsHome` at `/app`) so the user reloads the actual screen and toggles directions there. If you find yourself building a standalone HTML artifact, you're doing the *wrong* skill — that's a one-off visual, not this live A/B loop.

---

## When to use

The user says things like "help me master this component", "prototype ideas on top of X", "this is a pillar of the app and I want it to be amazing", "design a different view for X and let me switch between directions", or "iterate until we reach an amazing result". The request carries an **open direction** and a **visual quality bar**, not a specific change list.

## When NOT to use

- Fixed-scope requests ("change the button color to blue") — just edit.
- Bug fixes.
- Non-visual code (business logic, API layer, state store).
- User asks for "three layouts" but wants them all shipped — that's different from prototyping.

---

## Coordination — this repo runs a concurrent vibeman agent

There is no `active-runs.md` ledger here. Instead, a concurrent **vibeman agent** may be committing in parallel, so every prototyping session must:

1. **Path-scoped commits on `master`.** Commit feature work directly to master (per repo convention), but stage per-file with `git add <path>` — **never** `git add -A` / `git add .` / `git add -u`.
2. **Never stage vibeman-owned files.** These belong to the concurrent agent and must never appear in your commits: `context-map.json`, `uat/`, `docs/contexts/`, `CLAUDE.md`, `AGENTS.md`, `.claude/ship-loop/`. Keep the `AGENTS.md` "This is NOT the Next.js you know" block as-is; if it shows as an uncommitted change, leave it.
3. **Verify the staged index before commit.** After `git add` and before `git commit`, run `git diff --cached --name-only`. If anything vibeman-owned or unrelated is staged, `git restore --staged <path>` it.
4. **End commit messages with:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
5. **Worktree is optional.** A prototype creates several sibling variant files + a switcher = multi-file, but they all live under one component's folder and don't collide with vibeman's domain (docs/context/uat). A worktree is only worth it if the user wants to run the dev server against both the clean checkout and the variants side-by-side:
   ```bash
   git worktree add .claude/worktrees/prototype-<component> -b wt-prototype-<component>
   ```
6. **LLM-gate awareness.** If the component touches `/api/ai` or an LLM tool/registry file, committing triggers a ~10-min real-model gate — background that commit. Pure UI prototypes don't trip it.

Atomic commits per round: one commit per round of variants, one per pruning decision, one per consolidation. The per-round history is valuable.

---

## Step 0: Collect the starting file

The skill takes no arguments. When invoked, immediately ask the user **one short question** and wait for their reply before doing anything else:

> "Which component should I prototype on? Paste the path (e.g. `src/components/app/CreateProjectForm.tsx`)."

Do not guess the file from conversation context unless the user has already named a specific path in the same turn. If their reply describes the component by purpose rather than a path, ask a clarifying follow-up — picking the wrong file wastes whole rounds.

Once you have a path, proceed to Phase 1.

---

## Phase 1: Verify the actually-rendered component

**Don't trust the filename.** The file the user named may re-export helpers rather than render. Steps:

1. Read the component the user named.
2. Grep for JSX usage: `<{Name}\b`.
3. Grep for imports: `from ['"].*{Name}['"]`.
4. If the named component has **zero JSX usages**, it's a library file — follow imports from a known entry point (the feature's top-level view) to the one that actually renders.
5. **Confirm with the user in one sentence** before proceeding: "The named file re-exports helpers; the actually-rendered component is X — prototyping on X. OK?"

Note the **call-site chain** so you know where the switcher will surface (e.g. `ProjectsHome → CreateProjectForm`). That's where the user reloads to see the tabs.

---

## Phase 2: Scaffold the tab switcher

Goal: a top-of-component tab strip that lets the user A/B between variants without forking call sites.

1. Rename the current exported function to `{Name}Baseline` (internal, same file).
2. Re-export the original name as a thin wrapper that:
   - Holds a `variant` state (`"baseline" | "v1" | "v2" | …`).
   - Renders a small tab strip at the top (label + 1-line subtitle each).
   - Delegates the body to the active variant, all receiving **identical props** the component already uses — consumers stay untouched.
3. Keep **baseline as the default selected tab** so nothing visually changes on load.
4. In this repo, a client component uses `useState` for the tab; style the strip with the token utilities (`rounded-pill`, `bg-brand-50`, `text-brand-accent`, `border-line`) — a `SegmentedTabs`-style strip is fine. Keep it ~15 lines; the scaffold is throwaway.

Principle: don't over-engineer the scaffold.

---

## Phase 3: Generate 2 **directional** variants

### 3a. Prerequisite — ground your variants in THIS codebase's quality bar

Before writing *any* variant code, spend a few tool calls to calibrate. Variants that mine the codebase feel like siblings of the app; variants invented in isolation feel like prototypes. Do these, in order:

1. **Reuse the shared primitives — don't hand-roll widgets.** This repo's catalog is small and lives in code, not a `CATALOG.md`:
   - Layout/atoms: `@/components/ui` → `Container`, `Eyebrow`, `Pill` (tones: see `PILL_TONE_NAMES` — positive/coral/negative/brand/neutral/navy), `Button` / `buttonClass`.
   - Icons: `@/components/icons` (e.g. `Check`, `ArrowRight`, `Bolt`, `Box`, `Network`, `Refresh`, `Plus`, `Calendar`, `Coins`…). Module/type icons: `ModuleIcon` from `@/components/app/icon-map`.
   - Utility classes from `globals.css`: `.card`, `.pill`, `.rounded-card`, `.rounded-pill`, `.tnum` (tabular numerals).
   - Inputs are raw `<input>` elements styled with the local `inputClass` pattern (see `CreateProjectForm`) — reuse that string, don't invent a new field style.
   - **If the baseline uses a raw element (e.g. a native control), keep the app-consistent styling in the variants; don't downgrade.**

2. **Read the design-system tokens.** There's no `Design.md`; the tokens live in `src/app/globals.css` (the `@theme` / CSS-variable layer) and are consumed as Tailwind classes. Canonical tokens you're expected to use from round 1:
   - Brand ramp: `brand-50…brand-700`, `brand-accent`. Neutral ink: `navy-50…navy-800`, `onyx`, `text-ink`, `text-muted`.
   - Surfaces/lines: `bg-canvas`, `bg-surface`, `border-line`.
   - Status + soft pairs: `positive` / `positive-soft`, `coral` / `coral-soft`, `negative` / `negative-soft`, `brand-50`/`brand-soft`.
   - Radii: `rounded-card`, `rounded-pill`, `rounded-lg`. Elevation: `shadow-card`, `shadow-pop`.
   - **Dark mode is token-driven.** Style through these semantic tokens ONLY — a raw hex, `bg-violet-500/15`, or hardcoding `navy-800` *as a color value* is a tell that dark mode will break. (See the project's dark-mode token architecture: use `onyx-*` / `brand-accent` / `*-soft`, never raw navy/brand hex.)

3. **Find one or two sibling surfaces that exemplify the quality bar** and mine them. Strong references in this repo: the homepage (`src/app/page.tsx` + its sections — the monolith hero + `.bg-facets`), the report→chat split (`src/components/dashboard/ReportChat.tsx`), and a dense data module (`src/components/campaigns/CampaignsClient.tsx` / the inventory `InventorySeasonModule.tsx`). **If the user names an inspiration surface, treat it as authoritative** — mine it even if filenames don't match.

4. **Extract three things from each reference:** (a) *layout shape* (header band + rail + body + footer?); (b) *motion language* (what animates on hover/mount — CSS transitions only here, see Animation austerity); (c) *typography + data patterns* (what's a heading vs `text-muted` caption, where uppercase-tracked labels appear, how `Pill` tones encode state, where `.tnum` is used for figures).

Skip this and round 1 gets thrown away wholesale. Spend the tool calls.

### 3b. Directional variants

The critical word is *directional*. A variant is not "baseline with spacing tweaked"; it's a completely different **mental model** for the same data.

Good variant pairs:
- comparison-matrix (spreadsheet, columns-as-options) + guided-wizard (progressive steps, cards)
- dashboard (dense data grid) + dialogue (conversational / chat metaphor)
- ledger/record (data-dense single column with a "why" column) + studio (atmospheric multi-pane)
- gallery/deck (discrete card choices) + timeline/journey (linear narrative)

Each variant should earn its name by carrying a **single central metaphor** through layout, typography, motion, iconography, and copy voice.

Deliverables per variant:
- File: `{Name}Variant1.tsx`, `{Name}Variant2.tsx` in the same folder as the baseline.
- Short header comment: the metaphor + why it's different from baseline.
- **Reuse shared primitives** (`Pill`, `ModuleIcon`, icons, `inputClass`) — don't reinvent widgets.
- Same `Props` shape as the baseline; degrade gracefully for the edge cases the baseline handles (empty state, cancel affordance, error surface).
- **Prefer data-concrete symbols over abstract markers.** Pull from the live data model (real module names + one-line blurbs from `modulesFor`/`MODULES`, project-type KPIs from `KPI_PRESETS`, accent colors) over stylised shapes. The user evaluates variants partly on "does this encode *real* data I already care about?"
- **Design for extraction.** Name sub-components that could live elsewhere (`TypeColumn`, `ModuleRow`, `PackageMatrix`), not a monolithic `.tsx`. A variant with no extractable pieces may be killed on reusability grounds even if it looks good.
- **Answer "what am I choosing between?" in round 1.** If the user is picking among nouns (project types, modules), the affordance must show *meaningful facts* — module count per type, one-sentence descriptions, the KPI preset — not name-only chips.

- **Answer "what did I gain?" in round 1 for output-producing surfaces.** When the component emits results (generated copy, ranked ideas, drafts, evaluations), each result must carry signal about *why it matters* — a rank/quality label, a delta versus a baseline or average, a plain-language derivation line — not raw numbers alone. Naked output (a bare score bar, an unlabeled list) is a round-1 failure mode, the mirror of name-only choice chips.

**Do not propose 3+ variants in round 1. Two is the right number.** More = analysis paralysis; the user picks direction by round 2 anyway. (If the user has already sketched N directions elsewhere, seed rounds from the strongest two — still two live at a time.)

Batch the writes, then **typecheck once** (`npm run typecheck`) at the end of the round. End the round with an explicit menu of what you built and ask for the next move — don't auto-advance.

---

## Phase 4: Iterate by subtraction and fusion

After round 1 the user will usually: reject one outright, identify a strong element in another to move, or give specific feedback on the leading candidate. Process each:

**Rejection → delete immediately.** Remove file, import, and tab entry. Don't keep it "just in case."

**Fusion → extract + merge + delete source.** Take the strong element out of variant A, merge it into variant B at the specified position, delete A. Shrinking the live tab count each round is a good signal.

**Specific feedback → apply inside the chosen variant.** Do NOT spawn a new variant for a specific fix. Refinement ≠ more options.

**Add a new variant only when explicitly asked** ("create a new variant with X direction").

**Hoist shared pieces mid-prototype, not only at refactor time.** The moment two variants render the same structure (even styled differently), extract the shared sub-component and let both import it — export it from A the same turn you build B on top of it. Waiting doubles every later tweak.

Each round: end with an **explicit menu** of what changed, then ask for the next move.

---

## Phase 5: Declare the winner and consolidate

Transition keywords: "I think we have it", "this is the one", "promote X to default", **"set X as the production baseline"**, "X becomes our go-to". The last two authorise cleanup beyond the prototype variants.

1. Stop iterating.
2. Make the winner the default — either the default tab, or remove the switcher and render only the winner.
3. Delete remaining non-winner variants from disk and imports. If the keyword was "production baseline" or equivalent, cleanup extends to *legacy variants on the same surface* the prototype was competing against (e.g. the old form) — ask once if unsure; don't delete silently.
4. Run `npm run typecheck` to confirm no dangling references.
5. **Do NOT refactor in this phase.** Refactor is a separate, explicit request; premature refactor destroys diff visibility while the user is still evaluating live.

Exit with: one component rendering the winner at its real call site, baseline replaced or restored, typecheck clean, user reloads `/app` (or wherever) and sees the winner live.

---

## Phase 6: Refactor (only on request)

When the user explicitly asks (e.g. "split into smaller files under a subfolder"):

**Check for a sibling folder to mirror first** — modules under `src/components/app/modules/` or `src/lib/**` often show the convention (co-located `.tsx`, a `types.ts`, pure helpers in `src/lib/<domain>/`). Match it file-for-file if it exists.

Otherwise split by responsibility, most-valuable-first: **types** (`src/lib/<domain>/types.ts`) → **pure helpers** (`src/lib/<domain>/*.ts`, framework-free) → **hooks** → **leaf components** → **pane components** → **main orchestrator** (state + layout only) → optional barrel. Note this repo's pattern: pure/domain logic lives under `src/lib/**` (no React), presentational pieces under `src/components/**`.

LOC cap is a guideline (~≤200), not a rule. Update the single consumer import (grep for all sites first). Keep sibling exports stable. Typecheck once at the end.

---

## Guardrails (learned the hard way)

### Watch for external reverts
Linters, the concurrent vibeman agent, or auto-formatters can revert your writes. After every significant Write, watch for `Note: <file> was modified…` markers in the next tool result. If they contradict your change, re-apply it (the user is aware). Reverts can accumulate — if the user says "something reverted my progress," grep to enumerate what's missing, then re-apply the whole round's wiring (import + tab entry + render branch + variant) in one batch.

### Don't touch files outside the prototype scope
If a file shows as `M` in `git status` and you didn't change it, **do not write to it** unless the user said so — it may be vibeman's in-flight work. Apply edits as tight, single-line diffs so unstaged work is preserved.

### Typography is a recurring quality axis
Lean toward `text-sm`/`text-base` for body copy; reserve `text-xs` for uppercase tracking-wide labels only. Avoid pixel-valued arbitrary sizes (`text-[10px]`) in shipped variants — that's a prototype shortcut. **Brighter, not muted, when promoting copy:** `text-muted` → `text-navy-700`, `font-normal` → `font-medium`. "Promote" means "more present," not just "larger."

### Animation austerity (CSS transitions only — this repo has no framer-motion)
Always-on motion reads as noise and gets rejected wholesale. Avoid in any shipped variant:
- CSS `animation: … infinite`, looping keyframes, ambient drift/rotation of large elements.
- `hover:-translate-y-*` / geometry moves on hover on cards — reads as aggressive, not polished (prefer `hover:` on color/shadow/border).

Welcome:
- Entry transitions (opacity/translate fade-in once on mount, via a small mount flag + `transition`).
- Hover-gated `transition-colors` / `transition-[background,border,box-shadow]`.
- Click-gated state transitions (drawer expand, panel slide-in) with `transition`.

Rule of thumb: if the user would still see the animation after leaving the screen idle, cut it. (Also honor `prefers-reduced-motion`.)

### Don't use `useMemo` for side effects
`useMemo(() => { if (x) setStage(y); }, [x])` is wrong — that's `useEffect`. It causes setState during render. Before every variant-write or consolidation, grep your own output for `useMemo\(.*set[A-Z]` and swap to `useEffect`.

### One-shot typecheck, not continuous
Don't run `tsc` after every file write. Batch writes, `npm run typecheck` once per round. Screenshot with the local server (`npx next start -p <port>` after `npm run build`, or `npm run dev`) + Playwright to review variants light + dark before asking for the next move.

### Preserve shared exports during consolidation
If the baseline re-exports helpers used by siblings, keep those re-exports stable when refactoring internals. Unexpected broken imports in unrelated files erode trust.

---

### Keep baseline as reference, not a ceiling

The baseline is preserved for A/B, not because it's the target. Early rounds should feel radically different from it. If the user's feedback keeps pushing variants back toward the baseline, propose a fresh direction instead of compressing toward it — a variant asked to re-acquire everything the baseline already has is a signal the direction, not the details, is wrong.

## Signals the iteration is converging

Green: tab count decreasing (2 → 1); feedback shifting from "wrong direction" to "tweak this specific thing"; user names the winning metaphor positively; user gives layout-level specifics (column widths, stacking, keyboard nav).

Red (slow down, reset direction): wholesale rejection round after round; user restates the baseline as their preference; variants back-porting features the baseline already has.

---

## Exit checklist

- [ ] Winner variant is the default rendered component at its real call site.
- [ ] All non-winner variants deleted from disk, imports, and tab config.
- [ ] `npm run typecheck` clean on touched files (pre-existing unrelated errors ignored).
- [ ] `npm run lint` audited — 0 errors; incremental-migration warnings acceptable.
- [ ] Consumer import paths still resolve (grep old filename → zero references).
- [ ] Dark mode verified (token-driven) via a screenshot, not assumed.
- [ ] If refactored: new subfolder/`src/lib` split exists, consumer import updated, file sizes within budget.

When every box is checked, summarize the journey in 1–2 sentences (what metaphor won, what it does differently) — that's what the user quotes in the commit/PR.
