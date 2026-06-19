# Evaluation rubric — the shared lens

Every finding is scored through this lens. It adapts two established inspection methods to an LLM Character driver: **Nielsen's heuristics** (broad quality) and the **cognitive walkthrough** (per-step, new-user learnability). Sources: [NN/g — Cognitive Walkthroughs](https://www.nngroup.com/articles/cognitive-walkthroughs/), [MeasuringU — HE vs CW](https://measuringu.com/he-cw/), [Usability BoK — Heuristic Evaluation](https://www.usabilitybok.org/heuristic-evaluation/).

## 1. At every step, ask (cognitive walkthrough)

1. **Will the Character know what to do here** to make progress toward their goal?
2. **Will they see the control** that does it (is the affordance visible / discoverable)?
3. **Will they connect the control to their intent** (does the label/state match their mental model)?
4. **After acting, will they understand what happened** and that they're closer to done?

A "no" at any step is a finding. A "no" at step 2 where the control *does* exist in the code is a **discoverability/confusion** finding, never "missing-feature".

## 2. Quality heuristics (broad)

Visibility of system status · match to the real world (and the Character's vocabulary/locale — here, Czech) · user control & freedom · consistency · error prevention · recognition over recall · flexibility · minimalist, actionable info · good error messages · help when stuck. **Trust** is first-class for this product: do the numbers reconcile, is the AI output grounded, would the Character act on it?

## 3. The five acceptance dimensions (the verdict)

Score each journey on:

| Dimension | Question |
|-----------|----------|
| **Completion** | Could the Character actually finish the job? |
| **Effort** | How much friction/steps/confusion to get there? |
| **Clarity** | Did they understand what they saw and what to do next? |
| **Trust** | Would they believe and act on it (numbers, AI output)? |
| **Missing pieces** | What did they expect to exist, by domain norm, that wasn't there? |

"By domain norm" is the key guard against arbitrary verdicts — the bar comes from the Character's `references:` (real-world expectations), not from the reviewer's taste.

## 4. Finding types

`missing-feature` · `quality-gap` · `broken-flow` · `confusion` (incl. present-but-undiscoverable) · `trust`

## 5. Severity

| Severity | Meaning |
|----------|---------|
| **blocker** | Character cannot complete the job at all. |
| **major** | Job completable but with serious friction, or they'd leave/distrust. |
| **minor** | Noticeable friction; job done but not smoothly. |
| **polish** | Cosmetic / nice-to-have; doesn't impede the job. |

## 6. Verdict (adversarial pass)

Every finding gets `confirmed | refuted | uncertain`. Default to `refuted`/`uncertain` unless evidence (screenshot, a11y-tree quote, `file:line`) holds against a skeptic who assumes the Character missed the affordance or the expectation is out of scope. Only `confirmed` reach the headline report.
