---
name: Adamant
description: An obsidian monument for ad intelligence — onyx surfaces, a faceted lattice, and one teal that only speaks when it means something.
colors:
  canvas: "#f4f7f9"
  surface: "#ffffff"
  ink: "#0d1a24"
  muted: "#56697a"
  line: "#e4eaef"
  brand-50: "#ecfdfb"
  brand-100: "#d2faf5"
  brand-200: "#a6f1ea"
  brand-300: "#6ee3da"
  brand-400: "#2dd4ce"
  brand-500: "#14b8b1"
  brand-600: "#0e9c97"
  brand-700: "#11807c"
  brand-800: "#136663"
  brand-900: "#134f4d"
  brand-accent: "#117d79"
  navy-50: "#eef3f8"
  navy-100: "#d6e1ec"
  navy-200: "#adc2d6"
  navy-300: "#7693ad"
  navy-400: "#3f5a74"
  navy-500: "#1f3a54"
  navy-600: "#15324b"
  navy-700: "#0f2438"
  navy-800: "#0b1b2b"
  navy-900: "#081521"
  onyx: "#0d1f31"
  onyx-soft: "#13293f"
  onyx-line: "#28415a"
  onyx-ink: "#eaf1f8"
  onyx-muted: "#b3c3d3"
  coral-400: "#ff8a5c"
  coral-500: "#fb7141"
  coral-600: "#ea5a2a"
  positive: "#128f6f"
  negative: "#d4503e"
  positive-soft: "#e7f4ef"
  negative-soft: "#fbeae7"
  coral-soft: "#fff0e9"
  serp-link: "#1a4ba0"
  serp-url: "#3a7d3a"
typography:
  display:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 2rem
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.75rem
    letterSpacing: "normal"
  body:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5rem
    letterSpacing: "normal"
  label:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25rem
    letterSpacing: "0.16em"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25rem
    letterSpacing: "normal"
rounded:
  card: "1rem"
  pill: "999px"
  control: "0.75rem"
  focus: "4px"
spacing:
  gutter: "1rem"
  gutter-sm: "1.5rem"
  card-pad: "1.25rem"
  section-gap: "1.5rem"
  page-y: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.brand-600}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brand-700}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.navy-700}"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1.25rem"
  button-secondary-hover:
    textColor: "{colors.brand-accent}"
  button-onyx:
    backgroundColor: "{colors.onyx}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1.25rem"
  button-ghost:
    textColor: "{colors.navy-700}"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1.25rem"
  button-ghost-hover:
    textColor: "{colors.brand-accent}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  pill-brand:
    backgroundColor: "{colors.brand-50}"
    textColor: "{colors.brand-800}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.7rem"
  pill-positive:
    backgroundColor: "{colors.positive-soft}"
    textColor: "{colors.positive}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.7rem"
  pill-negative:
    backgroundColor: "{colors.negative-soft}"
    textColor: "{colors.negative}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.7rem"
  modal-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
    width: "42rem"
  eyebrow:
    textColor: "{colors.brand-accent}"
    typography: "{typography.label}"
---

# Design System: Adamant

## Overview

**Creative North Star: "The Obsidian Monument"**

Adamant is an ad-intelligence workspace that reports numbers people act money on, so the
interface behaves like a thing carved rather than a thing assembled. The world is
**Monolith**: a dark obsidian mass (the hero key visual at `/brand/hero-monolith.png`)
sitting on a cool, near-white analytic canvas, with a faint crystal lattice — two
crossing 60° hairlines — running underneath every product page. Nothing about it is
playful. It is quiet, dense, and slightly severe, and it earns attention with one
saturated teal rather than with decoration.

The system runs on two structural materials that never trade places. **Onyx** is the
monument: deep navy-black surfaces used for the hero, the footer, CTA blocks, code
panels, logo tiles, and modal scrims. Onyx is *stable* — its tokens are identical in
light and dark, so a dark brand surface stays a dark brand surface instead of inverting
into a pale rectangle when the theme flips. Everything else is a **flipping token**:
canvas, surface, ink, muted, line, and both the brand and navy ramps carry a parallel
dark set, so a `bg-surface` card is white on the light canvas and `#121a24` on the dark
one without a single component knowing which theme it is in.

