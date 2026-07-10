# Design System Primitives

> Total: 5
> Critical: 0 · High: 0 · Medium: 3 · Low: 2
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

Note on dedup: the prior code_refactor report's top two items have since been *implemented* — `TONE_TEXT` now exists in `ui.tsx:45` and is consumed by three modules, and `ArrowUpRight` has been deleted from `icons.tsx`. The Sparkline↔DeltaBadge duplication, LocaleShowcase coverage gap, and the "rethekied" typo remain but are all already named in that report, so they are not re-reported here. No genuinely-new refactor finding surfaced; all 5 below are bug-hunter.

## 1. `<Tally>` flashes back to zero and re-counts every time it re-enters the viewport

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/motion/Kinetics.tsx:57`
- **Scenario**: `Tally` calls `useInView(ref, { amount: 0.6 })` with **no `once` option**, so `inView` toggles true→false→true as the user scrolls the element out of and back into view. The effect (lines 61-69) runs `animate(from, to, …)` on every `inView` turn, and `from` defaults to `0`. When the element leaves view the effect returns early *without* resetting `val`, so the span keeps showing the final number; the moment it scrolls back in, `animate(0, to)` fires `onUpdate` with a value near `0` and the display **snaps from e.g. "63%" down to "0%" and counts up again**. The same restart happens if a parent re-renders with a new `to` (both `from` and `to` are in the dep array, line 69) — the number drops to 0 before animating to the new value. Reproduce: view `VisibilityGauge` (its centre readout is a `<Tally>`), scroll it just past the top of the viewport, scroll back — the percentage visibly resets to 0 and re-animates.
- **Root cause**: The component conflates "animate once on first reveal" with "re-animate on every intersection." Unlike `ChartReveal` (whose doc explicitly says it is *designed* to replay), `Tally`'s contract ("counts up to `to` when it enters the viewport") implies a one-shot, but nothing enforces it and the animation always restarts from `from`, not from the currently-displayed value.
- **Impact**: Jarring, repeated flash-to-zero on any page where a Tally stat can scroll off-screen and back; on live/updating values it briefly shows `0` mid-view (success-theater glitch that reads as a data blip).
- **Fix sketch**: Pass `{ amount: 0.6, once: true }` to `useInView` so it fires a single time, and/or gate the effect with a `hasRun` ref. If replay is genuinely wanted, seed `animate` from the current `val` instead of `from` so it never dips to zero.

## 2. Sparkline pins a flat (unchanging) series to the bottom edge instead of the middle

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/charts/Sparkline.tsx:124`
- **Scenario**: For a series where every value is equal (a KPI that didn't move, e.g. `values={[5,5,5,5]}`), `min === max`, so `span = max - min || 1 = 1` (line 126). `yFor(v) = pad + (1 - (v-min)/span) * innerH = pad + (1 - 0/1) * innerH = pad + innerH` — i.e. the **bottom** of the chart. Every point lands on the baseline, so a perfectly steady metric renders as a flat line glued to the floor of the card, visually indistinguishable from a metric that has crashed to its minimum.
- **Root cause**: The zero-span guard (`|| 1`) only prevents a divide-by-zero; it doesn't recognise that a zero-range series has no meaningful vertical position and should be centred. The normalisation `(v-min)/span` collapses to `0` for all points, which maps to the bottom, not the visual middle.
- **Impact**: Misleading sparkline for any unchanged KPI — a "held steady" metric looks like it bottomed out. Affects the hero, every KPI card, campaign table and app modules that feed occasionally-flat series (retention at a plateau, a paused campaign).
- **Fix sketch**: When `max - min === 0` (no fixed `domain`), map all points to the vertical centre: e.g. `const flat = max === min; const yFor = (v) => flat ? height/2 : pad + (1-(v-min)/span)*innerH;`. Keeps the existing behaviour for varying series.

## 3. Sparkline's generated aria-label hard-codes cs-CZ percent formatting, contradicting its own "no locale of its own" contract

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/charts/Sparkline.tsx:10`
- **Scenario**: Line 10 imports the **bare** `fmtSignedPct` from `@/lib/format`. That named export is the fixed cs-CZ / CZK default instance (`format.ts:351` `const cs = createFormatters(DEFAULT_LOCALE)`, re-exported at `format.ts:353-377`). In the `describe` path, line 168 builds the percent with `fmtSignedPct(pct/100, …)`, producing Czech number style ("+12,5 %", comma decimal, NBSP before `%`). This `pct` string is then handed to any caller-supplied `describeLabel({ start, end, pct })`. The component's own JSDoc (lines 62-66) explicitly promises: *"this component is dependency-free and has no locale of its own, so the single formatting source stays at the call site"* — but the percent is not overridable, only `start`/`end` are (via `formatValue`). On the English site a described sparkline announces "…change +12,5 %" in Czech formatting even when the caller passes an English `describeLabel`.
- **Root cause**: The percent formatting was hardwired to the default-locale export instead of being threaded through a caller parameter like `formatValue`, breaking the localisation seam the API otherwise advertises (and contradicting the file's own contract comment).
- **Impact**: Locale-incorrect screen-reader output on the en locale; a subtle i18n leak in a primitive whose stated design goal is locale-neutrality. Silent (only audible to AT / visible in the accessibility tree).
- **Fix sketch**: Add an optional `formatPercent?: (fractionalPct: number) => string` prop (defaulting to the current `fmtSignedPct`), or fold the percent into `describeLabel` as an unformatted number so the call site owns all locale formatting — matching how `formatValue` already localises the endpoints.

## 4. `<ChartReveal>` unmounts its child when scrolled out of view, shifting page layout unless the caller pins a height

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/motion/Kinetics.tsx:32`
- **Scenario**: `ChartReveal` renders `{inView || reduce ? children : null}` inside a plain `<div ref>` (lines 32-36) with `useInView(ref, { amount })` and no `once`. While the section is out of view the child is `null`, so the wrapper div collapses to zero height. Every current caller happens to pass a fixed-height className (e.g. `LocalSeoShowcase.tsx:126` uses `h-52`), which masks the problem — but the primitive itself provides no intrinsic sizing. A future caller that omits an explicit height gets a container that collapses and re-expands as it crosses the viewport boundary, changing total document height and causing scroll-position jump / cumulative layout shift while scrolling.
- **Root cause**: The reveal deliberately unmounts to replay the CSS keyframe (intended), but delegates all size reservation to the caller with no min-height fallback, so the "collapses to 0 when hidden" side effect is a silent trap for anyone who forgets the height class.
- **Impact**: Layout shift / scroll jank on marketing pages if any consumer omits a height; degrades perceived polish, harms CLS. Currently latent because existing call sites pin height.
- **Fix sketch**: Reserve space even when the child is unmounted — keep the child mounted but `visibility:hidden` when out of view, or render a same-dimension placeholder, or document + default a `minHeight`. At minimum, add a dev warning if the container has no intrinsic height.

## 5. `<Tally>` renders numbers with raw JS formatting, bypassing the app's locale formatter

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/motion/Kinetics.tsx:72`
- **Scenario**: The displayed text is `decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toString()`. `toFixed`/`toString` always use a `.` decimal separator and **no thousands grouping**, regardless of locale. In this cs-CZ-first app (whose `LocaleShowcase` exists specifically to prove numbers are locale-parameterised), a `<Tally to={1248590}>` for a "1 248 590 leads" marketing stat renders `1248590`, and `<Tally to={4.2} decimals={1}>` renders `4.2` instead of the Czech `4,2`. Current usage is safe only because the sole caller (`VisibilityGauge`) passes integer percentages 0-100 where grouping/decimals don't apply — so this is a dormant landmine that detonates the first time Tally is used for any value ≥ 1000 or with decimals.
- **Root cause**: The animation primitive formats the interpolating value inline with primitive `Number` methods rather than accepting a `format?: (n: number) => string` callback wired to `createFormatters(locale)`, so it can't participate in the locale layer the rest of the app funnels through one chokepoint.
- **Impact**: Latent locale-incorrect / ungrouped numbers on marketing surfaces the moment Tally is reused for a non-percentage stat; visually inconsistent with every other number on the page.
- **Fix sketch**: Add an optional `format?: (n: number) => string` prop; when set, render `format(shown)` instead of the `toFixed`/`round` branch, and have callers pass the locale-bound `fmtInt`/`fmtDecimal`. Keeps the current integer-percent behaviour when no formatter is supplied.
