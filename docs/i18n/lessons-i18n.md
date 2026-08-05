# Lessons from a full-catalog localization sweep

Field notes from running `/i18n-translate` end-to-end over a 6 095-key,
four-locale catalog (a sibling product, `kp`: en source → cs/de/fr). Recorded
here because the findings are about the **method**, not that product, and the
next `review en` run in this repo will hit the same walls.

The short version: the skill's audit was structurally unable to see the
failure everyone could feel, one scripted pass fixed 4 741 strings, and the
thing that saved the fan-out was an adversarial review phase.

---

## 1. The audit was blind by construction

The skill requires every Pass B finding to **cite an anchor** — a glossary row,
a style rule, an exemplar. That rule is correct: it is what stops churn on
strings that were already fine.

But the dominant residual failure has no anchor to cite. Strings that are
grammatical, glossary-compliant and correctly formal can still be *shaped like
the source language*:

```
✗ Konverzace vedená AI      ✓ Rozhovor vede AI            ("AI-led conversation")
✗ Odkud pochází shoda       ✓ Z čeho shoda vychází        ("Where the fit comes from")
```

Both pass every check. So Pass B reported them **clean**, and re-running
`review` changed nothing — which is exactly what the operator had observed and
could not explain. The fix was a fifth artifact, `constructions-<locale>.md`,
giving those failures citable IDs.

**Transfer to this repo:** if a `review en` pass comes back with little to say
about strings that still read translated, the missing piece is the anchor set,
not more review passes.

## 2. Rules do not transfer between locales

The headline Czech rule — *unstack source noun piles into finite verbs* — is
**inverted** in French. Microsoft's French guide states plainly that French
prefers noun forms more often than English does (*"How to use X"* →
*"Utilisation de X"*).

Generalising one locale's rulebook across locales, the obvious efficiency, would
have systematically damaged French thousands of times.

**Transfer to this repo:** this matters doubly here because the direction is
inverted (cs → en). Most localization writing assumes English source; half of
it is backwards for this catalog. `constructions-en.md` is seeded accordingly
and marked as unvalidated.

## 3. Typography is where the source leaks hardest — and it is free to fix

The em dash was the tell. English used 39 on one page; the three target locales
carried **42 / 41 / 38**. The count travelled with the copy into three
languages that do not use the character. French had **zero** curly apostrophes
across 1 834 sites, against an explicit rule.

One script corrected **4 741 strings**. No model was involved.

**Do this before dispatching agents.** Otherwise every agent spends tokens
rediscovering the same finding, and reports it as its own.

## 4. Verify a guide's token against your own catalog

One rule adopted Microsoft's Czech recommendation `nezdařilo se → nepovedlo se`.
The replacement was applied 16 times before review checked the catalog:

```
nepovedlo     0
nepodařilo  165
selhal       86
```

**Zero occurrences.** The authority was right about register and wrong about
this product's vocabulary. Authorities give you rules; your catalog gives you
tokens.

## 5. Get the merge gate's own parser right

The safety gate rejected 10 changes for "placeholder drift". They were correct
plural expansions:

```
en    Select all {count}
cs ✗  Vybrat všech {count}          (ungrammatical for count = 1)
cs ✓  {count, plural, one {Vybrat #} few {Vybrat všechny #} other {Vybrat všech #}}
```

A naive `{(\w+)` also matches plural **branch bodies** (`{Vybrat #}`). The gate
was about to discard the single most valuable class of fix. An ICU argument is
an identifier followed by `,` or `}` — and compare unique **sets**, not counts,
because a four-branch plural legitimately repeats a placeholder.

The reverse trap exists too: a glossary sweep renamed the ICU **placeholder**
`{role}` → `{pozice}` at 56 sites, because the term inside the braces matched a
termbase row.

## 6. Half-sweeps are the enemy — and an adversarial reviewer is what catches them

54 audit agents proposed 1 297 changes. Three reviewers — one per locale, told
to hunt *systematic* misapplication rather than re-audit — all returned
**"partial"** and held back 178.

The dominant defect was identical in all three locales: **some batches deferred
a term as "one house decision, one sweep" while sibling batches applied it
anyway.** French converted 80 of 189 sites of one phrase and left 109. German
swept a term in five keys against a prohibition written in its own review file.

They also caught things no per-string check could: a gender-neutral form that is
**ungrammatical** in the case it was dropped into (a nominative-only slash form
in genitive slots), and pre-existing bugs where ICU `select` **case names** had
been translated (`gewinnt` for `wins`), so the select never matched and silently
fell through to `other`.

**If a term needs a house decision, park it and record it.** Leaving a minority
of sites stranded is worse than not starting.

## 7. The loop compounds — if you write the harvest back

The sweep produced **13 new Czech rules**, each because a real defect had no ID
to cite. It also exposed a **contradiction between the constructions file and
the style guide** (one endorsed a form the other banned) that had made two rules
mutually uncitable.

Over-applying a rule and reverting is *also* a harvest: one rule now carries a
documented exception because "fixing" an idiomatic elliptical fragment left an
adjective agreeing with nothing.

**A native rejection that no rule explains is a new row, not a one-off fix.**
That is the only mechanism by which one review session pays for the thousands of
strings nobody will ever read.

## 8. What the process cannot do

322 strings came back flagged `needsNative` — agents correctly refusing to
guess. Plus a set of parked house decisions no amount of tooling settles.

This process makes a catalog **consistent with professionally authored
rulebooks**, which is a large and real improvement. It is not native sign-off.
The flagged list is the honest boundary, and it is short enough to be worth
paying a native to review.