Density is analytic, not airy. Cards sit close, tables are wide, numbers are tabular,
and content is bounded at `max-w-6xl` so a dashboard reads as one instrument panel
rather than a scroll. Motion is present but subordinate: sections ease up in sequence
as a module assembles, charts draw themselves in on arrival, and every one of those
animations is neutralized wholesale under `prefers-reduced-motion` and in print. The
confirmed anti-reference is the generic SaaS gradient dashboard — no purple-to-blue
washes, no glassmorphism, no illustrated mascots.

**Key Characteristics:**
- Onyx monument surfaces against a cool analytic canvas
- One teal, used sparingly, carrying every accent and action
- A faceted 60° lattice as the site-wide ambient texture
- Fully token-driven light *and* dark from one component tree
- Flat-by-default cards; hairline borders do the separating
- Tabular figures wherever numbers stack in columns
- Motion that assembles, then gets out of the way

## Colors

A cool analytic canvas, one teal that carries brand and action, a navy ramp that carries
structure and text, and coral reserved for attention — plus a stable onyx family that
refuses to invert.

### Primary
- **Adamant Teal** (`brand-500`): The brand's single voice. The saturated CTA fill
  (`brand-600` at rest, `brand-700` on hover), the sparkline stroke, the focus ring,
  and the hero's primary button. It darkens rather than lightens on hover — the button
  presses *into* the monument.
- **Accent Teal** (`brand-accent`): A dedicated step for accent *text* — eyebrows,
  inline prose links, glyphs on tinted chips, and the proof-band figures. It is split
  out of the ramp deliberately so dark mode can lift accent text to `#5fe3da` without
  disturbing the saturated button hover. Never use a ramp step for accent text; that is
  what this token exists for.

### Secondary
- **Structural Navy** (`navy-500`–`navy-900`): Headings, secondary button text, chart
  strokes, chips, and scrollbar thumbs. In dark mode the high steps *become light* —
  `navy-800` is near-white text on dark — so navy is a **text** ramp at the top and a
  **surface** ramp at the bottom. Treat the two halves as different materials.
- **Onyx** (`onyx`, `onyx-soft`, `onyx-line`, `onyx-ink`, `onyx-muted`): The monument
  itself. Hero, footer, dark CTA blocks, code panels, numbered avatars, logo tiles, and
  the modal backdrop (`onyx` at 40% with a `backdrop-blur-sm`). Identical in both themes.

### Tertiary
- **Attention Coral** (`coral-500`): Rare. Reserved for a callout or badge that must
  break out of the teal/navy duet. Also not overridden in dark — it reads correctly as-is.
- **Semantic Green / Red** (`positive`, `negative`): Trend direction only — delta badges,
  auto-colored sparklines, profit and loss. Both lift in dark mode for contrast.
- **SERP Blue / Green** (`serp-link`, `serp-url`): Only inside the search-result preview,
  where the point is to mimic Google's own link colors. They flip to Google's dark-mode
  pair in dark. Never borrow them for real product links.

### Neutral
- **Analytic Canvas** (`canvas`): The page ground behind every surface.
- **Card Surface** (`surface`): Cards, panels, modals, table bodies.
- **Ink** (`ink`) / **Muted** (`muted`): Body text and its secondary tier.
- **Hairline** (`line`): The universal border. Set as the global `border-color` on `*`,
  so any element that gains a border gets the right one without asking.
- **Soft Tints** (`positive-soft`, `negative-soft`, `coral-soft`): Pill, badge, and
  callout backgrounds. Tokenized precisely so they flip to dark tints instead of glowing
  as pale patches on the dark canvas.

### Named Rules

