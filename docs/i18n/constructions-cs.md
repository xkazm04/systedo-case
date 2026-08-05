# Czech constructions — the rules a glossary can't hold

**How to build the Czech sentence out of English.** `cs` is this repo's
**target** locale as of 2026-08-05 — see [`contract.md`](./contract.md): English
is written from the functionality, Czech is transcreated from it.

The [glossary](./glossary.md) settles *what to call things* and
[`style-cs.md`](./style-cs.md) sets register, casing, typography and aspect.
Neither catches the failure that actually makes transcreated Czech read
translated: strings that are grammatical, glossary-compliant, correctly formal —
and still shaped like English.

Because `/i18n-translate` Pass B **requires every finding to cite an anchor**, a
repo with no constructions file reports those strings **clean**. Every rule
below has an **ID** for Pass B to cite.

## Provenance

House authority: the **Microsoft Czech localization style guide**
(<https://learn.microsoft.com/globalization/reference/microsoft-style-guides>).
One authority, not mixed row by row — Mozilla's Czech l10n guide reaches for
`jenž`/`avšak` where Microsoft rules them out as too formal, and both are
internally right. Where this catalog's own usage overrules the authority, the
rule says so **and shows the count that decided it**.

## ⚠ STATUS — validated 2026-08-05 against 3 286 cs/en pairs (`scripts/i18n-audit.mjs`)

Unlike its sibling `constructions-en.md`, this file is **not** a bootstrap.
Every rule in Part 1 carries a measured count and a ✗/✓ pair taken from this
repo's own catalog. Part 2 holds decisions that are **parked, not swept**.
Part 3 records what was checked and found clean, so a later run does not
re-invent a rule this catalog does not violate.

One caveat that shapes the whole file: **Czech was the authored source until
2026-08-05**, so classic English-interference defects are largely *absent* —
the Czech was written by a Czech speaker, not translated. That is why Part 1 is
short and Part 4 is explicitly marked unvalidated. The interference rules earn
their evidence on the *next* wave, when Czech starts being derived from English
for the first time.

---

# Part 1 — validated rules

## CS-REGISTER · vykání, without exception

> **Trigger** — any English second person (`you`, `your`, an imperative).
> **Rule** — formal 2nd-person plural throughout. English has one "you" and
> gives the translator no signal, so this leaks silently: a single string
> written in *tykání* reads as a different product speaking.
> **Authority** — Microsoft cs: consistent formal address in professional
> products. Reinforced by [`style-cs.md`](./style-cs.md) § Register.
> **Evidence** — 145 strings use vykání; **7 use tykání**. The minority is
> the defect.

```
✗ Tip: vyber období a klikni na Analyzovat data.      (PerformanceAnalyst.emptyHint)
✓ Tip: vyberte období a klikněte na Analyzovat data.

✗ Tvůj Google účet nemá přístup…                      (AdsAccountPicker.noAccess)
✓ Váš účet Google nemá přístup…

✗ Zkus to prosím znovu.                               (AccountSecurity.revokeError)
✓ Zkuste to prosím znovu.                             (the form 19 sibling strings already use)
```

All seven sites: `PerformanceAnalyst.emptyBody`, `PerformanceAnalyst.emptyHint`,
`AccountSecurity.revokeError`, `AccountSecurity.deleteRequested`,
`InventoryBudgetActions.explain`, `MonthlyReport.idle`,
`AdsAccountPicker.noAccess`.

> **EXCEPTION — quoted speech is not address.** `ai-asistent.approachIntro`
> renders `LLM tu není kouzlo „napiš mi něco"` — *tykání inside quotes*, because
> it quotes a user talking to a model, not the product talking to the user.
> Found by over-applying this rule; do not "fix" it. Any quoted utterance,
> sample prompt or persona line is out of scope.

## CS-ASPECT · button ≠ progress ≠ result — and the house overrules Microsoft

> **Trigger** — an English label, an `-ing` progress string, or a past-tense
> result for the same verb.
> **Rule** — three distinct Czech forms, kept consistent within a component:
> **button** = imperfective infinitive (`Generovat`, `Uložit`, `Exportovat CSV`);
> **progress** = 1st person singular present + `…` (`Generuji…`, `Ukládám…`);
> **result** = short participle (`Hotovo`, `Uloženo`, `Zkopírováno`).
> English collapses all three onto one stem, so a mechanical rendering
> produces the wrong one — this is the single most reliable tell.

```
en  Generate AI copy  →  Generating…      →  Saved
✗   Generovat AI texty →  Generování…      →  Uložit
✓   Generovat AI texty →  Generuji…        →  Uloženo      (CatalogModule, verbatim)
```

> **HOUSE OVERRULES THE AUTHORITY.** Microsoft cs prefers the impersonal verbal
> noun for progress (`Generování…`, `Načítání…`). This catalog uses **1st person
> singular 65 times** against **12** verbal nouns. The product speaks in the
> first person and has done so consistently since it was authored in Czech —
> adopting Microsoft's form would rewrite 65 strings to match 12. Counted before
> adopting, per [`lessons-i18n.md`](./lessons-i18n.md) § 4.

## CS-COUNT · there is no plural mechanism — phrase around it

> **Trigger** — an English string with `{n}` and a countable noun.
> **Rule** — `interpolate()` has no plural branching (see `contract.md`), so one
> Czech string must survive n = 1, 2–4 and 5+. Do not translate the English
> noun phrase directly; restructure so the noun is count-invariant, or lead with
> a verb that carries the number.

```
en  {n} keywords ready
✗   {n} klíčová slova připravena          (correct only for n = 2–4)
✓   {n} klíčových slov připraveno         (ContentPipeline.keywordsParsed)

en  {n} generations left today.
✗   {n} generování zbývají dnes.
✓   Zbývá {n} generování dnes.            (AiPreflight.lowRemaining — verb first, noun invariant)
```

`czPlural(n, one, few, many)` exists in `src/lib/format.ts` for call sites that
genuinely need three forms (alert titles). It is **not** wired into
`interpolate` — reaching for it means changing the call site, so flag rather
than fake it.

## CS-COPULA · English drops the verb, Czech does not

> **Trigger** — an English appositive or verbless fragment (`each a real
> product surface`, `one column = one sync`, `X — a skeleton the writer fills in`).
> **Rule** — English happily builds a noun phrase in apposition. Czech needs the
> finite verb, or a relative clause, or the sentence dangles with an adjective
> agreeing with nothing.

```
en  The case study in four stops — each a real product surface, grounded in
    the same client data.
✗   Případová studie ve čtyřech zastávkách — každá reálná část produktu,
    opřená o stejná klientská data.
✓   Případová studie ve čtyřech zastávkách — každá je reálná část produktu,
    opřená o stejná klientská data.       (Crossroad.note, verbatim)
```

## CS-LEFTOVER · English sitting in the cs column

> **Trigger** — a `cs` value byte-identical to its `en` value.
> **Rule** — many matches are legitimate (the Do-Not-Translate list: ROAS, PNO,
> CPC, SKU, ARPU, PMax, product names, and `design-system/page.tsx`, an internal
> component gallery listing type names). Run `node scripts/i18n-audit.mjs`,
> which applies that filter. What survives it is either a gap or a term decision.

**FIXED 2026-08-05 — ten real gaps, the Czech simply was never written:**

| key | was stuck in English | now |
|---|---|---|
| `Composer.draftFailed` | "Draft failed." | "Návrh se nezdařil." |
| `Composer.saveFailed` | "Save failed." | "Uložení se nezdařilo." (matches 7 siblings) |
| `Composer.serverError` | "Could not reach the server." | "Server je nedostupný." |
| `PostsList.deleteAriaLabel` | "Delete" | "Smazat" |
| `PostsList.scheduledAt` | "scheduled for {dt}" | "naplánováno na {dt}" |
| `PostsList.publishedAt` | "published {rel}" | "zveřejněno {rel}" |
| `PostsList.createdAt` | "created {rel}" | "vytvořeno {rel}" |
| `PostsList.link` | "link" | "odkaz" |
| `ActivityFeed.exportCsv` | "Export CSV" | "Exportovat CSV" |
| `CampaignTable.exportCsv` | "Export CSV" | "Exportovat CSV" |

The last two were also CS-ASPECT violations: a button takes the infinitive.

**45 findings remain**, in 22 files. They are *term decisions*, not gaps — see
[`review-cs.md`](./review-cs.md). The largest cluster (12, in
`ContentBriefGenerator.tsx`) is not UI at all: `copyTitle`, `mdOutlineHeading`
and friends are the **field labels of an exported clipboard/Markdown document**.
Whether an export written by a Czech user should carry Czech or English headings
is a product decision, and it is the reason this rule cannot simply be swept.

## CS-TERM-DRIFT · one concept, one Czech word

> **Trigger** — a term already decided in [`glossary.md`](./glossary.md).
> **Rule** — two renderings of one concept is a `terminology` error even when
> both are good Czech. Check the glossary before inventing; add the row when you
> decide one. `Export CSV` / `Exportovat CSV` above is the live instance.

---

# Part 2 — parked house decisions (do NOT half-sweep)

Each has real evidence and a real authority behind it, and each would touch
enough sites that a partial application is worse than none —
[`lessons-i18n.md`](./lessons-i18n.md) § 6. **Decide once, sweep once.**

## CS-DASH · the em dash is not Czech punctuation — 258 sites

> Czech typographic norm (ČSN 01 6910) sets the *pomlčka* as the **en dash `–`
> with spaces**. This catalog uses the **em dash `—`, spaced, 258 times** in the
> `cs` column (against 3 en dashes), and the `en` column uses it 273 times —
> the counts travel together, which `lessons-i18n.md` § 3 names as the tell.
>
> **This contradicts [`style-cs.md`](./style-cs.md) § Typography, which
> currently endorses `—` for Czech.** Two artifacts cannot both be citable.
> Resolving it is one scripted pass (`—` → `–` in cs values only) plus one edit
> to the style guide. **Blocked on the owner's call**, because it is 258 visible
> strings and the existing usage is deliberate and consistent.

## CS-PROSIM · "prosím" tracks English "please" 1:1 — 20 sites

> 20 Czech strings contain `prosím`; 21 English strings contain `please`. Czech
> UI convention (and Microsoft cs) uses `prosím` far more sparingly than English
> — it is near-obligatory politeness in English error copy and optional in
> Czech. `style-cs.md` cites "Zkuste to prosím znovu." approvingly, so this is
> again house-vs-authority, not a clear defect. Park.

## CS-NOUNMOD · `Google Ads účet` is English word order — 11 vs 5, split

> Czech attaches a brand name **after** the noun (`účet Google Ads`); putting it
> in front is the English noun-modifier calque. The catalog is genuinely split:
> **11 English-order** (`Sklik účtu` ×4, `Google Ads účet` ×2, `Google Ads
> účty`/`účtů`/`účtu`, `Google účet`, `Sklik účet`) against **5 Czech-order**
> (`účet Google Ads` ×3, `účty Google Ads` ×2). The calque is the *majority*,
> so a sweep changes 11 strings to match 5.
>
> Both forms occur in real Czech PPC writing, which is why this is parked rather
> than fixed. Found while fixing `AdsAccountPicker.noAccess` under CS-REGISTER —
> the word-order half of that edit was **reverted** so this rule would not ship
> as a 1-of-11 half-sweep.
>
> **EXCEPTION — `AI` is not a brand, it is an indeclinable adjective.**
> `AI vyhodnocení` (12), `AI texty` (4), `AI návrh` (2), `AI report` (2) are
> established, idiomatic house usage and are **not** in scope for this rule. Do
> not "correct" them to `vyhodnocení AI`.

## CS-CLICK · "klikněte na" assumes a mouse — 19 sites

> Microsoft cs prefers the device-neutral `vyberte` over `klikněte na`, which
> is wrong on touch and for keyboard/AT users. 19 sites, tracking English
> "click" (21). A real accessibility argument, but a uniform voice change.
> Park — and note the *tykání* instance among them is already covered by
> CS-REGISTER and should be fixed there regardless of how this lands.

---

# Part 3 — checked, and NOT a rule in this catalog

Recorded so a later run does not re-invent them. Each was measured against all
3 286 pairs and found clean; a rule with no evidence invites churn on strings
that were already fine.

| Candidate rule | Measured | Verdict |
|---|---|---|
| Genitive noun chains (3+ stacked) | **0** | Not present. Do not add. |
| `je možné` / `je nutné` (English "it is possible/necessary") | **0** | Not present. |
| `pomocí` as a calque of "by means of" | **0** | Not present. |
| Anthropomorphism ("the app wants…") | **0** | Not present. |
| `umožňuje` for "allows you to" | **0** | Not present (English side: 0 too). |
| Possessive overuse | cs 57 vs en 113 `your` | Czech already drops ~half. Compliant. |
| Straight quotes in cs | 2 of 51 | Effectively compliant; the 2 are a typography-script fix, not a rule. |
| Three-dot `...` instead of `…` | **0** of 140 | Fully compliant. |
| Passive `je/jsou` + participle | 7 | Below the noise floor; not systematic. |

---

# Part 4 — preventive rules · ⚠ UNVALIDATED

These describe English→Czech interference that **has not happened yet**, because
Czech was the authored source until 2026-08-05. They are hypotheses for the
first transcreation wave. **The wave's job is to replace each invented example
with a real one — or delete the rule.** Do not cite one in Pass B until it has
a real ✗/✓ pair from this catalog.

## CS-NOMINAL · unstack English noun piles into finite verbs ⚠

> **Trigger** — an English compound noun phrase used as a label or heading.
> **Rule** — the headline Czech rule in the reference run
> ([`lessons-i18n.md`](./lessons-i18n.md) § 1): Czech prefers a conjugated verb
> where English stacks nouns. Note this is **inverted in French** — the rule does
> not transfer, and neither does its opposite in `constructions-en.md`
> (EN-VERBAL), which is the same observation pointed the other way.

## CS-ARTICLE-GHOST · `the`/`a` translate to nothing ⚠

> **Trigger** — an English determiner.
> **Rule** — Czech has no articles. Rendering `the` as `ten`/`tento` or `a` as
> `nějaký` is the most visible mark of machine Czech. Definiteness is carried by
> word order and context; drop the determiner.

## CS-YOU-DROP · English needs the pronoun, Czech has it in the ending ⚠

> **Trigger** — English `you`/`your` in instructional copy.
> **Rule** — Czech verb endings already encode person, and possession is
> obvious from context. `Vaše kampaně se načítají` is usually just
> `Kampaně se načítají`. Keep `váš` only where ownership is genuinely
> contrastive (yours vs. a competitor's). The catalog already does this well
> (Part 3) — this rule exists to keep it that way once English is the source.

---

## Harvest protocol

A native rejection that no ID above explains is **a new row here**, not a
one-off fix. So is an exception found by over-applying a rule and having to
revert — CS-REGISTER's quoted-speech carve-out is one, and it was found exactly
that way. This is the only mechanism by which one review session pays for the
strings nobody will ever read twice.
