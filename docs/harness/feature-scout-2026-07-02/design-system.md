# Feature Scout — Design System, Icons & Charts (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/components/ui.tsx, src/components/icons.tsx, src/components/charts/Sparkline.tsx, src/app/globals.css, src/app/icon.svg, src/app/design-system/page.tsx, src/lib/design-tokens.ts, tests/design-system.spec.ts

## 1. Extend Sparkline so the four hand-rolled module clones can adopt it (responsive width, peak marker, dashed forecast segment)
- **Impact**: 8/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/charts/Sparkline.tsx:9`
- **Opportunity**: The shared Sparkline is used by KpiCard/ProjectOverview/PortfolioTrend, yet four analytics modules re-implemented their own inline sparklines because it lacks what they needed: ProfitModule's TrendSpark (`ProfitModule.tsx:312`, full-width `className="h-9 w-full"` responsive sizing + empty-state dash), DistributionModule's CtrSparkline (`DistributionModule.tsx:666`, dot on the *peak*, not the last point), LtvModule's SurvivalSpark (`LtvModule.tsx:194`, solid observed + dashed extrapolated segments), and AudienceModule (`AudienceModule.tsx:148`). The DS's flagship chart is half-adopted.
- **Why valuable**: One chart primitive with consistent trend semantics (autoColor, goodDirection, describeLabel a11y) across all KPI surfaces; today the clones each re-solve scaling, a11y and empty states — and drift (different stroke widths, no autoColor).
- **Build sketch**: Add three opt-in props: `responsive` (emit `width/height` as 100% against the viewBox instead of fixed px), `markPeak`/`markTrough` (reuse the existing `pts` array + dot rendering), and `dashFrom={index}` (split the path at an index, render the tail with `strokeDasharray` — exactly SurvivalSpark's observed/modelled shape). Showcase the new variants in `SPARKLINES` (page.tsx:40) and refresh the VR baseline. Then migrate the four clones module-by-module as a second step (they're `"use client"` files → full `next build` per the learnings).

## 2. Promote a Button/CtaLink primitive into ui.tsx and document it in the showcase
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/ui.tsx:39`
- **Opportunity**: The primary CTA class string (`rounded-pill bg-brand-600 … text-white hover:bg-brand-700`) is copy-pasted 42+ times across 32 files (Nav, cena, all AI panels, campaign tools, app modules), and secondary/ghost variants are equally ad-hoc. ui.tsx has Container/Eyebrow/Pill but no Button — the single most-repeated visual pattern in the app is the one primitive the design system doesn't own, and /design-system has no "Tlačítka" section.
- **Why valuable**: One source of truth for the most common interactive element ends per-file drift (padding, focus ring, disabled states already vary) and gives the living style guide the section every reviewer expects first.
- **Build sketch**: Add `Button` (and an `as`/`href` link mode) to ui.tsx following the Pill precedent: a `BUTTON_VARIANTS: Record<Variant, string>` map + exported `BUTTON_VARIANT_NAMES` so the showcase enumerates variants from the source (mirrors `PILL_TONE_NAMES`, ui.tsx:37). The primitive is presentational (no handlers) so it stays server-safe. Add a showcase Section + a Playwright structural check, refresh the VR baseline. Migrate consumers incrementally — seed with Nav + /cena first; wholesale replacement is a separate wave (touches `"use client"` files → full `next build`).

## 3. Generate a branded og:image from the design tokens (opengraph-image.tsx)
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `src/app/layout.tsx:31`
- **Opportunity**: `metadata.openGraph` sets title/description but no image, and no `opengraph-image.*` exists anywhere — every share of this portfolio site (LinkedIn, X, Slack, iMessage) renders a bare text card. Meanwhile the brand assets already exist: the faceted "A" mark (`src/app/icon.svg`), the onyx/teal palette, and a server-side token reader.
- **Why valuable**: For a case-study/portfolio site, the link preview *is* the first impression; a token-derived card also demonstrates the "design system drives everything" story to reviewers.
- **Build sketch**: Add `src/app/opengraph-image.tsx` using `next/og` `ImageResponse` (1200×630): onyx-navy background, the icon.svg "A" paths redrawn as JSX, site name + tagline in brand tokens. Set `export const runtime = "nodejs"` so importing values from `design-tokens.ts` (readFileSync at module scope) is safe — this is a server route, so the server-only boundary from harness-learnings is respected by construction. Optionally reuse the same template for `/clanek`'s article pages later.

## 4. Turn the existing luminance math into an automated WCAG contrast guard over token pairs (light + dark)
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: automation
- **File**: `src/lib/design-tokens-color.ts:11`
- **Opportunity**: `design-tokens-color.ts` already computes WCAG relative luminance, but only to pick swatch label ink — nothing asserts that the token pairs the UI actually composes stay legible: the six `PILL_TONES` bg/text pairs (ui.tsx:26), ink-on-canvas, muted-on-surface, brand-accent links, positive/negative on their soft tints. A dark-mode retune (globals.css:170) could silently drop a pill below 4.5:1 and no gate would notice — the VR screenshot only covers light mode.
- **Why valuable**: Converts the DS's accessibility from "looks fine today" into a regression-proof guarantee, in both themes, at unit-test speed (no browser).
- **Build sketch**: Export a pure `contrastRatio(hexA, hexB)` next to `luminance`. Add `test-unit/design-tokens-contrast.test.mjs` (the `node --test` precedent from the modules) that reuses the `parseDeclarations` regex approach on globals.css — the light `@theme` block plus the `html[data-theme="dark"]` overrides — resolves each pair under both themes, and asserts ≥4.5:1 (text) / ≥3:1 (large/pill text). Complements (does not duplicate) the still-open dark-block *equality* guard from the 2026-06-25 scan: this checks legibility, not sync.

## 5. Promote DeltaBadge into the design system, showcase its significance states, and retire ProfitModule's duplicate DeltaPill
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/dashboard/DeltaBadge.tsx:30`
- **Opportunity**: DeltaBadge is DS-grade — locale-aware, goodDirection-aware, with noise/weak/strong significance rendering — but it lives under `dashboard/`, is absent from /design-system, and has already been re-invented as a worse `DeltaPill` in ProfitModule (`ProfitModule.tsx:340`: no goodDirection, no significance, hardcoded colors by sign). The exact half-implemented-primitive pattern the Pill/Sparkline showcase exists to prevent.
- **Why valuable**: The "noise never reads as a trend" semantic is a genuinely distinctive product behavior; documenting it makes every future KPI surface use it instead of hand-rolling sign-colored percentages, and screen-reader/tooltip copy stays consistent.
- **Build sketch**: Move (or re-export) DeltaBadge alongside ui.tsx primitives; add a "DeltaBadge — stavy" showcase Section rendering the matrix (improving/worsening × noise/weak/strong × goodDirection up/down) — it's a client component, which the page already hosts (LocaleShowcase, Swatch islands). Replace ProfitModule's DeltaPill with it (both files are `"use client"` → run a full `next build`). Extend the Playwright structural test with one state assertion and refresh the VR baseline.