**The Token-Only Rule.** Every color in a component comes from a `@theme` token. Raw hex
in markup — `bg-[#0b1b2b]`, inline `style={{ color: "#14b8b1" }}` — is forbidden without
exception, and the codebase currently has zero arbitrary hex color utilities. A color
that isn't a token cannot flip themes, so it is a light-mode-only bug waiting for a
dark-mode user.

**The Stable Onyx Rule.** Onyx tokens are the only colors guaranteed identical in light
and dark. If a surface must stay dark in *both* themes, it is onyx — not `navy-800`, not
`bg-black`. Conversely, never use onyx for a surface that should follow the theme.

**The Accent-Text Rule.** Accent text uses `brand-accent`. Buttons and fills use the
`brand-*` ramp. Mixing them is the specific defect the `brand-accent` split was created
to prevent: a ramp step chosen for a saturated fill becomes unreadable when dark mode
lightens it, or fails to lighten at all.

**The Half-Ramp Rule.** In the navy ramp, high steps (`700`–`800`) are *text* and low
steps (`50`–`200`) are *chips and borders*. Because dark mode inverts the ramp,
`bg-navy-800` is a near-white block in dark. Use `bg-onyx` for dark blocks and reserve
`text-navy-800` for headings.

## Typography

**Display / Body Font:** Geist Sans (with `ui-sans-serif`, `system-ui`, `sans-serif`)
**Label / Mono Font:** Geist Mono (with `ui-monospace`, `monospace`)

**Character:** One neutral grotesque doing all the work. Geist is dense, technical, and
unhurried; it sets tables without fussing and sets a hero headline without pretending to
be a display face. The system gets its personality from color, weight, and tracking
rather than from a second typeface. Mono appears only where a value is literally a
value: token names, code panels, spec labels.

Two base steps are deliberately enlarged over Tailwind's defaults for legibility across
a data-dense app: `text-xs` is 14px (not 12) and `text-sm` is 16px (not 14).
`text-base` and above are untouched.

### Hierarchy
- **Display** (600, `text-4xl` → `sm:text-5xl` → `lg:text-6xl`, line-height 1.05–1.08,
  `tracking-tight`): Hero headlines and page H1s only. One per screen.
- **Headline** (600, `text-2xl` → `sm:text-3xl`, `tracking-tight`): Section and module
  titles. The module page header uses `text-2xl` → `sm:text-[28px]`.
- **Title** (600, `text-lg`, normal tracking): Card headings and dialog titles
  (`text-base` in modal headers).
- **Body** (400, `text-base` / 1rem, `leading-relaxed` for prose): Paragraphs and
  descriptions, bounded around `max-w-2xl` so a line never runs the full container.
- **Label** (600, `text-xs` / 14px, `uppercase`, `tracking-[0.14em]`–`[0.18em]`):
  Eyebrows, kickers, and card meta. The `<Eyebrow>` primitive pairs it with a 24px
  brand hairline and `text-brand-accent`.
- **Secondary** (400, `text-sm` / 16px, `text-muted`): Captions, helper text, and the
  spec lines under a component.

### Named Rules

**The Tabular Rule.** Any number that stacks in a column — KPI values, table cells,
currency, deltas — carries `.tnum` (`font-variant-numeric: tabular-nums`). Digits must
not dance when a value updates.

**The One Display Rule.** A screen gets exactly one display-scale heading. Everything
below it steps down to headline. A second display heading reads as two pages spliced
together.

**The Eyebrow-Before-Heading Rule.** Section headings are introduced by an `<Eyebrow>`,
never by a colored heading. The eyebrow carries the accent so the heading can stay navy.

## Layout

A single content spine. `<Container>` centers content at `max-w-6xl` (`max-w-5xl` for the
`narrow` variant) with a `px-4` gutter that opens to `px-6` at `sm`. Module pages repeat
the same frame directly: `mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10`. There is no
multi-column page grid — depth comes from stacking sections, not from splitting the page.

The authed product uses a two-part shell: a fixed left rail (`AppSidebar`) beside a
`min-w-0 flex-1` content column topped by a slim `AppTopbar`, all on `bg-canvas`. The
`min-w-0` matters — it is what lets wide tables scroll inside the column instead of
pushing the page.

