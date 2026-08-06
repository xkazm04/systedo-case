# Gold en→cs pairs — register by demonstration

Eight pairs, one per string class, harvested **verbatim** from this catalog's
3 286 cs/en pairs on 2026-08-05. A style guide *describes* the voice; these *demonstrate* it. When
transcreating a new string, write toward the pair from its class.

`cs` is the target locale (see [`contract.md`](./contract.md)). Every pair below
was authored by a Czech speaker while Czech was still the source — which is
exactly what makes them worth keeping as the target's calibration.

Keep this file at ~8. Replace a pair only when a better one ships.

---

## 1 · Button / CTA — `CatalogModule.generateAi`

```
en  Generate AI copy
cs  Generovat AI texty
```

**Why** — a button takes the **infinitive**, not a verbal noun: `Generování`
is a heading, not a control. The same component's progress string is
`Generuji…` and its result is `Uloženo` — the three forms of one verb, kept
distinct (CS-ASPECT).

> **CORRECTED 2026-08-06.** This pair originally added "not `Vygenerovat`
> (perfective)". That was wrong, and two agents independently caught it by
> counting before applying: the catalog runs **13 `Vygenerovat*` against 4
> `Generovat*`**, and all four of the minority are in `CatalogModule` — the very
> file this exemplar was harvested from. The exemplar was generalising one
> component into a house rule.
>
> **The real rule is contextual, and both forms are correct Czech:**
> imperfective `Generovat` for an ongoing or repeatable activity (`Generovat AI
> texty` — a batch you re-run over a feed), perfective `Vygenerovat` for
> producing **one** artifact on demand (`Vygenerovat souhrn`, `Vygenerovat AI
> odpověď`, `Vygenerovat vizuál`). Pick by what the button does, not by this
> pair. Do not sweep either form toward the other.

## 2 · Heading — `RankLadder.title`

```
en  Keyword ranking ladder
cs  Žebříček pozic klíčových slov
```

**Why** — sentence case, and the English noun stack is unpacked into a Czech
genitive chain that actually says what it means: *ladder of positions of
keywords*. `žebříček` for the leaderboard framing, `pozice` for an individual
rank — the glossary split, applied. A literal `Klíčové slovo hodnotící žebřík`
would be grammatical and meaningless.

## 3 · Tooltip — `ByomKeys.fingerprintUnknownTitle`

```
en  This key was stored before we began keeping its last 4 characters. We never
    decrypt a key just to display it — replace the key to make it identifiable.
cs  Tento klíč byl uložen dřív, než jsme začali ukládat poslední 4 znaky. Klíč
    nikdy nedešifrujeme jen kvůli zobrazení — identifikaci uvidíte po nahrazení
    klíče.
```

**Why** — a tooltip earns full sentences. Note what moved: English ends on the
purpose clause (*to make it identifiable*), Czech fronts the outcome
(*identifikaci uvidíte*) because Czech marks focus by position. Same meaning,
Czech information order. The security claim ("we never decrypt") stays exact —
this is a promise, not marketing.

## 4 · Error / status — `SaveToLibrary.failed`

```
en  Saving failed.
cs  Uložení se nezdařilo.
```

**Why** — calm, impersonal, no blame and no alarm. The reflexive `se nezdařilo`
is the house form: measured **in this catalog**, `nezdařil*` 36 + `nepodařil*`
39 = 75 sites, against **0** for Microsoft's suggested `nepovedlo` (`selhal*`
takes a further 19, mostly terse status chips). Adopting the authority's token
here would introduce a word this product has never used — the exact trap in
[`lessons-i18n.md`](./lessons-i18n.md) § 4, re-checked rather than inherited.
Where the surface can offer a next step, the catalog appends exactly one:
`Uložení se nepodařilo. Zkuste to prosím znovu.` — state what failed, then what
to do, two short sentences.

## 5 · Empty state — transcreation, not translation — `ContentBriefGenerator.emptyBody`

```
en  Enter a topic and keyword. Gemini will prepare a title and meta within SEO
    limits, an H2 outline, FAQ and internal link suggestions — a skeleton the
    writer just fills in.
cs  Zadejte téma a klíčové slovo. Gemini připraví title a meta v SEO limitech,
    osnovu H2, FAQ i návrhy interních odkazů — kostru, kterou autor jen rozepíše.
```

**Why — this is the money example.** `fills in` → **`rozepíše`**, not `vyplní`.
A writer doesn't *fill in* an outline in Czech, they *write it out* — the verb
carries the actual act. And the English appositive `a skeleton the writer fills
in` becomes a relative clause `kostru, kterou autor jen rozepíše`, because Czech
will not leave that fragment hanging (CS-COPULA). Carry the rhythm, not the
words.

## 6 · Count / plural — `ContentPipeline.keywordsParsed`

```
en  {n} keywords ready
cs  {n} klíčových slov připraveno
```

**Why** — there is **no plural mechanism** in `interpolate()` (CS-COUNT), so one
string must survive n = 1, 2–4 and 5+. Genitive plural + the invariant short
participle `připraveno` does that. `{n} klíčová slova připravena` would be
correct only for 2–4 and wrong the rest of the time. Compare
`AiPreflight.lowRemaining`: `Zbývá {n} generování dnes.` — leading with the verb
is the other reliable escape.

## 7 · Public / marketing — `BrandLanding.heroTitle2`

```
en  Ads that never crack.
cs  Reklamy, které nepovolí.
```

**Why** — the brand is *Adamant*: unbreakable. `nepovolí` is "won't yield / won't
give way", which lands the same attitude in one Czech word and keeps the
sentence as short as the English. A literal `Reklamy, které nikdy nepraskají`
would be accurate and dead. Marketing copy is transcreated; UI chrome is
translated.

## 8 · Trust / consent — `AppSignInGate.trust`

```
en  No payment card · takes a minute to set up · delete anytime
cs  Bez platební karty · založení trvá minutu · kdykoli smažete
```

**Why** — three commitments, each verifiable, none softened. The middle clause
nominalizes (`takes a minute to set up` → `založení trvá minutu`) because that
is what fits a `·`-separated chip row; the third keeps the verb (`kdykoli
smažete`) because the user is the actor and that matters in a promise about
their data. Length discipline holds — Czech runs the same width as English here,
and this row cannot wrap.

---

## Classes not yet represented

**Legal / statutory.** The privacy policy and terms **are** localized — in
`LegalSections.tsx`'s `LEGAL_CONTENT` table, not a `T` table, which is why an
audit anchored on `const T` first reported them as 49 untranslated strings. They
are structured prose (`readonly LegalSection[]`), not flat strings, so no single
pair calibrates them. Add a ninth pair from that file only after a native has
read the Czech privacy copy end to end — legal register is the one class where
a wrong exemplar propagates real risk.
