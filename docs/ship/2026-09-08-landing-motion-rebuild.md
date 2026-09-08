# The landing motion + asset rebuild — direction contract

**Status:** live at `/lp/monolith`, indexed from `/lp`, both `noindex`.
**Decision due 2026-10-08:** promote one onto `/` and delete the other, or delete
both routes. See [Reversing this](#reversing-this).

---

## Why this exists

The shipped homepage states the right things and shows almost nothing. Measured
before the change:

| | |
| --- | --- |
| Landing section components | 5 files, 551 LOC |
| Sections carrying **any** image or SVG art | **1 of 5** (`LandingHero`, two `next/image` calls) |
| Sections carrying **any** entrance or scroll motion | 2 of 5 (`.reveal-on-scroll` on modules + FAQ) |
| Brand rasters in `public/` | 7, one of them (`illu-monolith.png`) referenced nowhere |

That is a gap in EXECUTION, not in direction. `DESIGN.md` already defines a
strong world — an obsidian monument, a faceted lattice, one rationed teal — and
nothing on the homepage was drawing it.

## Where the method came from, and what was kept

The prompt for this work was a video arguing that a particular model plus a
particular image plugin is what separates a designed page from a generic AI page
(`youtube.com/watch?v=THjxEpbCQsA`). The model is not the argument. Four things
in it are stack-independent, and all four are used here:

1. **Name the technique.** "You can't ask for something that you can't name."
   A menu of five, below.
2. **Spend a motion budget.** Six interactions felt calm because only ONE thing
   moved at a time — each technique owned one section.
3. **Sequence deliberately.** Footage → body → numbers; and figures arriving one
   at a time read as calm where four arriving together read as a table.
4. **Run the verification loop.** Screenshot the broken viewport, name what is
   wrong, fix it. "The step everyone skips."

What was replaced: the plugin. `src/lib/leonardo/client.ts` was already wired and
`LEONARDO_API_KEY` was already set, so the assets are ours.

## The direction (references, not adjectives)

Quoted from `DESIGN.md`, not invented for this page:

> An obsidian monument for ad intelligence. Onyx surfaces, a faceted 60° lattice,
> and one teal that only speaks when it means something. Density is analytic, not
> airy. Motion is present but subordinate: it assembles, then gets out of the way.
>
> **Anti-reference:** the generic SaaS gradient dashboard — no purple-to-blue
> washes, no glassmorphism, no illustrated mascots. Nothing lifts on hover.

Archetype call, in the reference video's own terms: Adamant is the *Fathom* build
(sharp, cold, quiet), not the *Pulp* build (warm, maximal). Energy comes from data
in motion, never from bounce.

## The technique menu, and which band spends each one

| Band | Component | Technique | Mechanism | JS |
| --- | --- | --- | --- | --- |
| Hero | `MonolithHero` + `MonolithLight` | layered parallax (3 planes) + cursor-tracked light | `animation-timeline: scroll()`; `--mx/--my` | 1 island |
| Claim | `MonolithClaim` | scroll-trigger text reveal | `animation-timeline: view()` + masks | — |
| Turntable | `MonolithTurntable` | scroll-driven rotation | CSS 3D prism on a view() timeline | — |
| Path | `HomePathWalkthrough` *(reused)* | — | its own `.reveal-on-scroll` | — |
| Proof | `MonolithProof` | stacking cards + one figure at a time | `position: sticky` | — |
| Modules · Crossroad | *(reused)* | **deliberately still** | — | — |
| Closing | `MonolithClosing` | one fade, and then it stops | `.reveal-on-scroll` | — |

Four of five hydrate nothing. The CSS lives in one block in `src/app/globals.css`
(`.mono-*`), and **every class in it is switched off by name** under
`prefers-reduced-motion` and in print — a view/scroll timeline ignores
`animation-duration`, so the universal 0.01ms rule cannot neutralise it.

### Two translations, made on purpose

**The mascot became a light.** The video's fifth technique is a character whose
eyes follow the cursor, with the eyes travelling further than the head. `DESIGN.md`
lists illustrated mascots as a confirmed anti-reference. The technique survives —
the rim light on the monument tracks the pointer and travels about four times as
far as the mass does — and the mascot does not.

**The frame sequence became a real 3D object.** A 24–36 frame turntable does not
work with a text-to-image model: diffusion has no camera parameter, so 36 renders
of "the same monolith, turned" are 36 different monoliths and the result flickers.
The band instead builds a hexagonal prism — six faces on a 60° pitch, radius =
face width × 1/(2·tan30°) — textured with three generated obsidian materials and
turned by scroll position. Coherent by construction, three textures instead of
thirty-six frames, and it holds at any angle the reader stops on.

The face COUNT was measured, not guessed: twelve faces wide enough to carry a
stone texture describe a barrel two and a half times wider than it is tall enough
to read. Six give a column.

## The assets

`npm run brand:assets` → [`scripts/leonardo-assets.mjs`](../../scripts/leonardo-assets.mjs),
reading [`scripts/brand-assets.manifest.json`](../../scripts/brand-assets.manifest.json).
Ten assets in `public/brand/monolith/` plus the crossroad tile for `/kanaly-zdarma`,
which rendered a bare onyx chip before. Provenance — prompt, model, style, generation
id, date — is written to `public/brand/monolith/PROVENANCE.json`.

- **Prompts are data**, so re-generating an asset is a reviewable diff rather than a
  binary that changed for reasons nobody wrote down.
- **AMBER** under AGENTS.md § *What you may do unattended*: it spends Leonardo credits,
  so it is on-demand only and never in `check`, `check:ci` or a hook. `--dry-run`
  prints every prompt and spends nothing.
- **It breaks the client-seam rule on purpose**, and says so in its own header: that
  seam is `@/`-aliased server TS and ADR-0008 requires `scripts/` to run on bare node.
  What the rule protects — metering, the spend ledger, the reaper's cleanup contract —
  is runtime, and this is build-time.

### What the verification loop actually caught

Not hypothetical. In order:

1. **`band-proof` came back with a numbered ruler across it** — legible digits — despite
   "no text, no lettering, no numerals" in the negative tail. Fixed by describing the
   instrument as etched grooves instead of measurement rules, and refusing numerals four
   more ways. The prompt in the manifest is the second one.
2. **The prism was a barrel.** Twelve faces at a readable texture width is a 432px-wide
   cylinder. Six faces, and it is a column.
3. **The prism's fade overlays painted UNDER it.** The panels are translated on Z inside
   a perspective, so they sit nearer the camera than an untransformed sibling; the
   overlays needed an explicit `z-10`, and needed to reach past the stage box, because
   `rotateX(-7deg)` pushes a 520px column's ends ~30px outside it.
4. **The stack was not a stack.** 150px slabs pinned at 5.5rem are overtaken before the
   reader registers them. `sm:min-h-[34vh]` is what makes the pile read as a pile.
5. **On a phone the stack was actively wrong** — a pinned slab showed its figure with the
   sentence explaining it hidden under the next card ("8.3M CZK" and nothing else). The
   stack is now a `sm`-and-up affordance; below that the slabs are an ordinary list.
6. **On a phone the monument was a smudge** behind the headline. It is now pushed off the
   right edge, oversized and dimmed — a fragment of the monument, not a small picture of one.

## What was deliberately NOT rebuilt

`LandingModules`, `LandingFaq` (its JSON-LD is a real SEO surface), `Crossroad` and
`HomePathWalkthrough` (it carries `id="core-path"`, which `tests/public-demos.spec.ts`
asserts on, and every panel renders the product's real output). They carry product
truth, and rewriting them to make the diff look bigger is exactly how the last
generation of variants reached 1126 LOC — see
[`landing-variants-retired.md`](../roadmap/landing-variants-retired.md).

The copy is the shipped page's, verbatim, everywhere it was reused. Changing the claim
and the craft in one diff would make the comparison at `/lp` unreadable.

## Reversing this

The rebuild adds files and changes none of the shipped landing's own components. To
drop it entirely: delete `src/components/brand/monolith/`, `src/app/lp/`,
`public/brand/monolith/`, the `.mono-*` block in `globals.css`, the `brand:assets`
script and its manifest, and revert the one line in `crossroad/meta.tsx`. `/` is
untouched throughout.

To promote it: point `src/app/page.tsx` at `MonolithLanding`, delete
`src/components/brand/landing/{LandingHero,LandingProof,LandingClosing}.tsx` and
`HomeFreeChannelsBand.tsx` with an `Ack:` for any test that named them, and delete
`src/app/lp/` in the same diff.
