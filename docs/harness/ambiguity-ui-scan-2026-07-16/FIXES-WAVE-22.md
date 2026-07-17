# Fixes — Wave 22 (shared UI: app shell chrome · design-system primitives · site chrome/auth/demo)

Module-clustered tail wave over the three shared-UI reports. Scope: 2 High +
9 Medium = 11 findings. All 11 implemented; nothing skipped. Earlier waves had
already resolved app-shell #2/#5, design-system #1 and site-chrome #1 (verified
in-tree — Modal/drawer focus-trap via `useFocusTrap`, Sparkline locale via
`trendAriaLabel(locale)`, CommandPalette trap — so untouched here).

## Commits

| # | Commit | Finding(s) | Files |
|---|--------|-----------|-------|
| 1 | `c393535` fix(app-shell): skeleton rail mirrors the 296px rail+panel shell | app-shell #1 (High) | AppShellSkeleton.tsx |
| 2 | `362b21a` fix(app-shell): topbar page title honours the active locale | app-shell #3 (M) | AppTopbar.tsx |
| 3 | `8e32370` fix(app-shell): modal always shows a close button and is always named | app-shell #4 (M) | Modal.tsx |
| 4 | `a0e6be2` fix(motion): ChartReveal keeps children mounted; Tally accepts a formatter | design-system #2 (High) + #5 (M) | Kinetics.tsx, lib/motion.ts, test-unit/tally-text.test.mjs |
| 5 | `b838e9b` fix(design-system): LocaleShowcase drops false tabs ARIA for toggle buttons | design-system #3 (M) | LocaleShowcase.tsx |
| 6 | `d33d3db` fix(charts): Sparkline markers stay round on responsive non-uniform scaling | design-system #4 (M) | Sparkline.tsx |
| 7 | `92c732c` fix(demo): DemoShellSkeleton frame matches DemoShell (296px rail) | site-chrome #2 (M) | DemoShellSkeleton.tsx |
| 8 | `f013439` fix(usage): localize UsageMeter tooltip + Nav home label; revalidate quota | site-chrome #3 (M) + #4 (M) | UsageMeter.tsx, Nav.tsx, lib/i18n/messages.ts |
| 9 | `2d3dee1` fix(demo): demo account sign-out/revoke shown disabled, not dead | site-chrome #5 (M) | AccountSecurity.tsx, DemoModule.tsx |

