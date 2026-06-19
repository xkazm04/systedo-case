# UAT scorecard — Marek × evaluate-whether-to-adopt (2026-06-19)

**Surface:** public marketing path — `/` (homepage), `/cena` (pricing), `/clanek` (content example). No auth.
**Driver:** Playwright/chromium against `:3100` (restarted fresh after a Turbopack-cache crash). Evidence in `shots/`.
**New Character:** Marek — a prospective *buyer* (e-shop owner / economic decision-maker), the first Character covering the conversion surface none of the three internal-user Characters touch.

| Character | Journey | Surface | Status |
|-----------|---------|---------|--------|
| Marek (prospective buyer) | evaluate-whether-to-adopt | / · /cena · /clanek | **Evaluated — would not proceed yet** |

He learned *what* it is and *what it costs* — but left with no proof it works, a primary CTA that pushed him to a login, and brand/"case-study" wobble that made him doubt it's a real product.

## Confirmed findings

| id | type | sev | one-liner |
|----|------|-----|-----------|
| MB1 | missing-feature | **major** | No proof/social proof anywhere — no results, testimonials, logos, or quantified outcomes (the #2 buyer driver after pricing). Code-confirmed absent in `BrandLanding.tsx`. |
| MB2 | quality-gap | minor | Hero is brand-metaphor; the concrete "what + for whom" lives only in the cards below. |
| MB3 | trust | minor | "Systedo" still appears (pricing title + footer) where the product is "Adamant" — incomplete rebrand. |
| MB4 | broken-flow | minor | Primary CTA "Start free" → `/app` (auth wall in prod), not the genuinely-free public exploration. |
| MB5 | quality-gap | polish | `/clanek` is a great output example but isn't positioned as proof. |

## What passed (a real strength)
- **Pricing is transparent** — Free + Pro (490 Kč/měsíc), clear feature lists, recommended tier, no "contact us" wall. Clears the single biggest buyer demand outright.
- The 3 cards translate the offer into concrete surfaces + channel coverage.
- A real frictionless **try-before-buy** exists (the public dashboard/kampane/ai-asistent).
- **Honest** about being a case study rather than faking a checkout.

## Why this Character earned its place
- It exercises a **completely different job** from the three internal users: not "can I do my task" but "should I *adopt* this at all." That surfaced a class of gaps the others structurally couldn't — **proof/credibility and CTA conversion**, not feature usability.
- **The code cross-check sharpened the headline finding:** "no proof" isn't an impression — `BrandLanding.tsx` provably has no testimonial/results/logo section, and "Start free" provably routes to `/app`. Precise, fixable.
- **Honest scoping:** the surfaces openly disclaim they're a portfolio case study (no Stripe, sample data), so a literal purchase can't complete — flagged as the artifact's nature, *not* counted as a defect. The five findings are the ones that would matter even if it were a real product.

## Outcome (fixed same session)
- **MB1 fixed** — a quantified proof band now leads with the case-study numbers (7,2× ROAS, 13,9 % PNO vs the 15 % goal, 8,6 mil. Kč attributed revenue, +8,9 %), honestly labelled as illustrative data — outcomes, not fabricated testimonials.
- **MB2 fixed** — the hero subhead now states what + for whom ("AI ad intelligence for e-shops and agencies … grounded in your own Google Ads, Sklik, Meta and TikTok data").
- **MB4 fixed** — the no-login "See it work" demo is now the primary CTA; "Start free" (→ /app) is secondary, so the loudest button no longer dead-ends at a login.
- **MB3 fixed** — user-facing "Systedo" swept to "Adamant" (pricing title/desc, authed hub header, footer copyright cs/en, OG card); closes the recurring brand-consistency finding from Tomáš's run too.
- MB5 (frame `/clanek` as proof) left as a polish follow-up; remaining internal "Systedo" strings (alert/report emails, code comments, data labels) are a tracked brand-cleanup follow-up.
- With these in, the journey is a **promotion candidate** (acceptance: pricing transparent + proof present + frictionless try path).
