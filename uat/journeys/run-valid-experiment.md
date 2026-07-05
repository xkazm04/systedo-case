---
character: David (CRO / experimentation scientist)
goal: "Run statistically valid LP/ad experiments, get an honest 'not enough data yet', ship only proven winners, and get challenger ideas grounded in what actually lost."
promotion: discovery
seed: authed local mode → demo-app → LP & Ad Experiments (/experimenty-lp)
references:
  - https://www.evanmiller.org/how-not-to-run-an-ab-test.html — sample-size / no-peeking bar
  - https://cxl.com/blog/ab-testing-statistics/ — significance & correction bar
---

## Trigger (why now)
David has experiments running and a stakeholder pushing to "call the winner". He needs the tool to tell him the truth about significance — and, for the next round, propose challenger variants that learn from the losing arms rather than restart blind.

## Definition of done (his POV)
- Per-variant CVR, uplift vs control, correct two-proportion significance with a sample-size/trust gate, and multiple-comparison correction.
- Honest "insufficient data / not significant" states — no winner badge on a thin sample.
- AI challenger ideas that explicitly avoid disproven losers and build on the winner.
- Correct *and* faster than his manual stats — speed without correctness is negative value.

## Out of scope
- Wiring a live experimentation platform (sample experiments are fine for the flow).

## Discovery hints
Entry: /experimenty-lp. Don't script — judge whether the statistics are conservative and correct (does it refuse to call an underpowered test? does it correct for multiple comparisons?), and whether the AI challenger ideas are grounded in the experiment's own results.

## Frozen happy path
_(filled in on `promote`)_