Vertical rhythm is coarse and consistent: `space-y-6` between sections inside a module
(`space-y-8` for the widest ones), `mb-7` under a module header with a `border-b
border-line pb-6` rule closing it, and `mt-2`/`mt-3`/`mt-5` for the tight
label → heading → paragraph cluster. Grids default to `gap-3` for swatch and icon walls,
`gap-4`–`gap-6` for card grids.

Responsive behavior is Tailwind's default ladder, used lightly: one column on mobile,
`sm:grid-cols-2`, `lg:grid-cols-3` or `-4`. Sections are the responsive unit; components
rarely reflow internally. Horizontally scrollable control strips hide their scrollbar via
`.no-scrollbar` on mobile; the app side rails use `.scrollbar-slim` (a 2px themed rail),
and everything else gets the global 8px navy thumb on a transparent track.

**The One Spine Rule.** Content lives at `max-w-6xl` with a `px-4 sm:px-6` gutter. A
surface that wants to be wider must be full-bleed *background* with the content still on
the spine — that is exactly how the hero puts the monolith key visual edge-to-edge while
the headline stays in the container.

## Elevation & Depth

The system is **near-flat with tonal layering**. Depth comes from three moves in order of
preference: a tonal step (`canvas` → `surface`), a hairline (`border-line`), and only
then a shadow. There are exactly two shadow tokens, and both are diffuse and low-contrast
in light mode; dark mode deepens them so a card still separates from the near-black canvas.

The one genuinely dimensional gesture in the whole system is the modal scrim: `onyx` at
40% opacity with `backdrop-blur-sm`, which reads as the monument's shadow falling across
the page.

### Shadow Vocabulary
- **Card** (`--shadow-card`: `0 1px 2px rgba(13,26,36,.04), 0 8px 24px -12px rgba(13,26,36,.12)`;
  in dark `0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6)`): The resting
  elevation of every card and panel. Ambient, not directional.
- **Pop** (`--shadow-pop`: `0 12px 40px -12px rgba(13,26,36,.25)`; in dark
  `0 12px 40px -12px rgba(0,0,0,.7)`): Overlays only — modals, command palette, popovers.
  Its job is to say "this floats above the page", not "this is a button".

### Named Rules

**The Border-Before-Shadow Rule.** Separation is a hairline first. Reach for
`shadow-card` only when a surface must lift off the canvas, and for `shadow-pop` only
when it genuinely floats above the page. Stacking both is a smudge.

**The Flat-In-Print Rule.** Cards drop their shadow in print and gain `break-inside:
avoid`; header, footer, and anything marked `.no-print` are removed. The client report
is a first-class output, not a screenshot of a screen.

## Shapes

Two corner radii and almost nothing else. **Cards** are `1rem` (`rounded-card`) — generous
enough to read as a slab rather than a box. **Anything interactive or status-bearing** is
a full pill (`999px`, `rounded-pill`): every button, every chip, every tag, every nav
anchor. The result is a page of soft slabs carrying rounded controls, which is the whole
form language.

Below those, only small utilitarian radii appear: `rounded-xl` (`0.75rem`) on inner
wells and control containers, `rounded-full` on icon buttons and dots, and a `4px` radius
on the focus ring so it hugs a control without looking rectangular.

Borders are always 1px and always `--color-line`, which is set globally on `*` so the
correct hairline is the default rather than an opt-in. Rings (`ring-1 ring-onyx-line`)
appear on onyx surfaces where a `border` would clash with a rounded image mask.

The signature geometry is **the facet**: `.bg-facets` lays two repeating linear gradients
at `+60°` and `-60°`, one 1px line every 30px, in `var(--pattern-line)` — a crystal
lattice echoing the brand mark. It is applied site-wide on `<main>`, so product pages
share one ambient texture. It is theme-adaptive: faint dark lines on the light canvas
(`rgba(11,27,43,.03)`), faint light lines on dark (`rgba(168,220,255,.045)`). A second,
older texture `.bg-dotgrid` (a 1px radial dot on a 22px grid) sits behind hero backdrops.

