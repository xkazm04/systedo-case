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
en  The case study in four stops. Each is a real product surface, grounded in
    the same client data.
✗   Případová studie ve čtyřech zastávkách. Každá reálná část produktu,
    opřená o stejná klientská data.
✓   Případová studie ve čtyřech zastávkách. Každá je reálná část produktu,
    opřená o stejná klientská data.       (Crossroad.note, verbatim)
```

> *Quote refreshed 2026-08-06.* This pair originally used an em dash where the
> full stop now sits; the CS-DASH sweep recast it, and the en column gained the
> copula `is` for the same reason the cs one always had `je`. **The rule is
> unaffected** — that is the point: CS-COPULA is about the missing verb, not the
> punctuation around it, and the defect survives every choice of separator.

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
| `Composer.serverError` | "Could not reach the server." | "Nepodařilo se spojit se serverem." ⚠ |
| `PostsList.deleteAriaLabel` | "Delete" | "Smazat" |
| `PostsList.scheduledAt` | "scheduled for {dt}" | "naplánováno na {dt}" |
| `PostsList.publishedAt` | "published {rel}" | "zveřejněno {rel}" |
| `PostsList.createdAt` | "created {rel}" | "vytvořeno {rel}" |
| `PostsList.link` | "link" | "odkaz" |
| `ActivityFeed.exportCsv` | "Export CSV" | "Exportovat CSV" |
| `CampaignTable.exportCsv` | "Export CSV" | "Exportovat CSV" |

The last two were also CS-ASPECT violations: a button takes the infinitive.

> ⚠ **`Composer.serverError` is the cautionary one.** The 2026-08-05 fill wrote
> "Server je nedostupný." — good Czech, and **1 of 17** against 16 sites already
> reading "Nepodařilo se spojit se serverem." for the byte-identical English. A
> wave-2 reviewer caught it; corrected 2026-08-06.
>
> **Filling a leftover is a terminology decision, not a translation.** Before
> writing a value into an empty column, grep the catalog for the *English* string
> and adopt whatever the siblings already say. Inventing a fresh rendering
> creates the drift this file exists to catch — and it is harder to spot than the
> gap it replaced, because the audit only sees `cs === en`.

**45 findings remain**, in 22 files. They are *term decisions*, not gaps — see
[`review-cs.md`](./review-cs.md). The largest cluster (12, in
`ContentBriefGenerator.tsx`) is not UI at all: `copyTitle`, `mdOutlineHeading`
and friends are the **field labels of an exported clipboard/Markdown document**.
Whether an export written by a Czech user should carry Czech or English headings
is a product decision, and it is the reason this rule cannot simply be swept.

## CS-DASH · don't punctuate with a dash at all; if you must, use the en dash

> **Trigger** — any `—` or `–` used as punctuation inside a sentence.
> **Rule** — **decided by the owner, 2026-08-06.** A dash is not how ordinary
> written Czech is punctuated, and the em dash `—` is not a Czech character
> (ČSN 01 6910 sets the *pomlčka* as the en dash). Constant dashes read as
> machine-written copy. **Default to no dash**: recast with a full stop, colon,
> comma or parentheses, in that order of preference. Only a genuine single beat
> of contrast that parentheses would over-weight keeps a dash, and then it is a
> **spaced en dash ` – ` (U+2013)** — never `—`.
> **Applies to both columns**, so cs and en punctuate alike.
> Full decision procedure and examples: [`style-cs.md`](./style-cs.md) §
> Typography and [`style-en.md`](./style-en.md) § Punctuation.

```
en  Done — the app speaks your business        ✓ Done. The app now speaks your business.
cs  Hotovo — aplikace mluví vaší firmou        ✓ Hotovo. Aplikace mluví vaší firmou.
```

> **OUT OF SCOPE — do not touch.** The standalone `"—"` **no-data placeholder**
> is a design-system glyph meaning "no value", produced by `createFormatters`
> at 92 sites and pinned by `test-unit/format-golden.test.mjs`. It is not
> punctuation. Numeric/date ranges and `·` middots are likewise untouched.
>
> **This rule replaced its own opposite.** Both style guides previously
> *endorsed* the em dash, which is why the finding sat parked as A1 for two
> waves: two artifacts said contradictory things and neither was citable. The
> lesson is in the shape of the fix — a contradiction between artifacts does not
> resolve itself by picking the one you happen to open first.

## CS-FALSEMAP · the literal equivalent is a real Czech word that says something else

> **Trigger** — an English word with an obvious Czech counterpart, in a
> collocation where that counterpart shifts the meaning.
> **Rule** — distinct from CS-LEFTOVER (untranslated English) and from
> CS-NOMINAL (structure, not lexis). The output is fluent, correctly declined
> Czech that states a *different fact*. Nothing in a glossary or a style guide
> catches it, because each word in isolation is right.
> **Harvested 2026-08-06** from the campaigns wave; all four verified in-catalog.

```
en  Health timeline across {n} syncs
✗   Časová osa zdraví portfolia přes {n} synchronizací     ("more than {n} syncs")
✓   Časová osa zdraví portfolia z {n} synchronizací        (HealthTimeline.chartAria)

