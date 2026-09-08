# Design-system conventions

Living style guide: **`/design-system`** (renders every token + primitive from source, so it never drifts).
Source of truth: tokens in `src/app/globals.css` (`@theme`), primitives in `src/components/ui.tsx`.

## Buttons — use the `Button` primitive

There were ~185 hand-rolled `<button>`/`<a>` across the app repeating four visual
patterns by hand. Use `Button` from `@/components/ui` instead. The variant/size
classes reproduce those patterns exactly, so it's a drop-in with no visual change.

```tsx
import { Button, buttonClass } from "@/components/ui";

<Button variant="primary" size="md" onClick={…}>Save</Button>   // teal CTA
<Button variant="secondary" size="sm">Cancel</Button>           // outline
<Button variant="onyx">Get started</Button>                     // dark CTA
<Button variant="ghost">Skip</Button>                           // text-only
<Button href="/cena" variant="primary">Upgrade</Button>         // renders <a>, same style
<Button variant="primary" fullWidth disabled>…</Button>
```

- **Variants:** `primary` (brand-600) · `secondary` (outline) · `onyx` (dark) · `ghost` (text).
- **Sizes:** `sm` · `md` (default) · `lg`. **`fullWidth`** for block buttons.
- **`href` → `<a>`** with identical styling; otherwise a `<button>` that defaults to
  `type="button"` (never submits a form by accident).
- Need a **Next `<Link>`** styled as a button? Use `buttonClass(variant, size)` on it —
  `Button` deliberately doesn't import `next/link` into this shared, server-safe module.
- Icons: pass them as children; the base class already sets `inline-flex … gap-2`.

**Migration status (item 15):** the primitive + showcase + this convention are in place,
and the AI `ToolError` actions use it. The remaining hand-rolled buttons (~50 files) are a
mechanical, no-rush migration — convert opportunistically when you touch a file. A big-bang
sweep was deliberately avoided (regression-prone, no functional gain).

## Colour tokens — prefer semantic, and know the ramp adapts

The dark theme is **token-driven**: `globals.css` re-declares the token *values* under
`html[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`, so every `bg-*`/`text-*`
utility adapts for free. Key facts:

- **The navy ramp flips.** `text-navy-800` is dark in light mode and *light* in dark mode
  (the token is overridden). So `text-navy-800` is **not a dark-mode bug** — it reads
  correctly in both themes. That's why item 16 is a *convention* cleanup, not a defect.
- **Prefer the semantic tokens** for intent: `text-ink` / `text-muted` (body/secondary text),
  `bg-surface` / `bg-canvas` (cards / page), `border-line`, `text-brand-accent` (accent text
  + inline links), and the `*-soft` tints (`positive-soft`, `negative-soft`, `coral-soft`) for
  chip/badge backgrounds. These express *what the colour means*, so they're self-documenting
  and safe under theming.
- **Stable-by-design (do not "fix"):** `onyx-*` (deliberately dark surfaces — footer, CTA
  blocks, code panels — identical in both themes) and `navy-900` (CTA-on-teal text) are
  intentionally NOT overridden in dark mode. Leave them.
- **Never hardcode hex** in components — add a token to `@theme` (and its dark override) so it
  themes correctly, then use the generated utility.

**Why no mass find-and-replace (item 16):** ~357 `navy-800/900` + ~61 `brand-700` uses across
~85 files already render correctly in both themes (see above). A blind swap to semantic tokens
would shift some colours sub-perceptibly in light mode (e.g. `navy-800 #0b1b2b` vs `ink #0d1a24`)
for zero functional gain — a regression risk with no upside. Apply the convention going forward
and when touching a file; don't sweep.

## Scroll-driven motion — the one rule that is not optional

`globals.css` carries two families of scroll-driven animation: `.reveal-on-scroll`
(the marketing band fade) and the `.mono-*` family the Monolith landing uses
(`docs/ship/2026-09-08-landing-motion-rebuild.md`). Both are `@supports
(animation-timeline: view())`-guarded, so a browser without scroll-driven
animations renders the content in its final state and nothing is lost.

**A view or scroll timeline ignores `animation-duration`.** The universal
`prefers-reduced-motion` rule collapses every animation to 0.01ms — and that does
nothing at all to a timeline-driven one, because a timeline supplies the progress
itself. So every such class is switched off **by name** in the reduced-motion
block *and* in the print block. Add a class to the family, add it to both lists in
the same diff.

Two ways to get the kill wrong, both of which have already happened here:

- **A masked reveal needs `transform: none` too.** `.mono-reveal-line`'s start
  state is translated 105% behind an `overflow: hidden` mask. `animation: none`
  alone leaves the line parked outside its mask — invisible, with no animation
  running to bring it back.
- **A 3D object must NOT be flattened.** `.mono-prism` gets `animation: none` and
  keeps its resting `rotateY`; giving it `transform: none` with the rest of the
  family collapses six panels onto one plane and shows a broken object instead of
  a still one.

Two more things CSS 3D will not do for you, learned the same way: an element
translated on Z inside a `perspective` sits nearer the camera than an
untransformed sibling, so any overlay above it needs an explicit `z-index`; and a
`rotateX` tilt pushes an object's ends outside its own box, so an overlay that
masks those ends has to reach past the box, not stop at it.
