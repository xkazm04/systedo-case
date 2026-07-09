# Design System Primitives

> Context #13 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 3, Low: 1)
> Files read: 17

## 1. The pill tone→color mapping is hand-rolled again in three separate modules

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/ui.tsx:24-33`
- **Scenario**: `ui.tsx` centralizes the `PillTone` → class mapping once in `PILL_TONES` (`brand`/`navy`/`positive`/`negative`/`neutral`/`coral`) for `<Pill>`. But three unrelated feature modules each independently re-derive the *same* positive/coral/negative semantic-tone→color logic for their own local `Stat`-style components, as a plain text color instead of a pill chip: `src/components/app/modules/IntegrationStatusModule.tsx:101-102` (`Sum`: `tone === "positive" ? "text-positive" : tone === "coral" ? "text-coral-600" : "text-negative"`), `src/components/app/modules/LocationsModule.tsx:260-272` (`FocusStat`: `tone === "coral" ? "text-coral-600" : "text-navy-800"`), and `src/components/app/modules/ReviewInbox.tsx:421-425` (`Stat`: `tone === "positive" ? "text-positive" : tone === "coral" ? "text-coral-600" : "text-navy-800"`).
- **Root cause**: `PILL_TONES` only exports combined background+text classes for the `<Pill>` chip. When three different modules later needed just the *text* color (no chip background) for a stat/summary label, none of them extended the shared map — each wrote its own inline ternary instead.
- **Impact**: The same brand/positive/coral/negative palette now has four independent sources of truth (one centralized, three ad hoc). A future rebrand or token rename (e.g. `text-coral-600` → a new class) requires finding and updating all four by hand; miss one and a stat label will visibly disagree with a `<Pill>` showing the same tone on the same page.
- **Fix sketch**: In `ui.tsx`, export a small text-only companion map next to `PILL_TONES` (e.g. `TONE_TEXT_COLOR: Partial<Record<PillTone, string>>` covering `positive`/`coral`/`negative`/`navy`), then have `IntegrationStatusModule.tsx:102`, `LocationsModule.tsx:272`, and `ReviewInbox.tsx:425` import and index it instead of re-deriving the ternary. No visual change — the existing class strings are identical, just relocated.

## 2. `ArrowUpRight` icon is exported but never imported anywhere

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/components/icons.tsx:54-60`
- **Scenario**: `ArrowUpRight` is a full exported component, but a repo-wide grep for `ArrowUpRight` across all of `systedo-case` (not just `src/`) returns only its own definition — no JSX usage, no import, and no entry in `icon-map.tsx`'s `MODULE_ICONS` registry (which is where non-JSX icon references live for this file). Every other one of the 53 icons in this file resolves to a real call site either directly or through that registry.
- **Root cause**: Likely added alongside the very similar `ArrowRight` and `External` (both already cover "arrow"/"external link" CTAs) as a plausible future variant, then never wired up.
- **Impact**: Small but permanent dead weight in a file whose entire stated purpose ("Inline, dependency-free icon set... Keeping these local avoids an icon library and keeps the bundle lean") is bundle leanness — an unused export works against that goal, quietly, forever (no lint rule catches unused named exports here).
- **Fix sketch**: Delete the `ArrowUpRight` function (`icons.tsx:54-60`). If a future design genuinely needs a distinct "arrow pointing up-right" glyph (as opposed to the existing `External`, which already covers that shape), re-add it at that point with a real caller.

