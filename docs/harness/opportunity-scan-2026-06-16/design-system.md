# Design System, Icons & Charts — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 3, Medium: 2, Low: 0)
> Lenses: Business Visionary + Feature Scout

## 1. Promote the primary button to a real `Button` primitive (and into the showcase)
- **Severity**: High
- **Lens**: Both
- **Category**: differentiation
- **File**: src/components/ui.tsx · src/app/design-system/page.tsx · (callers: page.tsx, AdGenerator.tsx, CampaignsClient.tsx, ContentBriefGenerator.tsx, CampaignTable.tsx, PerformanceAnalyst.tsx, AuthButton.tsx, ai/primitives.tsx)
- **Opportunity**: The exact primary-button class string (`rounded-pill bg-brand-600 … text-white … hover:bg-brand-700 active:scale-[0.99] disabled:…`) is hand-copied across 8+ files, already drifting (`transition-colors` vs `transition-[background-color,transform]`, with/without `disabled:active:scale-100`, px-3/px-5 variants). There is no `Button`/`ButtonLink` component and no button row in `/design-system`, even though `Pill`, `Sparkline` and icons all have one.
- **Value**: A reviewer judging "design craft" sees inconsistent buttons today; a single `Button` with `variant` (primary/secondary/ghost) + `size` props, enumerated in the showcase like `PILL_TONE_NAMES`, removes the drift, shrinks every caller, and turns the most-used interactive element into a portfolio centerpiece that proves systematic thinking.
- **Effort**: M
- **Fix sketch**: Add `Button({ variant, size, as })` to `ui.tsx`, export a `BUTTON_VARIANTS` map (mirroring `PILL_TONES`/`PILL_TONE_NAMES`), refactor the 8 callers, and add a `ds-buttons` `Section` to `page.tsx` that maps over the variants — so the test baseline locks button states too.

## 2. Extract a shared SVG line-chart core to kill three re-implementations
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/charts/Sparkline.tsx · src/components/dashboard/TrendChart.tsx · src/components/campaigns/ScoreTimeline.tsx
- **Opportunity**: `Sparkline`, `TrendChart` and `ScoreTimeline` each independently re-derive the same primitives: min/max → scale, `x(i)`/`yFor(v)` mappers, the `M…L…` line string, and the baseline-anchored `… L … L … Z` area path. The math is copy-evolved (TrendChart adds gridlines/compare/hover; ScoreTimeline fixes a 0–100 domain), but the core path-building is triplicated and only `Sparkline` lives under `charts/`.
- **Value**: A single `charts/scale.ts` (or `buildLinePath`/`buildAreaPath` + a `linearScale` helper) removes a class of "one chart got a fix, the others didn't" bugs, makes new chart primitives cheap, and is the kind of internal-consistency signal a senior reviewer rewards. It also unlocks finding #3 with almost no extra cost.
- **Effort**: M
- **Fix sketch**: Add `src/components/charts/scale.ts` exporting `linearScale(domain,range)` and `buildLinePath/buildAreaPath(pts)`; rewire all three components onto it, keeping each chart's distinctive decoration (gridlines, anomaly diamonds, healthy line) on top.

## 3. Add a `BarSpark` / mini-bar primitive for the channel & campaign tables
- **Severity**: Medium
- **Lens**: Both
- **Category**: feature
- **File**: src/components/charts/ (new) · src/components/dashboard/ChannelTable.tsx · src/components/campaigns/TypeBreakdown.tsx · src/app/design-system/page.tsx
- **Opportunity**: The chart set is line-only (`Sparkline` + two bespoke line charts). Channel mix, campaign-type breakdown and budget share are inherently categorical/part-to-whole, yet there is no bar or share/progress primitive — tables likely fall back to numbers or ad-hoc inline divs. The showcase advertises "the dependency-free Sparkline" but stops there.
- **Value**: One small server-renderable `BarSpark`/`ShareBar` (same no-client-JS, token-driven, `autoColor`/`describe` a11y contract as `Sparkline`) makes the dashboard read faster, demonstrates breadth of the design system to a reviewer, and reuses the scale helper from #2. A richer "charts" section is a concrete portfolio differentiator.
- **Effort**: M
- **Fix sketch**: Add `charts/BarSpark.tsx` mirroring `Sparkline`'s prop/a11y shape (values, `autoColor`, `describe`, semantic tokens), use it in `ChannelTable`/`TypeBreakdown`, and add a "Sloupce / podíl" group to the Sparkline `Section` in `page.tsx`.

## 4. Make the showcase a self-documenting, copy-ready component gallery
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: differentiation
- **File**: src/app/design-system/page.tsx · src/components/ui.tsx (export `Copy` already exists in icons.tsx)
- **Opportunity**: `/design-system` enumerates tokens, pills, icons and sparklines live from source — excellent — but it shows *renders only*, never the usage snippet. There is already a `Copy` icon and a clipboard pattern (`CopyButton` in `ai/primitives.tsx`); the page never reuses it. For a case-study repo whose whole point is to impress, the design system is a sales asset that currently can't be "lifted from."
- **Value**: Adding a copyable `<Pill tone="coral">` / `<Sparkline … />` / icon-import snippet under each tile turns the showcase from a poster into documentation — the single highest-signal "this person builds real design systems" artifact for a reviewer, at low risk (server-rendered, baseline-stable).
- **Effort**: S
- **Fix sketch**: Lift `CopyButton` out of `ai/primitives.tsx` into a shared spot, and in `page.tsx`'s `Swatch`/icon/pill/sparkline tiles render a small `<code>` + `CopyButton` with the exact JSX/`var(--color-…)` string; gate it behind a tiny client island so the page stays mostly RSC.
- **Note**: Snippet labels reference the dev LLM wrapper (Claude CLI in dev / Gemini in prod) only in copy text, not behavior — no model-call change here.

## 5. Reduced-motion-aware entrance utilities + tokenized focus ring as design-system entries
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: user_benefit
- **File**: src/app/globals.css · src/app/design-system/page.tsx · src/components/site/ThemeToggle.tsx
- **Opportunity**: `globals.css` has a real motion system (`fadeUp`/`fadeIn`/`drop`, a global `prefers-reduced-motion` kill-switch) and a tokenized `:focus-visible` ring — genuinely good work that is **invisible**: the `/design-system` page documents colors/type/pills/icons/sparklines/radius/shadow but never motion, focus, `.bg-dotgrid`, `.link-inline` or `.no-scrollbar`. Accessibility and motion are the system's strongest differentiators and they're undocumented.
- **Value**: A "Pohyb a přístupnost" (Motion & a11y) `Section` showcasing the three animations (with a reduced-motion note), the focus ring on a sample control, and the utility classes makes the repo's a11y maturity legible to a reviewer — and gives the Playwright baseline coverage over the motion/focus states it currently can't assert. High signal, low effort.
- **Effort**: S
- **Fix sketch**: Add a `ds-motion` `Section` in `page.tsx` that renders buttons triggering `.animate-fade-up/-in/-drop` (re-key to replay), a focused sample input to show the `:focus-visible` token, and tiles for `.bg-dotgrid`/`.link-inline`; annotate that `prefers-reduced-motion` neutralizes them all.