en  Sign in and connect a Google Ads account to apply moves.
✗   …připojte účet Google Ads pro aplikaci.                ("for the app")
✓   …připojte účet Google Ads pro aplikaci přesunů.        (BudgetMoves.signIn)

en  Grounds the AI report (who the client is)…
✗   Grunduje AI report…            (dialectal Germanism for "founds"; 1 occurrence in all of src)
✓   Ukotvuje AI report…            (ReportSettings.profileHint — matches CompareSeoTable.anchorTitle)
```

`přes` + a numeral is the highest-yield instance: it silently converts an exact
count into "more than", and it survives every other check in this file.

## CS-NOMINAL · unstack English noun piles — usually with a case, not a verb

> **Trigger** — an English compound noun phrase used as a label, heading or
> placeholder.
> **Rule** — English stacks bare nouns; Czech must mark the relationship, almost
> always with a **genitive or a preposition**. The stacked form is grammatical
> Czech and says nothing — it is the purest instance of "passes every check and
> still reads translated".
> **VALIDATED 2026-08-06** by the content-modules wave; three real pairs:

```
en  project management tool                    (placeholder)
✗   např. projektové řízení nástroj            ✓ např. nástroj na řízení projektů
                                                  LpExperimentsManager.clusterPlaceholder

en  Winner ({conf} confidence)
✗   Vítěz ({conf} jistota)      → shipped as "Vítěz (95,0 % jistota)"
✓   Vítěz (jistota {conf})                        LpExperimentsModule.winner

en  ~{n} visitors/variant before…
✗   ~{n} návštěvníků/varianta než…             ✓ ~{n} návštěvníků na variantu, než…
                                                  LpExperimentsModule.needVisitors
