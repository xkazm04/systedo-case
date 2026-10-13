# English constructions — the rules a glossary can't hold

**How to build the sentence.** `en` is this repo's **derived** locale — see
[`contract.md`](./contract.md): Czech is the source of truth here, so this file
governs writing *English out of Czech*, which is the opposite direction from
most localization advice you will read.

The [glossary](./glossary.md) settles *what to call things* and
[`style-en.md`](./style-en.md) sets the voice. Neither catches the failure that
actually makes derived English read translated: strings that are grammatical,
glossary-compliant, correctly toned — and still shaped like Czech.

Because `/i18n-translate` Pass B **requires every finding to cite an anchor**,
a repo with no constructions file reports those strings **clean**. That is why
re-running `review en` on an already-reviewed catalog changes nothing. Every
rule below has an **ID** for Pass B to cite.

---

## ⚠ STATUS: PARTIALLY VALIDATED (2026-08-06)

**EN-ARTICLE is validated** — see its section, now carrying six real pairs from
the first fan-out wave, where it was the dominant source-side defect. Everything
below it is still bootstrap and still unproven.

### EN-SPELLING · ✅ RULED 2026-09-14: US English (supersedes the parked note below)

> **Operator decision, fleet-wide, 2026-09-14: US spelling on every surface**
> (registry rule EN-SPELLING, `copy-contract.json` `variant: "US"`, enforced by
> `npm run copy:check`). It extends the 2026-08-06 `-ize` ruling (glossary.md,
> review-cs A6) to the whole variant. Count at adoption: US 72 forms, UK 3
> (`colour`, `modelled`, `labelled`), baselined as debt. The note and table below
> are **superseded** and kept as the evidence the decision was taken on. Their
> lesson still holds.

*Superseded note (2026-08-06):* Two agents independently queued "US-normalizing" fixes, reverted them after
grepping, and both reported the `en` column as "consistently British". **A
measurement over the 3 286 `en` values says otherwise** — it is genuinely
mixed, and each agent had generalised from whichever cluster it happened to hit:

| | British | American |
|---|---|---|
| `optimis*` / `optimiz*` | 4 | 3 |
| `analys*` / `analyz*` | **19** | 4 |
| `-ised` / `-isation` vs `-ized` / `-ization` | 3 | **5** |
| `centre` / `center` | 0 | **2** |
| `catalogue` / `catalog` | 0 | **13** |

Only `analyse` is a real house cluster; `catalog` is US at every site because it
is the product's own module name. Everything else is a coin flip.

**This is a parked decision, not a style rule** — see `review-cs.md` § A6. Pick
one variety, sweep once. Until then: match the immediate neighbours of the
string you are editing, and do not "fix" a spelling in isolation. The lesson
generalises past spelling — *an agent that greps a handful of files and reports
a house convention has usually found its own sample, not the catalog.*

---

## ⚠ The rest below: BOOTSTRAP — not validated against this catalog

These rules are seeded from the **direction** (cs → en) and from the
Czech-interference patterns that a Czech-first product reliably produces. They
have **not** been proven against `src/**` strings, and none of the ✗/✓ pairs
below is a real string from this repo yet.

**The first `review en` run's job is to replace every invented example with a
real one, delete any rule this catalog does not actually violate, and add the
ones it does.** A rule with no evidence behind it is a liability: it invites
churn on strings that were already fine. Treat the list as hypotheses.

That discipline is the whole point of the artifact — see the reference run's
outcome in [`lessons-i18n.md`](./lessons-i18n.md), where a rule adopted from an
authoritative style guide without checking the catalog would have introduced a
word the product had never used, sixteen times.

## Provenance

