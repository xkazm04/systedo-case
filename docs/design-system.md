# Design-system conventions

Living style guide: **`/design-system`** (renders every token, primitive and kit
component from source, so it never drifts; its **Kit** section is the kit's spec).
Source of truth: tokens in `src/app/globals.css` (`@theme static`), primitives in
`src/components/ui.tsx`, the Optic Bench kit in `src/components/kit/`.
Decision: [ADR-0014](adr/0014-dark-only-optic-bench-design-kit.md).

## The brand in one paragraph

Optic Bench: one beam, three moves. A warm-black room, a white-hot hairline, eight
spectral lines where **colour carries meaning** (one per area, `area-*`; one per data
series, `chan-*`), engraved instrument line-art, and **one amber action per screen**.
Dark only — there is no light theme and no theme toggle.

## Type has three jobs

- **Cormorant** (`font-display`) — display headlines only. Never a number, a label or a table.
- **Hanken Grotesk** (`font-sans`, the default) — body and UI.
- **IBM Plex Mono** (`font-mono`) — figures, tables, eyebrows.

Floors: 14px for any label, 16px for body copy, at every width.

## The kit — build roofs and rooms from these

| Component | Use it for |
|---|---|
| `kit/Station` | One band of an area roof: Measure · Triage · Act, with the area's hue on its tick |
| `kit/Panel` | The one container: wash, hairline, engraved corner ticks. Panels never nest |
| `kit/Kpi`, `KpiStrip` | A number with its change: glyph = direction, colour = good/bad, never colour alone |
| `kit/Spectrum` | Shares of one whole (channel split); the legend always states the number |
| `kit/Dial` | A ratio against a goal (PNO); the reading is printed under the arc |
| `kit/Provenance` | Where a figure came from: live · api · import · manual · sample · stylised |
| `kit/Lamp` | The entry to an area, with its engraved motif |
| `kit/Room` | A module opened from its roof: breadcrumb back, Esc back, its own URL |
| `kit/art/AreaArt` | The engraved motif per area (`src/lib/projects/areas.ts` names them) |

## Buttons — use the `Button` primitive

```tsx
import { Button, buttonClass } from "@/components/ui";

<Button variant="primary">Apply</Button>        // THE amber action — one per screen
<Button variant="secondary" size="sm">Why</Button> // hairline outline
<Button variant="onyx">Open</Button>             // deep-panel button
<Button variant="ghost">Skip</Button>            // text-only
<Button href="/cena" variant="primary">Upgrade</Button> // renders <a>, same style
```

- An amber fill always carries **`text-on-action`** (dark ink). White on amber is ~1.9:1;
  `test-unit/design-tokens-contrast.test.mjs` checks every variant's fill/label pair.
- Need a **Next `<Link>`** styled as a button? Use `buttonClass(variant, size)`.
- `href` → `<a>`; otherwise a `<button>` defaulting to `type="button"`.

## Colour tokens — roles first, and the old names were rebound

The Monolith role names were **rebound** onto Optic Bench values in one diff, so old code
renders on-brand without edits:

- `canvas` / `surface` / `ink` / `muted` / `line` — the room and its text.
- `brand-500…700` are the **amber action** fill; `brand-800` is hover fill and light accent
  text; `brand-50…300` are dark amber tints for chips and rings; `brand-accent` is accent text.
- `navy-*` is the structure ramp: high steps are **light text**, low steps dark chips and
  borders, and `navy-900` stays dark (ink on a bright fill). A `bg-navy-600…800` fill is
  therefore a light patch — use `bg-onyx` / `bg-onyx-soft` for a dark fill.
- New code prefers the kit's raw names where it means them: `room-0…3`, `hair` /
  `hair-mid` / `hair-hi`, `amber`, `s-*`, `area-*`, `chan-*`.
- **Never hardcode hex** in a component; add a token. Tenant data (a project's accent) is
  the exception.
- The theme block is `@theme static`: Tailwind v4 drops a variable no utility references,
  and the kit reads `area-*`/`chan-*` through `var()`.

## Scroll-driven motion — the one rule that is not optional

`.reveal-on-scroll` in `globals.css` is `@supports (animation-timeline: view())`-guarded,
so a browser without scroll-driven animations renders the content in its final state.

**A view or scroll timeline ignores `animation-duration`.** The universal
`prefers-reduced-motion` rule collapses every animation to 0.01ms and does nothing to a
timeline-driven one, because the timeline supplies the progress itself — so every such
class is switched off **by name** in the reduced-motion block *and* the print block. The
same rule zeroes `transition-duration` but not `transition-delay`: a sequenced arrival is
a motion too, and needs `transition-delay: 0s` there. Add a class to the family, add it
to both lists in the same diff. (Learned on the 2026-09-08 landing research, since removed;
`docs/design/nextgen-landing.md` keeps the reading.)
