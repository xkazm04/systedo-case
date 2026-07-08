# UAT L1 — Vojta (indie SaaS maker) · Get found organically

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Character:** vojta-indie-saas-maker
- **Journey:** get-found-organically
- **Project type / surface:** `app` (demo-app · "Flowbase")
- **Date:** 2026-07-08

## Review (Vojta's voice)

Okay, this is the first one of these tools that didn't immediately make me want to close the tab. I went straight to **Srovnání & SEO** because that's my actual job-to-be-done: rank for "alternative to X", "X vs Y", "X pricing" and stop bleeding buyers to competitors with worse products. And credit where it's due — this screen gets it. The table is ranked by *opportunity*, not raw volume: score = volume × intent-weight × SERP-gap ÷ difficulty, and it explicitly bumps the queries where I don't rank yet (`rankFactor` returns 1.3 when rank is null). That's exactly the "write these 3, skip those 30" logic I wanted. The queries aren't generic either — they're built from my brand + my catalog's named competitors (`Flowbase alternativa`, `Flowbase vs …`, `Flowbase cena`). And crucially: **no CPC anywhere on this screen.** The "Akvizice" column estimates monthly conversions off my *organic* channel's real conversion rate, not ad spend. Someone on this team actually understands that I have €0 for ads. There's even a "Ladění skóre" panel so I can tilt toward pricing intent, which is where my buyers convert. Good.

Then I clicked "Vygenerovat srovnání" on `Flowbase vs [competitor]` and the shine came off a bit. The scaffold it produces is fine structurally — H1, sections, comparison criteria, verdict, FAQ, intent-aware. But unless I manually re-type the competitor name and my positioning into the "Ukotvení srovnání" box, it deliberately keeps everything generic ("daný nástroj", "alternativní řešení"). Here's what bugs me: the row I clicked is *literally* "Flowbase vs Asana". The app already knows the competitor — it synthesized that query from my catalog. Why am I typing "Asana" back in by hand? That's a free 30 seconds of grounding it's leaving on the table.

The bigger problem shows up when I push a query through to a real draft. The handoff into the **Obsahový engine** brief is smooth, and the brief → article-draft chain works. But the brief prompt only ever sees topic + primary keyword + a free-text audience. The article-draft prompt only sees the brief. **Nowhere in that chain does my product's actual value proposition reach the model.** Even the positioning I typed into the Compare anchor gets dropped before the brief seed. So the draft that comes out is a competent, grammatically-correct Czech SEO article *about the keyword* — but it has no idea what Flowbase does, why it's better, or who it's for beyond a sentence I typed. That is precisely the "generic SEO slop with my product name find-replaced in" that I said I wouldn't publish under my name. I'd have to go back through and inject every real product fact myself. Not a ground-up rewrite, but not "10 minutes and ship" either.

One nit: over in **Klíčová slova**, every keyword row shows me a CPC bid range and the empty-state literally advertises "search volume, competition and CPC". I told you — I don't run ads, stop showing me CPC. It's ranked by opportunity so I can live with it, but it's noise for me.

Net: the *targeting* layer is genuinely senior-grade and respects my budget. The *content-generation* layer is where it stops being grounded in my product and starts being a generic template engine. I'd use the Compare table weekly. I'd treat its drafts as a skeleton, not a publishable page.

## Findings

See JSON block in the returned summary. Key confirmed items:
- **Strength:** Compare & SEO ranks by winnable opportunity, is fully ad-budget-free (organic-CR economics, zero CPC), and grounds its queries in the catalog's brand + competitors.
- **Major (quality-gap/trust):** the brief → article-draft chain never receives the product's value/positioning — the publishable draft is generic.
- **Minor (quality-gap):** the comparison-outline scaffold defaults to generic and doesn't auto-pass the competitor the catalog already knows.
- **Minor (confusion):** Keyword research foregrounds CPC, Vojta's explicit pet peeve.

## Grounding score

**2 / 5.** The *ranking* layer is well grounded (brand + competitors + intent/competition data reach query synthesis and scoring). But across the content-generation prompts that produce what he'd actually publish — comparison-outline (auto), brief, article-draft — his product's value, his differentiator, and competitor facts do **not** reach the prompt. Only a manual free-text field grounds the scaffold, and even that is dropped before the draft.

## Time-saved (if it all worked)

**~90 min · medium confidence.** Manual query research + outlining one comparison page is his ~2–3h tab-juggle. The Compare table collapses the "what do I write first" decision to seconds and one-click generates a scaffold + brief + draft. Deduction: the product-grounding gap means the draft needs a real editing pass to inject his value prop, so it's ~90 min saved, not the full ~150.

## Journey verdict

**L1-conditional.** The job is completable and the targeting is senior-grade and budget-safe, but the publishable-draft output fails his "would I publish under my name / names my value, not generic" bar without manual product-fact injection.
