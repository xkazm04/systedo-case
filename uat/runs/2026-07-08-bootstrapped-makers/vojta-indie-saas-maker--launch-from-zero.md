# UAT L1 — Vojta (indie SaaS maker) · Launch from zero

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Character:** vojta-indie-saas-maker
- **Journey:** launch-from-zero
- **Project type / surface:** `app` (demo-app · "Flowbase")
- **Date:** 2026-07-08

## Review (Vojta's voice)

Cold-start test: I've got a landing page and a launch date, zero traffic, zero data, zero budget. Does this thing give me anything useful *before* I have numbers, and does it dead-end me when I poke the data-heavy stuff?

Good news first: the modules I actually need at launch — **Klíčová slova, Srovnání & SEO, Obsahový engine, Sociální sítě** — all produce output from nothing. None of them need history. Keyword research runs off a seed term I type; the Compare table synthesizes comparison queries from my brand + catalog competitors and ranks them by opportunity; the content engine will draft from a topic; social will draft posts. So I can genuinely sit down for one session and walk away with a shortlist of queries + a content plan + social drafts. And nothing anywhere forced me to connect an ad account or type a budget. That's the whole reason I'd try this instead of a Google Doc, and it clears the bar.

Now the data-hungry modules. I deliberately opened **Výkon**, **CAC → LTV** and **Knihovna vzorů** to see what happens with no data. Nothing blanks, nothing throws a broken chart — so it's not a hard dead-end. But it's not a *teaching* empty state either. What I actually get is a full dashboard of fabricated numbers scaled off my project id (`getProjectDataset` always scales the sample series — there's no "you have no data yet, here's how to connect it" path). CAC→LTV at least wears a "Ukázková data" banner telling me it's illustrative. Výkon doesn't even render that note at the page level, so a fresh founder could easily mistake seeded numbers for real ones. And "Knihovna vzorů — proven patterns derived from *your* results" is a bit of a joke when I have no results; it's showing me patterns from data that isn't mine. None of this blocks me — I don't live in these modules pre-launch — but the honest move for a zero-data project is a teaching empty state, not a demo dataset with a small disclaimer (or, for Výkon, no disclaimer).

So: everything I need at launch works from zero, no budget pressure, no dead-ends. The data modules degrade to fake-but-labeled rather than teach. For my purposes that's a pass with an asterisk.

## Findings

See JSON block in the returned summary. Key confirmed items:
- **Strength:** all launch-critical modules (keywords, compare, content, social) produce useful output from zero data with no budget or audience required; paid Kampaně is ignorable.
- **Minor (trust/quality-gap):** data-hungry modules (Výkon, CAC→LTV, Knihovna) show fabricated scaled sample data instead of a teaching empty state; Výkon lacks even the SampleDataNote that LTV carries.

## Grounding score

**3 / 5.** For the zero-data modules there's no real data to ground (by definition), and the AI surfaces he can use pre-launch ground in the offering he *can* provide (brand/catalog for Compare, seed term for keywords). The data-dependent modules don't degrade to a data-grounded or teaching state — they degrade to a scaled demo dataset.

## Time-saved (if it all worked)

**~60 min · low-medium confidence.** Assembling a pre-launch visibility plan (queries + content angles + social) in one sitting vs the hours of manual tab-juggling he keeps avoiding. Confidence is capped at L1 because the plan's *quality* depends on the same content-grounding gap flagged in the organic journey.

## Journey verdict

**L1-pass** (with a noted trust asterisk). Core definition-of-done is met: useful output from zero, no blank/broken dead-ends, nothing forces a budget or an audience. The only deduction is that data-dependent modules present demo numbers rather than an honest teaching empty state.