**The One Texture Rule.** A surface carries at most one pattern. `.bg-facets` is
site-wide ambient; `.bg-dotgrid` is a hero-local backdrop. Never layer them, and never
raise the pattern opacity to make it visible — it is meant to be felt, not seen.

## Components

### Buttons
The shared `<Button>` primitive (`src/components/ui.tsx`) is the only sanctioned button;
it replaced ~185 hand-rolled `<button>`/`<a>` elements and reproduces their four patterns
exactly. Passing `href` renders an `<a>` with identical styling; `buttonClass()` is
exported so a Next `<Link>` can wear the same skin.

- **Shape:** Full pill (`rounded-pill`, 999px), always.
- **Primary:** Saturated teal fill on white text (`bg-brand-600` → `hover:bg-brand-700`),
  `font-semibold`. The hover *darkens*.
- **Secondary:** Hairline outline on navy text (`border-line`, `text-navy-700`); hover
  shifts the border to `brand-300` and the text to `brand-accent` — the border warms
  before the fill ever changes.
- **Onyx:** The dark CTA (`bg-onyx`, white text) used in footers, hero panels, and panel
  headers. It is the monument as an affordance.
- **Ghost:** Text-only (`text-navy-700` → `hover:text-brand-accent`), for tertiary
  actions inside dense toolbars.
- **Sizes:** `sm` (`px-4 py-2`), `md` (`px-5 py-2.5`), `lg` (`px-5 py-3`) — all at
  `text-sm` (16px). Size changes the padding, never the type scale.
- **States:** `transition-colors` only — buttons do not move on hover. Disabled is
  `opacity-50` plus `cursor-not-allowed`. Type defaults to `button` so a control never
  submits a form by accident.

### Chips (Pill)
- **Style:** `.pill` — inline-flex, `rounded-pill`, 12px/600 weight, `0.35rem 0.7rem`
  padding, `gap: 0.4rem` for an optional leading glyph.
- **Tones:** Six, enumerated from the component itself so the design-system page can
  never fall out of sync — `brand` (brand-50 / brand-800), `navy` (navy-50 / navy-700),
  `positive` and `negative` (soft tint / semantic ink), `neutral` (navy-50 / muted),
  `coral` (coral-soft / coral-600). Each is a tint background under a saturated
  same-family text color; a pill never uses a saturated fill.
- **Bare labels:** `TONE_TEXT` exports the text-color half of each tone, so a stat label
  can take the semantic color without the chip background and stay in lock-step with the
  chip if a tone is ever rebranded.

### Cards / Containers
- **Corner Style:** `rounded-card` (1rem).
- **Background:** `--color-surface` (white / `#121a24` in dark).
- **Border:** 1px `--color-line`, always present.
- **Shadow Strategy:** `--shadow-card` at rest; no hover elevation change. Interactive
  cards signal on the *border* (`hover:border-brand-300`) and text color, not by lifting.
- **Internal Padding:** `p-5` is the default; `p-6` for showcase and feature cards,
  `px-3 py-4` for list rows inside a divided card (`divide-y divide-line`).

### Inputs / Fields
- **Style:** Surface fill, 1px `border-line`, `rounded-xl`, `text-sm` (16px — large
  enough that iOS never zooms on focus).
- **Focus:** The global ring — `outline: 2px solid var(--color-brand-500)` with
  `outline-offset: 2px` and a 4px radius, applied on `:focus-visible` across the whole
  app. Individual components must not replace it.
- **Selection:** `::selection` is `brand-200` on `navy-800`, not the browser default.

### Navigation
- **App shell:** Fixed left rail plus a slim topbar over a scrollable content column.
- **Anchors and tabs:** Pill-shaped, `border-line` on `bg-surface`, `text-sm font-medium
  text-navy-700`; hover shifts the border to `brand-300` and the label to `brand-accent`.
  Active state is the same pair held on.
- **Mobile:** Control strips scroll horizontally with `.no-scrollbar`; the rail collapses
  rather than reflowing into the content column.

