# Design QA — `/lp/exhibit` (variant B · space)

**Result: passed for review**, with the findings below fixed in the same session. Format:
P9 in `docs/design/nextgen-landing.md`.

## Evidence

- Implementation: `http://localhost:3001/lp/exhibit`, Playwright Chromium, 1:1, no chrome,
  captured 2026-09-08 at fractions 0 · .15 · .3 · .45 · .6 · .75 · .9 · 1, then re-captured
  at 0 · .35 · .7 after the fixes.
- Desktop 1440×900; phone 390×844 captured separately. All surfaces onyx (stable tokens), so
  light and dark render identically.
- Source of truth: P4 (numbered specimens, one visual + one caption each, the 7 / 5 / 4
  gallery rhythm) and P3 (the instrument before the pitch).

## Findings and what changed

| Grade | Finding | Change |
| --- | --- | --- |
| P1 | The display headline at `clamp(2.75rem, 6.4vw, 6rem)` in a 4/12 column broke one word per line — six lines for two phrases. | Column widened to 5/12, scale reduced to `clamp(2.5rem, 4.6vw, 4.4rem)`, `text-wrap: balance`. Two lines per phrase at 1440. |
| P1 | The four hero figures in mono at `text-3xl` collided ("8,3 mil. Kč" ran into "12,0 %"). | `text-xl sm:text-2xl`, `min-w-0 break-words`, four columns only from `lg`. |
| P1 | Specimen 02's histogram sat at the bottom of its card with the free space above it. | A grid container's `align-content: normal` stretches auto rows; the specimen is now `grid-rows-[auto_1fr]` + `content-start`, so free space belongs to the card, under the visual. |
| P2 | The featured-row asymmetry (7 / 5) reads; the second row (5 / 4 / 3) reads as a catalogue shelf. No change. | — |

## Interaction verification

- 01: the instrument renders the real `Sparkline` over the real 90-day revenue series with
  baseline and last-point dot; the four figures match `LandingProof`'s values exactly.
- 02: ten bars for the e-shop fixture's plan (the union across types is 23; the fixture's own
  plan is 10 — the caption states the fixture's count, not the union).
- 03: five frames carry the product's real output — domain, offering + localities, the top
  three with fit scores, the top channel's first action, the family / channel counts.
- 04: the matrix's per-cell dots equal `MODULES.filter(section, availableFor)`; the Σ row
  equals `modulesFor(type).length` minus plumbing.
- Specimens fade in on arrival (`.reveal-on-scroll`); the plates arrive one at a time
  (`.mono-seq`). Nothing else moves. Reduced motion and print: both already in the kill lists.
- Phone: each specimen becomes a catalogue row (number in a left rail, card beside it);
  the hero stacks label over instrument; no horizontal overflow at 390.

## What is NOT verified here

- Whether "still" reads as calm or as inert — the review's question.
- The histogram's effort colours against a colour-blind palette; coral vs navy-300 is not
  a safe pair and would need a pattern fill before promotion.
