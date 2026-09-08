# Retired: the `/lp` landing-page variants

> **Reopened 2026-09-08, deliberately and with an end date.** `/lp` is live again as the
> REVIEW SHEET for three research variants — `/lp/story`, `/lp/exhibit`, `/lp/instrument` —
> each a pure application of one information-distribution strategy from
> [`docs/design/nextgen-landing.md`](../design/nextgen-landing.md) (time, space, interaction).
> A first single variant, `/lp/monolith`, was built and torn down the same day; its record is
> [`docs/ship/2026-09-08-landing-motion-rebuild.md`](../ship/2026-09-08-landing-motion-rebuild.md).
> This note is the reason that is not simply a repeat of the mistake below:
>
> - **They are reachable and reviewed, not parked.** `/lp` links all three with the bet each
>   one makes and a good/bad column; reason 2 below does not apply.
> - **They exist to DERIVE the path, not to be it.** Each is unblended on purpose so a review can
>   attribute what worked. The shipped homepage is untouched throughout.
> - **They are composed, not monolith files.** Every band is a section component under the
>   200-LOC rubric; reason 3 below is the shape they were built to avoid.
> - **Decision date: 2026-10-08.** Promote one strategy (or a written fusion) onto `/` and delete
>   the rest, or delete all three. Past that date with no decision, they are this note's original
>   finding happening again and should be deleted without ceremony.

## What was deleted

| Route | Component | LOC | What it explored |
| --- | --- | --- | --- |
| `/lp` | `src/app/lp/page.tsx` | 180 | An internal, `noindex` side-by-side comparison index of the three variants plus the incumbent, carrying re-measured design-detector counts per route. |
| `/lp/bolder` | `src/components/brand/variants/LandingBolder.tsx` | 412 | **"Amplified."** Keep the Monolith direction but carry the dark mass past the fold (dark → light instrument panel → dark), and put Geist Mono to work: sans speaks, mono measures, with each of the four proof figures typeset as the *kind* of number it is. |
| `/lp/distilled` | `src/components/brand/variants/LandingDistilled.tsx` | 525 | **"Distilled."** Hypothesis: the homepage is over-built and under-argued. Strip the hero lockup, the eyebrow pill, the kickers and the crossroad chips; spend the room on the measure → triage → generate loop, the tiered channel support, and pricing on the page itself. |
| `/lp/newworld` | `src/components/brand/variants/LandingNewWorld.tsx` | 1126 | **"The Level Run."** A replacement visual world — geodetic levelling rather than sculpture — with the page's spine being the run itself: measure → deviation → setting-out, read against a tolerance. The only one of the four surfaces that handled `prefers-reduced-motion`. |

## Why they are retired

1. **They tell a story the product no longer leads with.** All three pitch
   paid-performance measurement on live Google Ads data. Since
   `docs/ship/2026-08-28-kanaly-core-path.md`, the first thing the product does
   for a visitor who has never bought a click is the **free-channel path**, and
   the homepage now opens on it. A variant that cannot state the lead claim is
   not a candidate; it is a period piece.
2. **Nothing linked to them.** They were absent from `nav.ts`, from
   `sitemapEntries()`, from the footer and from the quick-nav palette. `/lp`
   itself was `noindex` and linked from nowhere — three landing pages nobody
   could reach and no test rendered.
3. **They are the exact shape the repo's rubric exists to prevent.** Each is a
   single file of 412 / 525 / 1126 LOC with its own hardcoded copy tables, against
   the ≤200-LOC convention in `AGENTS.md`. `LandingNewWorld.tsx` was the largest
   component in the repo — the number-one entry in
   [`component-debt.md`](./component-debt.md). Keeping three unreachable
   monoliths alive as "we might harvest them later" is how that debt table stops
   being a plan.

## What was harvested before deleting

The one idea that outlived its variant is composition itself: the shipped
homepage is a 60-line composer over ≤200-LOC section files, which is what the
variants demonstrated was possible and what none of them did. Two ideas were
deliberately **not** harvested and remain open if anyone wants them:

- **Mono-for-measurement typography** (Amplified). Geist Mono is loaded and
  `DESIGN.md` sanctions it for spec labels and literal values; no shipped
  marketing surface uses it.
- **Pricing on the landing page** (Distilled). The homepage links to `/cena`
  rather than stating the split; that is a deliberate choice today, not an
  oversight.

## How to reverse this

The variants are in git history up to and including the commit that removed
them. Restore any single one with:

```
git log --diff-filter=D --oneline -- src/components/brand/variants
git checkout <that-commit>^ -- src/components/brand/variants src/app/lp
```

They will not typecheck against a moved `PLAN_INFO`, `nav.ts` or crossroad
model without adjustment — restore them to read, not to ship.