## 3. Sparkline's `autoColor` reimplements DeltaBadge's `improving` boolean

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/charts/Sparkline.tsx:111-120`
- **Scenario**: Sparkline's `autoColor` mode computes `const good = delta > 0 === (goodDirection === "up")` to pick the POSITIVE/NEGATIVE stroke+fill tokens (line 116). `src/components/dashboard/DeltaBadge.tsx:68` computes the logically identical value — `const improving = goodDirection === "up" ? delta > 0 : delta < 0` — to pick its positive/negative pill tone for the *same kind of number* (a KPI delta with a caller-supplied "which direction is good" flag). Both consume the same `goodDirection: "up" | "down"` contract (also re-typed a third time, as `Direction`, locally in Sparkline.tsx).
- **Root cause**: Sparkline (a general chart primitive) and DeltaBadge (a dashboard-specific pill) were built independently and each needed the same "is this trend good or bad" test, so each wrote its own boolean expression against its own token system (CSS custom properties vs Tailwind classes).
- **Impact**: Currently harmless — both expressions are equivalent and correct — but it's a correctness landmine: a future edge-case fix (flat delta, `NaN`, a third "neutral" state) applied to one copy and not the other would make a KPI card's sparkline color and its adjacent delta pill visibly disagree about the same trend.
- **Fix sketch**: Extract a pure `isGoodTrend(delta: number, goodDirection: "up" | "down"): boolean` helper into a small shared, framework-free module (e.g. `src/lib/metrics`), and call it from `Sparkline.tsx:116` and `DeltaBadge.tsx:68`. Keep it a plain function with no React/DOM import so it's safe to import from both Sparkline (server-renderable, no `"use client"`) and DeltaBadge (`"use client"`).

## 4. LocaleShowcase demonstrates 8 of the 22 `Formatters` methods, with no link to the source of truth

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/LocaleShowcase.tsx:32-41`
- **Scenario**: The `rows` array hand-lists 8 formatter calls (`fmtCZK`, `fmtCZKCompact`, `fmtInt`, `fmtPct`, `fmtSignedPct`, `fmtMultiple`, `fmtDate`, `fmtRelative`). `src/lib/format.ts`'s `Formatters` interface actually exposes 22 methods — the 14 missing from the showcase include exactly the ones with the trickiest locale-specific branching: `fmtRange` (whose own comment in `format.ts:276-279` explains it hand-composes the cs genitive-month case because `Intl.formatRange` gets it wrong), `fmtWeekdayShort`, `fmtDuration`, `fmtMonthLong`, and the three "signed" variants.
- **Root cause**: `rows` is a plain literal array with no structural tie to the `Formatters` interface, so it was never revisited as `format.ts` grew (its own header comment notes "~199 call sites" across 22 exports today).
- **Impact**: The component's doc comment calls it "Live proof that the formatting layer is locale-parameterised" — but two-thirds of the surface, including the one formatter (`fmtRange`) that `format.ts` flags as needing a hand-built cs-specific path, ships with no visual check on this page. A regression there would ship silently.
- **Fix sketch**: This can't be auto-derived the way `ui.tsx` derives `PILL_TONE_NAMES`/`BUTTON_VARIANT_NAMES` from `Object.keys(...)` — the `fmt*` functions take different argument shapes (some need `digits`, `fmtRange` needs two ISO strings, `fmtRelative` needs `now`, and the `*A11y` pair return `CompactA11y` objects, not strings) so a blind loop would break. Instead, widen `rows` with at least one representative from each currently-missing family — a signed variant, a non-`fmtDate` date variant, `fmtDuration`, and `fmtRange` — so the page actually demonstrates the branch it exists to prove.

## 5. Garbled, copy-pasted header comment ("rethekied")

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/components/motion/Kinetics.tsx:3-4`
- **Scenario**: The file header reads "ported and rethekied from the local-SEO app as part of the consolidation." "Rethekied" isn't a word — almost certainly a typo/garble for "reworked." The exact same phrase, "ported and rethekied from the local-SEO app," also appears verbatim in `src/components/marketing/RankClimbDemo.tsx:3`, indicating it was copy-pasted between the two files ported in the same consolidation pass rather than independently mistyped twice.
- **Root cause**: Leftover artifact from duplicating a file-header comment across two files during a migration, with the typo never caught in either copy.
- **Impact**: Cosmetic only — no behavior effect — but it sits in a primitives file that otherwise documents itself carefully (see the accurate, detailed JSDoc on every export in this same file), so the garbled sentence stands out.
- **Fix sketch**: Change "rethekied" to "reworked" in `Kinetics.tsx:4`. `RankClimbDemo.tsx:3` carries the identical typo but is outside this context's owned file list — worth the same one-word fix for consistency, flagged here since this grep is what surfaced it.