```

> **CORRECTED — the original rule text said "into finite verbs".** That came
> from the reference run in [`lessons-i18n.md`](./lessons-i18n.md) § 1 and is
> wrong for this catalog: **none** of the three real instances wanted a verb;
> all three wanted a case or a preposition. Gold exemplar #2
> (`Keyword ranking ladder` → `Žebříček pozic klíčových slov`) was already
> showing the genitive form. Reach for a finite verb only when the English is
> itself a nominalised action.
>
> Still **inverted in French** (Microsoft's French guide prefers noun forms over
> English's verbs), and `constructions-en.md` § EN-VERBAL is this same
> observation pointed the other way. Rules do not transfer between locales.

## CS-TERM-DRIFT · one concept, one Czech word

> **Trigger** — a term already decided in [`glossary.md`](./glossary.md).
> **Rule** — two renderings of one concept is a `terminology` error even when
> both are good Czech. Check the glossary before inventing; add the row when you
> decide one. `Export CSV` / `Exportovat CSV` above is the live instance.

---

# Part 2 — ✅ ALL RULED 2026-08-06 — kept as evidence, not as questions

Every decision below was parked for an owner ruling and every one has now been
answered. The rulings live in [`glossary.md`](./glossary.md) § "Owner rulings";
the sections here are retained because they carry the *measurements* that made
each call decidable, and a future run will want the counts.

| Rule | Ruling | Sites |
|---|---|---|
| **CS-DASH** | Promoted to Part 1. No dash punctuation; en dash only as a last resort. | ~715 |
| **CS-PROSIM** | **Keep `prosím`.** Natural, consistent Czech; Microsoft's sparser preference is not a defect here. | 20 (unchanged) |
| **CS-CLICK** | **Sweep to `vyberte`.** Device-neutral: `klikněte` is wrong on touch and for keyboard/AT users. | 19 |
| **CS-NOUNMOD** | **Sweep to `účet Google Ads`.** Czech postposes a brand attribute. `AI vyhodnocení` etc. stay — `AI` is an indeclinable adjective, not a brand modifier. | **21**, not the 11 filed |
| **CS-PREP-REPEAT** | **Dissolved by the A5 rebrand.** The head term changed, so the stacked `pro … pro` never arises; the audience clause is now a genitive. | 2 |
| **CS-SVO-AMBIG** | **Sweep to an explicit passive** (`jsou hodnoceny sourozeneckým modelem`). The OVS rendering default-read backwards. | 2 |

**What the ruling round taught, beyond the answers:** two of these were framed
wrongly while parked. **CS-DASH** was filed as "em dash → en dash, one scripted
pass" and came back as an editorial rule that made the glyph swap irrelevant.
**CS-PREP-REPEAT** was filed as needing its own fix and was dissolved by a
decision on a different entry. *Re-read a parked question when the answer
arrives — the plan filed alongside it may no longer be the plan.*

## ~~CS-DASH~~ · DECIDED 2026-08-06 — promoted to Part 1, see below

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
| **CS-QUOTE** — straight `"` closing a `„…"` pair | **0** of 51 | **Rejected 2026-08-06.** Proposed as a new rule with "~10 UI sites" of evidence. Re-measured against catalog *values*: zero. Every cited site was a **code comment** (`primitives.tsx:423`, `ChannelTable.tsx:68`, `PeriodHeader.tsx:44`, `ChannelsSection.tsx:64`), where the glyph is irrelevant. The one real instance (`TwinChannels.intro`) was fixed and the class is now empty. **Grep source files and you will re-derive this false rule; grep catalog values and it disappears.** Use `scripts/i18n-audit.mjs`. |

## CS-PREP-REPEAT · the Czech modifier collides with the sentence's next preposition — 2 sites

> English stacks bare nouns (`AI ad intelligence`) then attaches a
> prepositional phrase (`for e-shops and agencies`). Czech must render the
> modifier prepositionally too (`pro reklamu`), which runs straight into the
> second `pro`. Stacked identical prepositions (*hromadění předložek*) is a
> recognised Czech stylistic fault, and this is exactly the interference route
> Part 4's CS-NOMINAL predicts — the first real evidence for it.
>
> ```
> en  AI ad intelligence for e-shops and agencies — measure performance, …
> ✗   AI inteligence pro reklamu pro e-shopy a agentury — měřte výkon, …
> ```
> `BrandLanding.heroSubhead` · `LandingBolder.heroSubhead`
>
> **Parked because every fix trades one defect for another.** The genitive
> (`pro reklamu e-shopů a agentur`) shifts ownership of the ads — wrong for an
> agency, which runs its *clients'* ads. `AI reklamní inteligence pro e-shopy a
> agentury` reads cleanly but changes the head term — and the head term is
> itself split and frozen (review-cs.md § A5). Owner picks the phrasing, then a
> 2-site sweep.

## CS-SVO-AMBIG · Czech case syncretism makes an English passive parse backwards — 2 sites

> **Trigger** — an English passive with a by-agent (`X is graded by Y`).
> **Rule** — Czech nominative and accusative are identical for many noun
> classes, so an object-first rendering default-parses as subject-first: the
> sentence states the *opposite* of the source.
>
> ```
> en  Anthropic-family models (claude-*) are graded by a sibling model
> ✗   modely rodiny Anthropic (claude-*) hodnotí sourozenecký model
>     (default reading: "…models grade a sibling model" — backwards)
> ```
> `ByomQualityOverview.selfJudge` · `ByomQualityMatrix.selfJudge`
>
> Parked, not fixed: whether surrounding context disambiguates enough is a
> native's call. If it does not, the fix is an explicit passive
> (`jsou hodnoceny sourozeneckým modelem`).

---

# Part 4 — preventive rules · ⚠ UNVALIDATED

These describe English→Czech interference that **has not happened yet**, because
Czech was the authored source until 2026-08-05. They are hypotheses for the
first transcreation wave. **The wave's job is to replace each invented example
with a real one — or delete the rule.** Do not cite one in Pass B until it has
a real ✗/✓ pair from this catalog.

## ~~CS-NOMINAL~~ · promoted to Part 1 on 2026-08-06 — see below

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