Two commits bundle a High+Medium / two Mediums because the findings share one
file (Kinetics.tsx for #2/#5; UsageMeter.tsx for site-chrome #3/#4) and staging
is whole-file only. Each finding is cited in the commit body.

## Narratives

- **app-shell #1** — Suspense skeleton was a flat `w-64` (256px) single column while
  the real sidebar is a `w-[296px]` two-level rail+panel; every project entry shifted
  40px on reveal and the doc comment still claimed `w-64`. Rebuilt as a 74px icon
  strip + item panel = 296px; cross-referenced the three width literals
  (AppSidebar `RAIL_WIDTH`, SectionRailNav `w-[74px]`) in a warning comment.
- **app-shell #3** — `useActiveModuleLabel` returned the registry's raw cs `label`
  while the sidebar uses `moduleLabel(module, locale)`; en users saw the heading and
  the active nav item in two languages. Now routes through `moduleLabel` + `useLocale`.
- **app-shell #4** — headerless Modal skipped the whole header row incl. the only X,
  leaving touch users stuck and an unlabelled `role="dialog"`. Extracted a
  `CloseButton`, always rendered (floated top-right when headerless), added an
  `ariaLabel` prop as the accessible name when there's no string title.
- **design-system #2** — `ChartReveal` rendered `inView ? children : null`: charts
  absent from SSR/no-JS, child state lost, section height collapsed on every scroll
  (CLS). Now keeps children always mounted and replays the draw-in by bumping a
  `Fragment key` on re-entry; documented that children must be cheap to remount.
- **design-system #5** — `Tally` formatted with bare `toFixed`/round, bypassing the
  locale chokepoint. Added a `format?: (n)=>string` prop via a new pure
  `tallyText(value,{format,decimals})` in lib/motion.ts (4 unit tests); default
  behaviour unchanged.
- **design-system #3** — LocaleShowcase used `role="tablist"/"tab"` with none of the
  WAI-ARIA tabs contract. Replaced with a `role="group"` of `aria-pressed` toggle
  buttons (the two-state switch it actually is), pill styling kept.
- **design-system #4** — dot/peak/trough `<circle>` markers smeared to ellipses under
  `preserveAspectRatio="none"`. Each is now a zero-length round-capped
  `non-scaling-stroke` `<path>` (`Dot` helper) → fixed screen-pixel diameter on any
  container aspect ratio. Radii preserved (peak/trough r+0.75; main dot ring+core).
- **site-chrome #2** — DemoShellSkeleton drew `w-64` vs DemoShell's `w-[296px]`. Rebuilt
  to the 74px strip + panel and mirrored the topbar's `justify-between` actions row.
- **site-chrome #3** — UsageMeter tooltip (the only gloss on "AI 3/10") was hardcoded
  Czech; Nav home-link aria-label was a hardcoded cs string. Tooltip → local `T`
  table via `useT`; aria-label → new `nav.home` message key (cs/en).
- **site-chrome #4** — UsageMeter fetched once on auth and never revalidated. Now
  refetches on route change (`usePathname` dep), tab focus/`visibilitychange`, and a
  `usage:changed` window event that AI-eval call sites can dispatch.
- **site-chrome #5** — demo Account sign-out/revoke were live buttons wired to an empty
  `"use server"` no-op (silent dead click on a security surface). Added a `demo` flag
  to AccountSecurity rendering them disabled with an explanatory tooltip + note.

## Verification

- `npx tsc --noEmit` — clean (0 errors).
- `npm run test:unit` — **1764/1764 pass** (baseline 1760 + 4 new `tally-text` tests),
  0 fail. No flakes observed.
- New tests: `test-unit/tally-text.test.mjs` (4) — the only pure helper extractable in
  this wave; the rest are components, verified by tsc + careful read.
- Pre-commit hooks (eslint --fix, tsc, LLM contract eval) green on every commit. One
  transient `tsc --noEmit [SIGKILL]` in a hook run (resource kill, not a type error;
  standalone tsc passed) — retried, passed.
- `git status` shows the four untracked `uat/driver/*.mjs` still untracked, never staged.

## Behaviour / visual changes needing sign-off

- **Skeleton silhouettes** (app-shell #1, site-chrome #2): auth + demo Suspense
  fallbacks now render a two-level 296px rail instead of a 256px column — intended
  (removes the 40px CLS), but a visible change to the loading frame.
- **Topbar heading** (app-shell #3): on `en` locale the app topbar title now shows the
  English module name (was Czech). Correct, but a user-visible copy change.
- **Modal close affordance** (app-shell #4): headerless modals now show a floating X;
  new optional `ariaLabel` prop available for callers.
- **ChartReveal** (design-system #2): charts now present in SSR/no-JS HTML and stay
  mounted; the draw-in still replays on scroll-in (via key remount), so any child
  holding cross-scroll state should move it to a stable parent.
- **LocaleShowcase** (design-system #3): announces as pressed toggle buttons, no longer
  "tab 1 of 2".
- **UsageMeter** (site-chrome #3/#4): tooltip localized; chip now revalidates. The
  `usage:changed` event is defined but **not yet dispatched** by AI-eval call sites —
  a follow-up can wire those emitters for instant in-session freshness (focus/route
  refetch works today).
- **Demo Account** (site-chrome #5): sign-out / "sign out everywhere" are now disabled
  with a note in the public demo instead of clickable-but-dead.

## Patterns

- **Whole-file staging forces finding-bundling** when two findings edit one shared file
  (Kinetics, UsageMeter) — cite each finding in the body; don't split a file across
  commits without `-p`.
- **`react-hooks/set-state-in-effect`** flags a synchronous-looking call to a
  setState-containing callback in an effect body; wrapping in an async IIFE
  (`void (async () => { await refresh(); })()`) — the codebase's existing pattern —
  satisfies it.
- **SVG dots that must stay circular under `preserveAspectRatio="none"`**: a zero-length
  round-capped `non-scaling-stroke` path, not a `<circle>` (radius scales; stroke
  doesn't).
- **Skeleton↔shell width drift** is a recurring shape here (three separate skeletons vs
  a 296px rail); documenting the shared literal in a warning comment is the cheap guard.
