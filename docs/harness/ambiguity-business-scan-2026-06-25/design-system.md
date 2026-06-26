# Design System, Icons & Charts — Ambiguity + Business scan
> Context: Reusable visual primitives (Container/Eyebrow/Pill, SVG icons, dependency-free Sparkline, @theme tokens) plus a living, token-generated /design-system showcase with a Playwright visual baseline.
> Files analyzed: 8
> Total findings: 5

## 1. Dark mode is the system's biggest differentiator yet it is invisible in the living guide and unprotected by visual regression
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/app/globals.css:170 (+216); tests/design-system.spec.ts:56
- **Problem/Opportunity**: `globals.css` carries a full parallel dark token set with carefully reasoned notes about what is *intentionally* not overridden (onyx, coral, navy-900 — lines 167-214). But `/design-system` renders only the light palette, and the Playwright baseline captures a single light full-page screenshot (`toHaveScreenshot("design-system.png")`, spec:56). The most impressive capability in the whole DS is neither shown nor regression-guarded.
- **Why it matters**: A token-driven light/dark system that survives visual regression is exactly the kind of "living, VR-tested DS" that sells a portfolio. Today a reviewer literally cannot see it, and a dark-mode color regression would ship silently.
- **Fix sketch**: Add a dark-mode variant to the showcase (e.g. force `html[data-theme="dark"]` via a query param or a second wrapped render) and a second Playwright snapshot, e.g. `page.emulateMedia({ colorScheme: "dark" })` + `toHaveScreenshot("design-system-dark.png")`. A side-by-side swatch column (light value / dark value, read from both token blocks) would make the system's adaptability the headline.

## 2. Sparkline hardcodes a cs-CZ a11y label and a non-locale default formatter, contradicting the showcase's "one formatting source" claim
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/components/charts/Sparkline.tsx:112 (and :109)
- **Problem/Opportunity**: The showcase's localization section asserts „Veškeré formátování čísel, měn a dat teče přes `createFormatters(locale)`" (page.tsx:377). Yet the Sparkline — reused in the hero and every KPI card — builds its `describe` aria-label as a hardcoded Czech string `Trend od … do …, změna …` (Sparkline.tsx:112) and defaults `formatValue` to `String(n)` (line 109), bypassing the locale source entirely. The single "one source of truth" guarantee has an undocumented exception in the most-reused component.
- **Why it matters**: Localization-readiness is explicitly marketed here as proof the product scales to more languages/currencies; an untranslatable a11y string in the flagship chart quietly breaks that promise for screen-reader users on a non-cs market.
- **Fix sketch**: Either (a) make the label template a prop / accept a `describeLabel(first,last,pct)` builder so callers supply localized copy, or (b) at minimum document on the `describe` prop (Sparkline.tsx:30-32) that the label text is cs-CZ-only and `formatValue` should be wired to `createFormatters(locale)`. Showcase the localized variant in the Sparkline section.

## 3. The dark token overrides are duplicated almost verbatim in two blocks — a hand-sync drift hazard with no guard
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/app/globals.css:170 and :216
- **Problem/Opportunity**: The `html[data-theme="dark"]` block (170-214) and the `@media (prefers-color-scheme: dark) html:not([data-theme="light"])` block (216-254) restate the same ~30 token overrides (canvas, brand, navy, semantic, shadows). Any future tweak must be made in both places by hand; the dot-grid override is also duplicated (269 vs 256). There is no test asserting the two sets stay identical, so they can silently diverge — exactly the drift the rest of this context works hard to prevent.
- **Why it matters**: "System mode follows OS, explicit choice wins" is a credible feature only if the two paths render identically; divergence means a user toggling vs. relying on OS preference sees different colors.
- **Fix sketch**: Either dedupe (drive both paths from one selector list, or set `color-scheme`/a data attribute so a single dark block applies), or add a unit test that parses both dark blocks from `globals.css` (reuse the disk-reading approach in design-tokens.ts:37) and asserts equal key/value maps.

## 4. The "never drifts" guarantee silently excludes typography — the type scale and the `--text-*`/`--font-*` tokens are hand-maintained
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/app/design-system/page.tsx:110 (TYPE_SCALE) vs src/lib/design-tokens.ts:66
- **Problem/Opportunity**: The page promises swatches „se generují přímo z názvů tokenů … takže se přehled nikdy nerozejde se zdrojem" (page.tsx:181-184), but `design-tokens.ts` only parses `color`/`radius`/`shadow` categories (lines 66/89/95). The deliberate sub-base bump (`--text-xs: 0.875rem`, `--text-sm: 1rem`, globals.css:84-90) and the `--font-*` tokens are never read; the typography section's `TYPE_SCALE` is a hardcoded array of Tailwind classes (page.tsx:110-116) that can drift from the real token values. Relatedly, the Pill/icon tests hardcode the tone and icon lists (spec.ts:40,48), so the "source-of-truth" no-drift property is asserted only visually, not structurally.
- **Why it matters**: A living style guide whose typography panel can lie about the actual sizes undercuts the central selling point; this is the one place the otherwise-rigorous "generated from tokens" story breaks.
- **Fix sketch**: Extend `parseDeclarations` to read `text` (and `font`) categories and render the type scale from them; or add a comment on TYPE_SCALE noting it is intentionally hand-curated and why. Add a structural test: rendered Pill count === `PILL_TONE_NAMES.length` and icon-tile count === exported-icon count, so a new token is provably shown.

## 5. Token swatches are display-only — add click-to-copy (var name / hex / class) to turn the showcase into a real working DS reference
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/app/design-system/page.tsx:147 (Swatch); icon already exists at src/components/icons.tsx:127 (Copy)
- **Problem/Opportunity**: Every mature reference DS (Tailwind, Chakra, Radix) lets you click a swatch/icon to copy its token. Here `Swatch` (page.tsx:147-160) and the icon tiles (page.tsx:336-345) render the names purely as labels, and a `Copy` glyph already exists unused in this context. Adding copy-to-clipboard for the `--color-…` var, the hex, or the icon import would make the guide genuinely usable by other developers, not just viewable.
- **Why it matters**: "Usable by the rest of the team/clients" is what elevates a showcase from a demo page to a portfolio-grade asset; it is the single cheapest credibility upgrade here.
- **Fix sketch**: Introduce one tiny client-island `CopyButton` (uses `navigator.clipboard`, swaps `Copy`→`Check` on success) and drop it into `Swatch` and the icon tile. Note the tradeoff: this adds the first client JS to a deliberately all-SSR page — keep it an isolated `"use client"` leaf so the VR baseline and server rendering of the rest are unaffected.
