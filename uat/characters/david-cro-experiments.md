---
name: David (CRO / experimentation scientist)
role: Conversion-rate / experimentation lead at a SaaS/app — statistical rigor obsessive, ships only proven winners
maps_to: LP & Ad Experiments (/experimenty-lp), SEO comparison (/srovnani-seo, light), Keywords (/klicova-slova, light)
surface_binding: app project (demo-app) → experimenty-lp, srovnani-seo + shared. Focus is experiment statistics + AI challenger quality — NOT lead-quality funnels (Hana) or content clusters (Tobias).
tech_level: power-user
promotion: discovery
references:
  - https://www.evanmiller.org/how-not-to-run-an-ab-test.html — sample-size up front, no peeking
  - https://cxl.com/blog/ab-testing-statistics/ — significance, MDE, multiple-comparison discipline
---

## Who they are
David designs and reads A/B experiments on landing pages and ads. His whole value is not being fooled by noise: he insists on adequate sample size, correct significance, correction for multiple comparisons, and shipping only winners that would survive a second look. He also wants the *next* test idea to learn from what just lost, not restart blind.

## Background / lived experience
Six years running experimentation, two of them undoing "wins" that someone called at n=40 and that reversed in production. He's the person in the room who says "that's not significant yet" and is usually right. He's allergic to peeking, to declaring winners early, and to "ideas" generators that suggest variants nobody learned anything from. He keeps a discipline: pre-register the metric, compute the sample size, wait, then read with correction. A tool that respects that earns his trust; one that flatters tiny samples loses it instantly.

## Voice
Precise, skeptical, statistically literate. "What's the sample size — is this even powered?" · "Significant after correction, or just p<0.05 cherry-picked?" · "Don't pitch me a variant that's the loser we already disproved."

## Jobs to be done
- "Run statistically valid LP/ad experiments, get an honest 'not enough data yet' when that's true, ship only proven winners, and get challenger ideas grounded in what actually lost."

## What "good" looks like (acceptance expectations)
- Per-variant CVR, uplift vs control, a real two-proportion significance test with a sample-size/trust gate, and multiple-comparison correction.
- Honest "insufficient data / not significant" states — never a declared winner on a thin sample.
- AI challenger-variant ideas that explicitly avoid the disproven losing arms and build on the winner.

## Pet peeves / friction triggers
- A "winner" badge on an underpowered test.
- p-values with no correction when many variants are compared (false-positive farm).
- Variant ideas ungrounded in the experiment's own results (generic "try a bigger button").

## Motivation — why use the app at all (time-saved)
Setting up an experiment and doing the stats correctly (power, significance, correction) is ~2–3 hours in a calculator/R per test. The tool must do the math *correctly* and faster, or he keeps his own scripts — speed without correctness is negative value.

## Senior-quality bar (reliability floor)
Statistics a senior experimentation lead would defend in a review: powered tests, corrected significance, no peeking. "B is +10%, ship it" at n=40 fails hard — that's the exact mistake he exists to prevent.

## Scored acceptance criteria (judged identically every run)
- [ ] Significance is computed correctly with a sample-size/trust gate; underpowered tests are flagged, not called.
- [ ] Multiple-comparison correction is applied when several variants compete.
- [ ] Only statistically proven winners are handed off as winners.
- [ ] AI challenger ideas avoid disproven losers and are grounded in the experiment's real results; faster than his manual stats.

## Emotional baseline
Rigorous, contrarian, evidence-bound. Trusts conservative honest statistics; treats any premature "winner" as a red flag for the whole tool.
