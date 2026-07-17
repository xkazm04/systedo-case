# Fixes — Wave 7 (accessibility & focus management)

Theme: modals without focus traps, fake ARIA patterns, keyboard-inaccessible
controls, and critical info trapped in hover `title` tooltips. All changes are
React component / a11y primitive work; verified via `tsc` + the node:test suite,
with pure helpers extracted and unit-tested where possible.

## Commits

| Commit | Finding(s) | Scope |
| --- | --- | --- |
| `c21b1fd` | app-shell-chrome #2, site-chrome-auth-demo #1 | shared `useFocusTrap` hook + wire into Modal & CommandPalette |
| `7e4b219` | app-shell-chrome #5 | mobile drawer: Escape, focus trap, scroll lock, width unify |
| `6460290` | design-system-primitives #1 | Sparkline locale-aware aria-label |
| `00352c9` | performance-dashboard #2 | Segmented: honest `aria-pressed` buttons, not fake tabs |
| `7752a39` | seo-keyword-content-ui #1 | keyboard/AT-activatable table rows |
| `be8309c` | performance-dashboard #1 | surface tooltip-only dashboard honesty text to touch/AT |

6 fix commits (this doc = 7th). All 7 assigned findings fixed (the 7th assigned
item, app-shell #5 mobile drawer, was quick and folded in via the shared hook).

## Narratives

**Focus trap (shared primitive).** Both the Modal and the ⌘K CommandPalette
declared `aria-modal="true"` but trapped nothing: Tab walked out into the
scroll-locked page behind the backdrop, and on close focus was dropped on
`<body>` instead of the opener. Added `src/lib/a11y/focusTrap.ts` (pure
`focusTrapWrapIndex` tab-math + `FOCUSABLE_SELECTOR`, unit-tested) and a
dependency-free `useFocusTrap` hook (`src/components/hooks/useFocusTrap.ts`) that
remembers the active element, moves focus in (optional `initialFocusRef`), wraps
Tab/Shift+Tab, and restores focus on teardown. Wired into Modal, CommandPalette
(input as initial focus — the option buttons are `tabIndex=-1`, so Tab re-wraps
to the input), and the mobile drawer.

**Mobile drawer (app-shell #5).** Hand-rolled JSX that skipped every overlay
behavior the other overlays centralize. Added an Escape listener + body-scroll
lock gated on `mobileOpen`, reused `useFocusTrap`, gave the drawer `role="dialog"`
semantics, and unified the desktop rail (296px) and drawer (was 300px) behind one
`RAIL_WIDTH` constant.

**Sparkline locale (DSP #1).** The prop doc claimed "dependency-free / no locale",
yet the fallback aria-label hard-coded a Czech sentence and ran the percent
through the cs-bound top-level `fmtSignedPct` — so en screen readers heard Czech.
Added an optional `locale` prop (defaults to `cs`, so no caller regresses) routing
phrasing through the new pure `trendAriaLabel(locale, …)` (unit-tested) and the
percent through `createFormatters(locale)`.

**Segmented (perf #2).** Announced `role="tablist"`/`tab`/`aria-selected` —
promising the APG tabs contract (arrow keys, single Tab stop, tabpanels) that was
never implemented. It's a value selector, so switched to `role="group"` +
per-option `aria-pressed` toggle buttons (the app's existing idiom — normal Tab
stops, no false promise). Disabled `yoy` now uses `aria-disabled` (stays
focusable) with its reason wired via `aria-describedby` to a visually-hidden node.

**Table rows (seo #1).** The Topic-clusters, Decaying-content and Organic-channels
tables used bare `<tr onClick>` as the ONLY path to their modals. Added a shared
`interactiveRowProps` helper (pure Enter/Space logic in
`src/lib/a11y/rowActivation.ts`, unit-tested) giving each row button semantics, a
Tab stop, an aria-label, an Enter/Space handler and a focus-visible ring.

**Dashboard tooltips (perf #1).** Load-bearing honesty text (DeltaBadge
significance suffix, GoalPacing plan/goal markers + CI band + required-pace tile,
PnoGauge goal marker, AlertsPanel impact/gained, ChannelTable revenue-delta hint)
lived only in native `title` — invisible on touch, unreliable for AT. Gave each a
reliable AT channel while keeping `title` as a bonus: decorative gauge markers →
`role="img"` + `aria-label`; DeltaBadge pills → `aria-label` with the full read;
value spans / delta-column header / required-pace tile → visually-hidden
explanation siblings (preserving the visible number for sighted users).

## New pure modules + tests

| Module | Test | Cases |
| --- | --- | --- |
| `src/lib/a11y/focusTrap.ts` | `test-unit/focus-trap.test.mjs` | 7 |
| `src/components/charts/trendLabel.ts` | `test-unit/trend-label.test.mjs` | 2 |
| `src/lib/a11y/rowActivation.ts` | `test-unit/row-activation.test.mjs` | 3 |

Also new: `src/components/hooks/useFocusTrap.ts` (React hook; effect-driven, no
direct unit test — its logic is the tested pure helper).

## Verification

- `npx tsc --noEmit`: **0 errors** (checked before every commit; lint-staged
  re-runs eslint + tsc + the LLM contract gate on each commit — all green).
- `npm run test:unit`: **1622/1622 pass** (baseline 1610 + 12 new). 0 regressions.

## Patterns

- **One primitive, three overlays.** Modal, CommandPalette and the mobile drawer
  now share `useFocusTrap` — the tab-math is pure and tested once.
- **Honest roles over pretty roles.** `aria-pressed` toggle buttons (already the
  house idiom) beat a `role="tab"` that lies about keyboard behavior.
- **Keep `title`, add a real carrier.** For touch/AT the fix is `aria-label` (for
  graphics), `role="img"` (for decorative markers), or a `sr-only` sibling (to
  keep a visible number intact) — `title` stays only as a bonus.

## Behavior / visual changes worth noting

- Focus now visibly returns to the trigger when any Modal / ⌘K palette / mobile
  drawer closes (previously focus was lost).
- Mobile drawer: Escape now closes it; background no longer scrolls under it;
  drawer is 4px narrower (300 → 296px, matching the desktop rail).
- Segmented: the disabled `yoy` option is now keyboard-focusable (so its reason is
  announced); options are individual Tab stops (they always were — no roving
  tabindex was ever implemented — so this is honest, not a new cost).
- SEO tables: cluster/decay/channel rows now show a focus ring and are Tab stops.
- Dashboard: no visible change for sighted mouse users; screen-reader and (for the
  `sr-only`/`aria-label` carriers) touch users now receive the honesty text. The
  GoalPacing month-history `<li>` already carried an `sr-only` mirror, so it was
  left as-is.