### Modal
The single sanctioned overlay (`src/components/app/Modal.tsx`); it powers the app's
two-layer table → detail pattern.
- **Panel:** `rounded-card`, `border-line`, `bg-surface`, `shadow-pop`, `max-h-[88vh]`
  with the body scrolling internally so a tall workspace never pushes the page. Sizes are
  `md` (`max-w-2xl`), `lg` (`max-w-4xl`), `full` (`max-w-5xl`).
- **Backdrop:** `bg-onyx/40` with `backdrop-blur-sm`, click-to-close.
- **Entrance:** `.animate-drop` — 8px down-to-place over 0.22s on the house curve.
- **Behavior:** Portals to `<body>` (escaping any `overflow-hidden` ancestor), traps
  focus, closes on Escape, locks body scroll, and restores focus to the trigger. A
  headerless dialog floats its dismiss control in the corner so touch users always have
  one.

### Sparkline
The system's signature data mark: a pure server-rendered SVG with no client JS, used in
the hero, every KPI card, the campaign table, and the app modules. A soft area fill under
a 1px stroke, an optional last-point dot ("you are here"), a dashed tail for the
forecast half of a series, and an `autoColor` mode that picks `positive`/`negative` from
the first→last delta while honoring which direction is *good* (a falling cost line is
green). Colors are passed as `var(--color-…)` strings, never literals, so charts theme
along with everything else.

### Motion
Motion is a system, not a per-component decision. One curve — `cubic-bezier(0.16, 1,
0.3, 1)`, exported to JS as `easeAdamant` — governs both the CSS keyframes in
`globals.css` and the framer-motion primitives in `components/motion/Kinetics.tsx`, so
CSS- and JS-driven motion read as one hand.

- **Entrances:** `.animate-fade-up` (0.5s, 10px lift), `.animate-fade-in` (0.4s),
  `.animate-drop` (0.22s, for overlays).
- **Section stagger:** `.stagger` on a module's section stack eases each *direct child*
  up in sequence at 65ms steps, plateauing at 390ms from the 7th child so a long stack
  doesn't trail past the fold. Pure CSS: no JS, no hydration, no wrapper markup, and it
  works on server-rendered children.
- **Chart draw-ins:** `.chart-draw` and `.gauge-sweep` (1.4s) and `.bar-grow` (1s).
  Paths use `pathLength="1"` so a single dash draws without measuring geometry.
  `<ChartReveal>` remounts its child on scroll re-entry so the draw replays on arrival.
- **Marketing primitives:** `<Kinetic>` (fade + 18px lift on in-view), `<Tally>`
  (count-up routed through the locale formatter so animated numbers match static ones),
  `<Marquee>` (infinite ticker).
- **Loading:** `.animate-loading-reveal` holds opacity 0 for the first 40% of its 0.5s
  run, so a fast navigation swaps in the real page before a spinner ever paints.
- **The Monolith family** (`.mono-*`) — five named marketing techniques, four of them
  scroll-driven and hydrating nothing: `.mono-plane-{far,mid,near}` (layered parallax on
  a `scroll()` timeline), `.mono-reveal-line` (a masked line rising on arrival),
  `.mono-prism` + `.mono-panel` (a six-face CSS 3D column turned by scroll position),
  `.mono-seq` (children arriving one at a time rather than together) and `.mono-stack`
  (`position: sticky` slabs that pin and are slid over, `sm` and up only). `.mono-track`
  / `.mono-mass` / `.mono-glow` are the one exception that needs JS — a pointer has no
  CSS timeline. Assigned one technique per band so only one thing ever moves; see
  `docs/ship/2026-09-08-landing-motion-rebuild.md`.
- **The three research landings** (`/lp/*`, `docs/design/nextgen-landing.md`) each add one
  family: `.story-film[data-scene]` (a pinned stage whose pieces move per scene, all
  transitions, one drawn line), `.exhibit-noise` / `.exhibit-dot` (a gallery's material, no
  motion of its own), and `.sb-key[data-lit]` / `.sb-light` (a switchboard that re-lights by
  index). Transitions, not timelines, so the kill switch already reaches them; the story's
  `.story-line` draw is the one animation and is killed by name.

