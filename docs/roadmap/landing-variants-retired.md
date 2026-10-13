# Retired: the `/lp` landing-page variants

> **Reopened and closed again on 2026-09-08.** `/lp` came back that day as a review sheet for
> three research variants (`story` / `exhibit` / `instrument`, one information-distribution
> strategy each, from [`docs/design/nextgen-landing.md`](../design/nextgen-landing.md)) after
> a first single variant, `/lp/monolith`, had already been built and torn down. The owner
> reviewed all three and deleted them the same day: none showed the potential hoped for, and
> the lesson recorded is that a landing direction needs the owner's OWN specific references
> and inputs before anything is built — a library derived from other people's videos is not
> a brief. The pattern doc stays as the record of the reading; nothing else survives. Reason 2
> below held again: a variant nobody asked for in those terms is a period piece on arrival.

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
