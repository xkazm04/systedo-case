# ADR-0014 — One dark-only brand, Optic Bench, carried by semantic token roles and a shared kit

## Status

Accepted (2026-10-13, by the owner). The owner chose the brand by blind contest. The winner was
"Optic Bench", entry A/3 in both rounds: `adamant-landing` for the landing page
and `adamant-landing-r2` for the same brand applied to the Výkon page. The owner
also decided the product is dark-only. Plan: `docs/roadmap/app-redesign-plan.md` §2.

## Context

The current visual system is the Monolith direction: navy structure, a teal brand
colour and coral highlights, on a light canvas with dark-mode overrides
(`src/app/globals.css`, toggled by a ThemeToggle component in the site chrome and an
inline theme script in `src/app/layout.tsx`). Its contest brief named the fault
plainly: it "reads as a dark SaaS template with cards on it". Two rounds of
landing rework before the contest were rejected and deleted.

The winning variant is a whole brand world rather than a palette:

- a warm-black "room";
- one white-hot hairline beam;
- eight spectral lines, where colour carries meaning (one line per area);
- engraved instrument line-art;
- exactly one amber action per screen.

Round 2 showed it survives a dense data screen: KPI strip, trend with anomaly
marks, channel ledger, PNO dial and weekday profile, at 14 px or larger. It
ships its own `:root` tokens and self-hosted fonts (Cormorant, Hanken Grotesk,
IBM Plex Mono).

The current tokens are already semantic (`canvas`, `surface`, `ink`, `muted`,
`brand-*`, `onyx-*`). That makes most of a reskin a *rebinding*: point the role
names at new values, rather than hunting raw values call site by call site.

## Decision

**1. Dark only.** There is one set of role bindings. The light canvas, the
`prefers-color-scheme` and `data-theme` overrides, the theme script and the
toggle are removed. Contrast is checked once, against one background.

**2. Two token layers, and components use only the second.**

- **Raw scales:** `room-0..3`, `ink-1..3`, `hair-*`, `amber`, the eight spectral
  lines, radii (0 / 2 / 6 / pill), the spacing ladder and two easing curves. All
  are taken from the variant's `:root`.
- **Semantic roles:** `surface`, `surface-raised`, `surface-sunk`, `fg`,
  `fg-muted`, `fg-faint`, `rule`, `rule-strong`, `action`, `focus`,
  `good / bad / flat`, `area-*` (one spectral line per ADR-0013 area) and
  `chan-0..6` (series colours, colour-vision-checked in round 2).

Today's role names are rebound to the new roles first, so every existing page
changes in one diff and nothing breaks structurally. Layouts then move to the kit
area by area.

**3. Type has three jobs and no overlap.**

- **Cormorant:** display headlines only, never a number or a label.
- **Hanken Grotesk:** body and UI text.
- **IBM Plex Mono:** figures and tables.

Floors: 14 px for a label and 16 px for body text, at every width. The fonts are
self-hosted with `next/font/local` from the variant's woff2 files, subset to
Latin and Latin Extended so Czech diacritics are covered. No font package is
added.

**4. One kit, and the living page is its specification.** The shared pieces are
these:

- **Primitives:** `Button` (rebinding the existing one in `src/components/ui.tsx`,
  not forking it), Station, Panel, Ledger, KPI and KPI strip.
- **Charts:** trend, dial, spectrum and weekday. They are hand-built SVG with no
  chart library.
- **Navigation and decoration:** Room (drill-down), Lamp (area entry), the
  provenance badge, and the engraved art sprite.

Each kit file stays under 200 lines (rubric A1). `src/app/design-system`
becomes the living kit, and `docs/design-system.md` is rewritten around the roles.

**5. Motion and texture are for the landing page, not the app.** Film grain and
vignette, the canvas beam and the scroll-pinned camera belong on `/`. App screens
get the hairlines, the colour lines and the arrive / open / return transitions,
with a static version under `prefers-reduced-motion`. The variant's full-screen
grain animates every 1.1 s. It becomes a static texture, because a layer that
repaints on every frame costs more than it is worth.

## Consequences

- Every surface changes at once when the rebinding lands. Pages that used raw
  colour values instead of roles show up as wrong-coloured patches, and those
  are the work list. `docs/design-system.md` already prefers semantic tokens, so
  the patches should be few.
- Dark mode stops being a feature to maintain. The cost is that a tenant who
  wanted a light screen does not get one.
- The landing hero is the only canvas on the site. It loads after the headline
  text has painted, and it pauses when off-screen or when the tab is hidden. `/`
  gets entries in `.github/perf-budgets.json` and `.github/a11y-budgets.json`.
- The design-system page and the visual contest both judge against the same
  tokens, so a future contest round can be scored against the kit and not
  against a screenshot.
- No new runtime dependency is taken (ADR-0008): fonts are files and charts are
  SVG.

## Revisit when

- **A real tenant or a UAT Character cannot work in the dark theme**, for example
  in bright-office use, in print or on a projector. Light mode then comes back as
  a second binding of the same roles. It is not a fork of the kit.
- **Pages keep reaching for raw values after the rebinding.** If three or more new
  raw colours or sizes land outside the kit, the roles are missing something and
  need a new role, not more raw values.
- **The Cormorant display face is used for a number or a label anywhere in the
  app.** That breaks the three-job split that keeps data screens readable.

## Consequences observed

_Read back 2026-10-13, the day it was accepted._ Nothing has tested this yet. It
counts as "settled" only because three records landed in the same change. The
first evidence will be the rebinding commit: how many pages show up as
wrong-coloured patches, which tells us how much raw colour was really outside
the roles. Rewrite this section with that count.
