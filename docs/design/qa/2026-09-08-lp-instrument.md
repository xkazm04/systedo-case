# Design QA — `/lp/instrument` (variant C · interaction)

**Result: passed for review**, with the findings below fixed in the same session. Format:
P9 in `docs/design/nextgen-landing.md`.

## Evidence

- Implementation: `http://localhost:3001/lp/instrument`, Playwright Chromium, 1:1, no chrome,
  captured 2026-09-08 at fractions 0 · .15 · .3 · .45 · .6 · .75 · .9 · 1, re-captured at
  0 · .6 after the fixes.
- Desktop 1440×900; phone 390×844 captured separately. Onyx throughout.
- Source of truth: P3 (open on the readout), P12 (the product's clearest property — the
  module set follows the project type — made operable), the astra showcase's fixed rail.

## Findings and what changed

| Grade | Finding | Change |
| --- | --- | --- |
| P1 | The e-shop revenue KPI rendered as a full CZK amount ("8 294 482 Kč") in mono `text-3xl` and overprinted the ROAS beside it. | CZK KPIs format through `fmtCZKCompact` ("8,3 mil. Kč"); KPI type `text-xl sm:text-2xl`, `min-w-0 break-words`. |
| P2 | The rail's generated panel showed its teal edge-light as a vertical streak across the type buttons. | `object-right`, opacity 40%: the light becomes the rail's own lit edge. |
| P2 | Phone: the rail becomes a horizontal segmented control; the fifth type scrolls off-screen with no visual hint. | Not changed — the group is `overflow-x: auto` and the cut-off third entry is the hint. Noted for the review. |

## Interaction verification

- Five rail buttons, `aria-pressed` on the active one; `role="group"` labelled by the rail's
  question. Keyboard reachable; focus ring is the global one.
- Switching type: the h1 re-animates (`animate-fade-up`, keyed), the line re-draws
  (`.chart-draw`, keyed path), the KPI grid restaggers, the switchboard re-lights with an
  18 ms stagger per key (`--i`), the plan re-sorts, the sheet re-renders.
- Lit counts match `modulesFor(type).length` minus plumbing: e-shop 28 of 29; the e2e spec
  asserts the count CHANGES when the third rail entry (lead-gen) is chosen.
- The payload for all five types is computed once on the server (`derive.ts`); the client
  island receives strings and numbers only. Plans are trimmed to eight rows per type.
- Reduced motion: every effect here is a transition or a keyed remount animation; the
  universal rule collapses them and the board simply re-lights.
- Pointer light (`PointerLight`) plays across the switchboard as a radial highlight; it
  never attaches under reduced motion or for a touch pointer.

## What is NOT verified here

- Whether operating the page beats reading it — the review's question.
- The deep-link `/app` with a pre-selected type: the CTA names the chosen type but the app's
  create-project form is not wired to a query parameter; that is a product change, not a
  landing one, and is stated on the button rather than implied.
