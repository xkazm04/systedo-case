# Feature + Moonshot Scan — Design System, Icons & Charts

> Context: ctx_1781547850601_du70kg4
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Copy-paste usage docs + do/don't panels on every showcase section

- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: src/app/design-system/page.tsx:117 (`Section`), :39 (`SPARKLINES`)
- **Scenario**: The `/design-system` page is the headline portfolio artifact, but today it only *shows* primitives — it doesn't tell a reviewer how to use them. Each `Section` renders an `eyebrow/title/intro` and a live demo; there is no JSX snippet, no import line, and no guidance on when a `Pill` tone or `autoColor` Sparkline is correct vs. wrong. A hiring manager or adopting dev has to open the source to learn the API.
- **Opportunity**: Add a `CodeBlock` + `UsageNote` pair to the `Section` contract. For each demo, surface the exact JSX that produced it (e.g. `<Pill tone="positive">…</Pill>`, `<Sparkline values={…} autoColor goodDirection="down" />`) with a one-click copy button reusing the existing `Copy` and `Check` icons from `icons.tsx`. Below each demo add a compact two-column "Použít / Nepoužít" (do/don't) card: e.g. *use* `tone="negative"` for a regression metric, *don't* use raw red for decorative chips; *use* `goodDirection="down"` for CPA/cost lines, *don't* leave `autoColor` on a flat series. The `SPARKLINES` array already carries a `note` field — extend each entry with a `code` and `guidance` string so the docs stay co-located with the demo data.
- **Impact**: Turns a passive swatch board into a teaching document — the single strongest signal that this is a *system*, not a stylesheet. Directly raises the portfolio value and makes the primitives genuinely adoptable by another dev without reading source.
- **Implementation sketch**: (1) Add `code?: string` / `guidance?: { do: string; dont: string }` to the `SPARKLINES` and a parallel structure for Pills/Icons. (2) Build a `CodeBlock({ code })` component using `font-mono`, `.tnum`, and the existing `Copy`/`Check` icons with a `navigator.clipboard` client island. (3) Extend `Section` to accept an optional `usage` slot rendered under `children`. (4) For Pills, derive snippets from `PILL_TONE_NAMES` so they never drift.

## 2. Promote Sparkline to a small chart family: states + bar/threshold variants

- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: src/components/charts/Sparkline.tsx:50, src/app/design-system/page.tsx:39
- **Scenario**: `Sparkline` is the only chart primitive and it is line-only. Real KPI cards need (a) an *empty/loading* state — today `values.length < 2` silently renders a blank `aria-hidden` SVG with no "no data" affordance; (b) a *bar* mode for discrete weekly/category series (Google Ads spend by day reads better as bars); and (c) a *threshold/target* line (the `Target`/`Gauge` icons hint the product cares about goals, but the chart can't draw one). The showcase enumerates 10 line variants but zero non-line primitives.
- **Opportunity**: Extend the `charts/` folder into a tiny dependency-free family that shares the existing token-driven color logic. Add: a `variant="bars"` branch to `Sparkline` (or a sibling `Sparkbars`) reusing `yFor`/`pad`/`autoColor`; a `threshold?: number` prop that draws a dashed target line (mirror the existing `baseline` rendering) and recolors the last `dot` by whether the endpoint clears it; and an explicit empty-state render (a faint dashed mid-line + small "—" label) instead of a blank SVG. Add each new variant to the `SPARKLINES`/showcase grid so the living page documents them automatically.
- **Impact**: Doubles the practical reach of the chart layer (bars + targets cover most marketing-dashboard needs) while staying zero-dependency and server-renderable — preserving the "no client JS" selling point. Empty/threshold states make the primitives production-credible, not just demo-pretty.
- **Implementation sketch**: (1) In `Sparkline.tsx`, factor the scale math (`min/max/span/pad/yFor`) into a shared helper. (2) Add `variant: "line" | "bars"` and branch the geometry; reuse `POSITIVE/NEGATIVE` token objects for `autoColor` fills. (3) Add `threshold?` + `formatValue` to the aria-label summary so the a11y string mentions target hit/miss. (4) Replace the `values.length < 2` early-return with an `<EmptySpark>` sub-render. (5) Append 3-4 new entries to `SPARKLINES` in `page.tsx`.

## 3. First-class accessibility + reduced-motion coverage for every primitive

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: S (<1d)
- **File**: src/components/icons.tsx:7 (`base`), src/components/ui.tsx:39 (`Pill`), src/app/design-system/page.tsx:333 (icons grid)
- **Scenario**: Sparkline has thoughtful a11y (`describe`, `label`, role switching), but the icon set and the showcase lag. Every icon in `icons.tsx` renders without `aria-hidden`/`role`, so screen readers may announce 28 unlabeled `svg`s in the grid. Standalone meaningful icons (e.g. `External`, `Share`, `Logo` in a link) have no accessible name path. The `/design-system` page itself never demonstrates the a11y contract that makes this system trustworthy.
- **Opportunity**: Make accessibility a *documented feature* of the system. (a) Default the icon `base` to `aria-hidden: true` with an opt-in `title`/`aria-label` pass-through, and add a tiny `<VisuallyHidden>`/labeled-icon pattern. (b) Add an "Přístupnost" (Accessibility) section to the showcase that visibly demonstrates: decorative vs. labeled icons, the Sparkline's `describe` aria-label text rendered as readable copy, focus-ring tokens (`:focus-visible` already defined in `globals.css`), and the `prefers-reduced-motion` behavior of the `animate-*` utilities. (c) Show contrast pass/fail badges on Pill tone pairs using the existing `luminance()` helper from `design-tokens.ts`.
- **Impact**: A11y is a top differentiator for a marketing/agency portfolio piece and a real adoption blocker for any team. Documenting it visibly converts invisible diligence into a portfolio talking point, and the icon default fix prevents a regression on every page that uses them.
- **Implementation sketch**: (1) In `icons.tsx`, add `aria-hidden` to `base` and a `label?` prop that, when set, swaps to `role="img"`+`aria-label`. (2) Reuse `luminance()`/`readableInkOn()` from `design-tokens.ts` to compute a WCAG ratio and render Pass/Fail pills per tone. (3) New `Section id="pristupnost"` in `page.tsx` with live focus-ring and reduced-motion demos.

## 4. Token contract test + drift guard: turn the living page into a CI gate

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: src/lib/design-tokens.ts:37 (`readTheme`/`parseDeclarations`), src/app/design-system/page.tsx
- **Scenario**: The system's headline claim is "generated from token names, so it never drifts." That holds for *rendering*, but nothing *enforces* it: the regex `parseDeclarations` quietly drops any token if the `@theme` syntax shifts (the comment even notes it relies on "no nested braces"); the dark-mode block in `globals.css` duplicates ~25 token overrides by hand (lines 137-180 vs 182-220) with no check that the two lists stay in sync; and there's a mentioned Playwright visual baseline but no *semantic* token contract. Drift can ship silently.
- **Opportunity**: Build a token contract layer that makes drift a failing build, not a visual surprise. (a) A unit test asserting every light-mode `--color-*` step has a dark-mode counterpart (or is on an explicit "stable" allowlist matching the `onyx-*`/`navy-900` exceptions documented in the CSS). (b) A test that every `PillTone` in `ui.tsx` maps to tokens that actually exist in the parsed `@theme`, and every `goodDirection`/`autoColor` token (`positive`, `negative`, `*-soft`) resolves. (c) Export a machine-readable `tokens.json` from `design-tokens.ts` at build time and snapshot it, so any added/removed/renamed token is a reviewable diff. Surface a "Token coverage" stat on the showpage (e.g. "62 tokens · 25 dark overrides · 0 drift").
- **Impact**: Elevates the design system from "looks consistent" to "provably consistent," the exact rigor a senior reviewer looks for. The dark-mode parity test alone catches a whole class of real bugs the current hand-duplicated CSS invites.
- **Implementation sketch**: (1) Add `parseThemeBlock(selector)` to `design-tokens.ts` that can read both the `@theme` and the `html[data-theme="dark"]` blocks. (2) Write Vitest specs: `dark-parity.test.ts`, `pill-tones-resolve.test.ts`. (3) Emit `tokens.json` via a small node script and snapshot it. (4) Render the coverage counts in a new showcase callout.

## 5. Extract a self-documenting, adoptable token package others can install

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: src/lib/design-tokens.ts (whole), src/app/globals.css:9 (`@theme`), src/components/ui.tsx, src/components/icons.tsx
- **Scenario**: Everything needed to be a *distributable* design system already exists in embryo: a single `@theme` source of truth, a parser that reads it, a generator that renders it, semantic primitives, and a zero-dependency chart + icon set. But it's locked inside one Next.js app. The ideal end state: a tiny package — call it `@systedo/tokens` — that any project can `npm install` to get the same tokens, primitives, dark mode, and a drop-in `/design-system` route. The portfolio piece stops being "a page that looks like a system" and becomes "a system you can actually adopt," which is a categorically stronger demonstration.
- **Opportunity**: Work backward from a published artifact. Step 1 (this codebase): make `design-tokens.ts` the canonical exporter that emits multiple targets from the one `@theme` block — `tokens.json`, CSS variables, a TS `theme` object, and a Figma/Style-Dictionary-compatible file. Step 2: package `Container/Eyebrow/Pill`, the icon set, and the Sparkline family as framework-light exports (props-only, no app coupling). Step 3: ship the `/design-system` page as a reusable route component parameterized by the imported tokens, so an adopter's showcase is generated from *their* `@theme` automatically. Step 4: add a thin "theming" guide showing how to fork the brand ramp while keeping the semantic contract. The showcase becomes the package's own live docs site.
- **Impact**: 10x: converts a one-off case study into a reusable platform with genuine ecosystem potential — the strongest possible portfolio statement ("I don't just use design systems, I ship them"). Forces the clean boundaries (no app-coupled imports, no disk reads in client bundles — already flagged in `design-tokens.ts`) that make the codebase exemplary.
- **Implementation sketch**: (1) Add `exportTargets()` to `design-tokens.ts` producing `tokens.json` / `tokens.css` / `theme.ts` from the parsed `@theme`. (2) Create a `packages/` workspace (or a `lib/system/` barrel) that re-exports `ui.tsx`, `icons.tsx`, `charts/*` with zero `@/app` imports. (3) Parameterize `DesignSystemPage` to accept `ramps/baseColors/icons` props so it can render any consumer's tokens. (4) Document the fork-the-ramp path in a generated "Theming" section. (5) Keep the existing Playwright baseline as the package's visual-regression contract.