The house authority for English is the **[Microsoft Writing Style
Guide](https://learn.microsoft.com/style-guide/welcome/)** — the en-source
counterpart to the per-language localization guides. Name one authority and
stay with it; do not mix guides row by row.

## ID mapping to the registry (added 2026-09-14)

The IDs in this file are this repo's own and stay citable, with their evidence.
The registry's `localization/english` subject holds the general rule under its
own ID. `copy:check` findings and new reviews cite the registry ID.

| This file | Registry ID(s) | Note |
|---|---|---|
| EN-SPELLING | EN-SPELLING, EN-VARIANT | ruled US 2026-09-14 |
| EN-ARTICLE | EN-ARTICLE, EN-ARTICLE-DEM, EN-ARTICLE-GENERIC | validated evidence stays here |
| EN-VERBAL | EN-LABEL, EN-ACTIVE, EN-NOUN-PILE | no single equivalent; directional (cs → en) |
| EN-REFLEXIVE | EN-REFLEXIVE | |
| EN-ASPECT | EN-PERFECT, EN-PROGRESSIVE | |
| EN-ORDER | EN-ORDER | |
| EN-FALSE-FRIEND | EN-FALSE-FRIEND | |
| EN-SENTENCE-CASE | EN-CASE | |
| EN-DASH | EN-DASH, EN-SPACING | house ban = contract `dash.emDash: "ban"`; space before `; : ! ?` is EN-SPACING |
| EN-ONE-WORD | EN-ONE-TERM | glossary.md stays the termbase |

---

## EN-ARTICLE · Czech has no articles; English needs them

> **Trigger** — a Czech noun phrase with no determiner.
> **Rule** — the single most reliable tell of Czech-authored English. Every
> countable singular noun needs `a`/`an`/`the` or a possessive. Decide which:
> `the` for a specific, previously-established referent; `a` on first mention;
> bare plural for a generic class.

> ### ✅ VALIDATED 2026-08-06 — the one rule in this file with real evidence
>
> The first fan-out wave changed 24 `en` values across 65 files. **A quarter of
> them were this rule** (6 of the platform slice's 16), making it the dominant
> source-side defect in the catalog. Real pairs, replacing the invented ones:
>
> ```
> ✗ Illustrative client data (the same you see in the dashboard)
> ✓ Illustrative client data (the same data you see in the dashboard)
>                                        MonthlyReport.note
>
> ✗ Profit per ad currency                    ✗ Margin {channel}
> ✓ Profit per unit of ad spend               ✓ Margin for {channel}
>       profit.poasSub                              profit.marginAriaLabel
>
> ✗ Model timed out                  ✗ Generating on-brand reply with model…
> ✓ The model timed out              ✓ Generating an on-brand reply with the model…
>       SpeedLead.timedOut                  SpeedLead.generatingStatus
> ```
>
> `profit.poasSub` is the sharpest instance: "profit per ad currency" is a
> literal de-korunization of cs `zisk na korunu reklamy`. It is not English at
> all, and no glossary or style guide would flag it.

## EN-VERBAL · Czech verbs, English nouns — this direction *adds* nominal style

> **Trigger** — a Czech finite verb or reflexive construction.
> **Rule** — the inverse of the Czech rule. Czech prefers conjugating; English
> UI prefers a compact noun phrase for labels and headings, and the plain
> active voice in prose. Do not carry Czech's verb-heavy rhythm into English
> chrome.

```
✗ Here you can edit your campaign        ✓ Edit campaign
✗ Analysis is being performed…           ✓ Analyzing…
```

Note this rule is **directional**: it is correct here and would be wrong in a
constructions file for a Czech *target*.

## EN-REFLEXIVE · `se` is not "itself"

> **Trigger** — a Czech reflexive verb (`ukládá se`, `zobrazí se`, `načítá se`).
> **Rule** — Czech reflexives carry passive or middle meaning. English wants
> either a plain progressive (*Saving…*), a passive (*is displayed*), or an
> actor (*we save*) — never a literal reflexive pronoun.

## EN-ASPECT · Czech aspect is not English tense

> **Trigger** — a perfective/imperfective Czech pair.
> **Rule** — perfective maps to a completed/simple form, imperfective to a
> progressive or habitual one. A literal tense swap produces the classic
> *"I am knowing"* / *"it will be saved successfully"* register.

## EN-ORDER · Czech word order is pragmatic, English is fixed

> **Trigger** — a Czech clause whose subject or object has moved for emphasis.
> **Rule** — Czech marks focus by position because cases carry the roles;
> English cannot. Restore subject-verb-object and mark emphasis lexically or
> with punctuation instead.

## EN-FALSE-FRIEND · The obvious cognate is often wrong

> **Trigger** — a Czech word with an English lookalike.
> **Rule** — `eventuálně` is *possibly*, not *eventually*; `aktuálně` is
> *currently*, not *actually*; `evidence` is *records*, not *proof*; `kontrola`
> is a *check*, not *control*; `realizovat` is usually *carry out*, not
> *realize*. Build this table from real hits in the first review run.

## EN-SENTENCE-CASE · Headings and buttons are sentence case

> **Rule** — Microsoft Writing Style Guide: sentence case everywhere except
> proper nouns. Title Case On Every Word is a common artifact of translating
> label-by-label.

## EN-DASH · ⚠ REVERSED 2026-08-06 — don't punctuate with a dash

> This rule previously read *"The em dash IS English punctuation"* and told
> writers to prefer it. **The owner decided against it on 2026-08-06.** The em
> dash is grammatical English, but a product that reaches for it constantly
> reads as machine-written — and this catalog reached for it **254 times** in
> the `en` column, against 13 en dashes.
>
> **Rule** — default to **no dash**. Recast: full stop → colon → comma →
> parentheses. Only a genuine single beat of contrast keeps a dash, and then it
> is a **spaced en dash ` – ` (U+2013)**, never `—`. Deliberately identical to
> the cs rule so both columns punctuate alike; see `style-en.md` § Punctuation.
>
> Out of scope: the standalone `"—"` no-data placeholder glyph (92 sites),
> numeric/date ranges, `·` middots.
>
> Still true, and unchanged: English does **not** put a space before `; : ! ?`.

**Script this class before dispatching any agent** — see the fan-out protocol
in the skill. Typography needs no context and it is where the source language
leaks hardest.

## EN-ONE-WORD · One concept, one word

> **Rule** — check the [glossary](./glossary.md) before inventing a rendering;
> add the row when you decide one. Two renderings of one concept is a
> `terminology` error even when both are good English.
