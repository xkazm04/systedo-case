# Design System Primitives — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Sparkline claims to be locale-free but hard-wires Czech into the default aria-label
- **Severity**: High
- **Lens**: ambiguity
- **Category**: locale-contract-contradiction
- **File**: src/components/charts/Sparkline.tsx:10,63-66,164-172
- **Scenario**: Any English-locale page renders a sparkline with `describe` but no `describeLabel`. The generated label is `"Trend od X do Y, změna +12,4 %"` — Czech phrasing AND Czech number formatting, because the file imports the top-level `fmtSignedPct`, which `src/lib/format.ts` documents as "a default Czech (cs-CZ / CZK) instance of the factory".
- **Root cause**: The prop doc on `describeLabel` explicitly asserts "this component is dependency-free and has no locale of its own, so the single formatting source stays at the call site" — but line 10 imports the cs-bound `fmtSignedPct` and line 172 hard-codes a cs sentence as the fallback. The comment and the code state opposite contracts; the LocaleShowcase component proves the app is otherwise fully locale-parameterised via `createFormatters(locale)`.
- **Impact**: Screen-reader users on the en locale hear Czech trend summaries with comma decimals; future developers reading the (false) "dependency-free" comment will assume locale is already handled at call sites and skip passing `describeLabel`, silently shipping mixed-language a11y text.
- **Fix sketch**: Either make `describeLabel` + `formatValue` required whenever `describe` is set (compile-time enforcement of the stated contract), or accept a `locale`/`formatters` prop and route both phrasing and the percent through `createFormatters(locale)`. At minimum, delete the "dependency-free" claim and document that the fallback is cs-only.

## 2. ChartReveal unmounts children on scroll-out — state loss, layout shift, and empty SSR/no-JS output
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unmount-on-exit-side-effects
- **File**: src/components/motion/Kinetics.tsx:20-37
- **Scenario**: (a) A wrapped chart holds interactive state (hover selection, a running `Tally`, fetched data) — scrolling it out of view destroys that state and any effects re-run on every return. (b) The wrapper `<div>` has no reserved height, so each mount/unmount collapses/expands the section, shifting the page under the user's scroll (self-perpetuating jitter right at the visibility threshold). (c) On first paint — and permanently with JS disabled — `inView` is `false` and `reduce` is `null`, so the SSR HTML contains no chart at all.
- **Root cause**: The "re-plays its draw-in every time" effect is implemented by conditional rendering (`inView || reduce ? children : null`) instead of a `key` remount inside an always-present, height-stable container. None of these three trade-offs (state reset, CLS, missing static content) are mentioned in the otherwise thorough doc comment.
- **Impact**: Cumulative layout shift on every scroll past a chart section, lost child state, redundant work on re-entry, and invisible chart content for crawlers/no-JS — all for a marketing site where CLS and static content matter.
- **Fix sketch**: Keep children always mounted; drive the replay with a `key={inViewCount}` (or pass `inView` down / toggle a CSS animation class), and give the wrapper a `min-height` or `aspect-ratio` matching the chart. Document that children must be cheap to remount if the unmount approach is deliberately kept.

## 3. LocaleShowcase uses role="tablist"/"tab" without the tabs keyboard pattern or tabpanels
- **Severity**: Medium
- **Lens**: ui
- **Category**: aria-pattern-mismatch
- **File**: src/components/LocaleShowcase.tsx:45-64
- **Scenario**: A screen-reader or keyboard user reaches the cs/en switch. It announces as "tab 1 of 2", implying arrow-key navigation and an associated tabpanel — but there is no roving `tabindex`, no ArrowLeft/ArrowRight handling, no `aria-controls`, and no element with `role="tabpanel"` (the table below is unlabelled plain content).
- **Root cause**: The ARIA tabs role was applied for its visual/semantic vibe, but the WAI-ARIA tabs pattern is a composite widget contract (roving focus + arrow keys + panel linkage), none of which is implemented.
- **Impact**: Assistive-tech users get a widget that promises behavior it doesn't have — arrow keys do nothing, both "tabs" sit in the tab order, and the announced tab has no panel. This is worse than no ARIA at all.
- **Fix sketch**: Since it's a two-state value switch, drop the tab roles: use a radiogroup (`role="radio"` + `aria-checked`) or plain buttons with `aria-pressed`, keeping the existing pill styling. If tabs semantics are wanted, implement the full pattern (roving tabindex, arrow keys, `aria-controls` → `role="tabpanel"` on the table wrapper).

## 4. Responsive Sparkline stretches dots into ellipses (preserveAspectRatio="none" vs. circle markers)
- **Severity**: Medium
- **Lens**: ui
- **Category**: svg-nonuniform-scaling
- **File**: src/components/charts/Sparkline.tsx:184,222-237
- **Scenario**: Any `responsive` sparkline whose CSS box has a different aspect ratio than the `width`/`height` viewBox (e.g. the documented `"h-9 w-full"` in a wide KPI card, viewBox 120x36). The SVG scales non-uniformly under `preserveAspectRatio="none"`.
- **Root cause**: Line paths are protected with `vectorEffect="non-scaling-stroke"`, but the `dot` / `markPeak` / `markTrough` `<circle>` elements have geometric radii in viewBox units and no such protection — non-uniform scaling turns each circle into an ellipse and inflates/squashes its ring stroke.
- **Impact**: The signature "you are here" dot — explicitly called out as the Robinhood-style focal detail — renders as a smeared oval on wide cards, undermining the polish the component was built for; distortion varies per container so the same primitive looks different across the app.
- **Fix sketch**: Render markers resolution-independently: give circles `vectorEffect="non-scaling-stroke"` with `fill="none"`-plus-thick-stroke, or (cleaner) draw the dot as a zero-length path with `strokeLinecap="round"` and non-scaling stroke, or overlay markers as absolutely-positioned HTML when `responsive` is set.

## 5. Tally bypasses the app's formatting chokepoint — raw unseparated numbers in hero stats
- **Severity**: Medium
- **Lens**: ui
- **Category**: formatting-inconsistency
- **File**: src/components/motion/Kinetics.tsx:71-79
- **Scenario**: A hero stat counts up to a large value, e.g. `<Tally to={1248590} />`. The final rendered text is `1248590` (via `Math.round(v).toString()` / `toFixed`) sitting next to static numbers the rest of the app renders as "1 248 590 Kč" through `createFormatters` — the exact consistency LocaleShowcase demonstrates as the product's selling point.
- **Root cause**: The count-up formats with bare `toString`/`toFixed` and pushes units into string `prefix`/`suffix` props, instead of accepting a formatter. Callers can't inject `fmtInt`/`fmtCZK`, so grouping separators, cs comma decimals, and currency placement are all lost for animated numbers; `toFixed` also always uses a dot decimal, wrong for the cs default locale.
- **Impact**: The most prominent numbers on the page (animated hero/KPI tallies) are the only ones that violate the "every page renders numbers identically" contract in format.ts — visible inconsistency plus a wrong decimal separator for Czech users.
- **Fix sketch**: Add a `format?: (n: number) => string` prop (default keeping current behavior), apply it in `onUpdate`/final render, and pass `fmtInt`/`fmtCZKCompact` at call sites; deprecate `decimals` in favor of the formatter.