**The Reduced-Motion Kill Switch.** A single global block collapses every animation and
transition to 0.01ms and disables smooth scrolling; the infinite loading pulse is stopped
outright and pinned at full opacity. **A scroll- or view-timeline animation ignores
`animation-duration`, so that global block does not reach it** — `.reveal-on-scroll` and
every `.mono-*` class are switched off BY NAME in both the reduced-motion and print
blocks. Adding a timeline-driven class without adding it to both lists ships a page that
still animates for a reader who asked it not to, and `.mono-reveal-line` additionally
needs `transform: none` there: its start state is translated behind an overflow mask, so
stopping the animation without resetting the transform hides the headline outright. Every motion primitive additionally short-circuits
to a static render via `useReducedMotion()`. No content is ever hidden by a motion
preference — `both` fill means an un-run animation would otherwise leave a section at
opacity 0, which is why the kill switch settles to the *end* state, never the start.

## Do's and Don'ts

### Do:
- **Do** take every color from a `@theme` token so it flips theme for free. The codebase
  currently has zero arbitrary hex color utilities — keep it there.
- **Do** use `onyx-*` for any surface that must stay dark in both themes (hero, footer,
  CTA blocks, code panels, modal scrim). It is the only stable color family.
- **Do** use `brand-accent` for accent *text* — eyebrows, inline links, glyphs, proof
  figures — and the `brand-*` ramp for fills.
- **Do** reach for `<Button>`, `<Pill>`, `<Container>`, `<Eyebrow>`, `Modal`, and
  `Sparkline` before writing a new one. Each exists because the pattern was hand-rolled
  dozens of times first, and the design-system page enumerates their variants straight
  from the source.
- **Do** add `stagger` to a module's top-level section stack so the page assembles
  top-to-bottom, and put `.tnum` on every column of numbers.
- **Do** separate with a hairline (`border-line`) before reaching for a shadow.
- **Do** keep content on the `max-w-6xl` spine with a `px-4 sm:px-6` gutter; go
  full-bleed with background only.
- **Do** verify a new surface in *both* themes before calling it done — the dark set is a
  hand-maintained mirror, not a filter.

### Don't:
- **Don't** write raw hex, `rgb()`, or arbitrary color utilities (`bg-[#0b1b2b]`) in
  markup. A non-token color is a light-mode-only bug.
- **Don't** use `bg-navy-800` (or any high navy step) as a dark background. Dark mode
  inverts the navy ramp, so it becomes a near-white block. Use `bg-onyx`.
- **Don't** use a `brand-*` ramp step for accent text, or `brand-accent` for a button
  fill. The split exists precisely to keep those two jobs apart.
- **Don't** borrow `serp-link` / `serp-url` for product links — they exist only to
  imitate Google inside the SERP preview.
- **Don't** introduce a third radius. Slabs are `rounded-card` (1rem); interactive and
  status elements are `rounded-pill`. Everything else is a well or an icon button.
- **Don't** replace the global focus ring with a per-component treatment, and don't
  remove `:focus-visible` outlines to tidy a design.
- **Don't** animate a button's position or scale on hover. Buttons change color; cards
  change border. Nothing lifts on hover.
- **Don't** layer `.bg-facets` and `.bg-dotgrid`, and don't raise the pattern opacity to
  make the lattice legible. It is ambient by design.
- **Don't** ship a scroll- or view-timeline animation without adding its class to the
  reduced-motion AND print kill lists by name. The universal duration override cannot
  neutralise a timeline, and a `both` fill will leave the content invisible.
- **Don't** ship an entrance animation without confirming the global reduced-motion block
  settles it to its *end* state — an `animation-fill-mode: both` entrance that isn't
  neutralized leaves content invisible.
- **Don't** add a second typeface. Geist Sans and Geist Mono are the whole set.
