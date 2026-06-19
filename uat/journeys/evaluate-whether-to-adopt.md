---
character: Marek (prospective buyer)
goal: "Is this worth adopting for my e-shop — and can I trust it enough to take the next step?"
promotion: discovery
seed: none — public marketing surfaces (/, /cena, /clanek, /ai-asistent). No auth.
references:
  - https://learn.g2.com/software-pricing-transparency — pricing transparency as the gatekeeper
---

## Trigger (why now)
Marek is actively shopping for a way to improve his e-shop's ad performance. A link brought him to Adamant's site; he has a few minutes to decide whether it's worth a closer look.

## Definition of done (his POV)
- Within ~1 minute he understands **what Adamant does** and whether it fits an e-shop like his.
- He can see **what it costs** and which tier fits — without requesting a demo.
- He finds **credible, quantified proof** it works (results / who uses it / numbers).
- He has a **clear, low-risk next step** (try it / start) and knows what it is.
- Nothing on the way makes him doubt it's a **real, trustworthy product** (vs a demo/mockup).

## Out of scope
- Actual checkout/purchase or account creation.
- The authed product internals (`/app/*`) — that's the *user's* world, not the buyer's evaluation.

## Discovery hints
Entry point: `/` (homepage). Likely visits `/cena` (pricing), `/clanek` (an example of the content it produces / proof), maybe `/ai-asistent` to try it, and footer links (Ceník, Knihovna vzorů, Mapa). Do NOT script the path — let Marek hunt for "what, proof, price, next step" and note every place he has to work for it or starts to doubt the product is real.

## Frozen happy path
_(filled in on `promote`)_
