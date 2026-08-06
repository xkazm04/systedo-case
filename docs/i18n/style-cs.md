# Czech voice guide — systedo-case

`cs` is the **target** locale (see `contract.md` — reversed 2026-08-05):
transcreated from the finished `en` value, through the glossary, this guide,
[`constructions-cs.md`](./constructions-cs.md) and
[`exemplars-cs.md`](./exemplars-cs.md).

Calibrated from the existing `cs` values across the sampled catalog. Those
values are strong evidence of *voice* — they were authored by a Czech speaker —
but they are no longer the source of truth for *content*: where a cs string and
its en counterpart disagree about what the control says, `en` decides.

This document settles register, casing, typography and aspect. It does **not**
settle sentence shape — that is `constructions-cs.md`, and it is the artifact
that catches the strings which satisfy every rule here and still read
translated.

## Register

**Professional B2B marketing tool. Formal address — vykání throughout.**
Every imperative/instruction in the sampled catalog uses the 2nd-person-plural
formal form: "Zkuste to prosím znovu.", "Přihlaste se prosím znovu.",
"Zkontrolujte pole a zkuste to znovu.", "Vítejte! Pojďme naplnit aplikaci
vaší firmou". Never switch to *tykání* (ty-form), even on candidate-adjacent
or celebratory copy ("Hotovo — aplikace mluví vaší firmou" stays formal, not
"Hotovo, tvoje aplikace mluví za tebe").

## Casing

**Sentence case, not Title Case.** "Kvalifikace leadu", "Žebříček pozic
klíčových slov", "Historie diagnóz" — only the first word and proper nouns
(Google Ads, Sklik, Adamant) are capitalized. Never cap every word of a
heading the way English UI chrome sometimes does.

## Typography

- **Quotes**: `„…“` — **U+201E** opening, **U+201C** closing (ČSN 01 6910).
  Never straight `"…"`, and never the English closer U+201D `”`. Codepoints,
  not shapes: this line previously *showed* a straight ASCII quote while its
  prose said "high-9 closing", so the artifact contradicted itself and a
  reviewer citing it could not tell which glyph was meant. Measured over
  catalog values the repo is **51 : 0** on U+201C — fully consistent; the only
  two offenders were runtime-built template literals in
  `lib/lead-quality/compute.ts`, which a static scan of locale tables cannot
  see. Note English is the mirror image (`“…”`, U+201C then U+201D) — a blind
  find-and-replace across both columns breaks the English.
  Precedent: `footerDet`: `Klikněte na „Generovat AI texty" pro on-brand
  verzi…`. Also used for a change confirmation: `Změníme typ projektu na
  „{type}"`.
- **Ellipsis**: the real `…` character, never three periods. Precedent
  throughout progress/status copy: "Generuji…", "Ukládám…", "Skenuji web…",
  "Připravuji…".
- **Dashes: avoid them.** ⚠ **HOUSE RULE, decided 2026-08-06 — this reverses
  what this guide previously said.** A dash is not how ordinary written Czech
  is punctuated; it reads as machine-written copy. The em dash `—` is not a
  Czech character at all (ČSN 01 6910 sets the *pomlčka* as the en dash).
  **Default to no dash.** Recast, in this order:
  1. **Full stop** when the halves are independent statements.
     `Hotovo — aplikace mluví vaší firmou` → `Hotovo. Aplikace mluví vaší firmou.`
  2. **Colon** when the second half explains or introduces the first.
  3. **Comma** for a simple appositive or subordinate clause.
  4. **Parentheses** for a true aside.

  **Only when none of those works** — a genuine single beat of contrast that
  parentheses would over-weight — use a **spaced en dash ` – ` (U+2013)**.
  **Never the em dash `—` (U+2014).**

  **Out of scope, do not touch:** the standalone `"—"` **no-data placeholder**
  (92 sites, produced by `createFormatters`) is a design-system glyph meaning
  "no value", not punctuation; numeric and date ranges keep their own
  separator; and `·` middots stay as they are.
- **Decimal comma, space-separated thousands**: "≥ 3,0×", "1 000 otevření",
  "90 dní". Never a decimal point or comma-thousands in cs copy — but this is
  almost always produced by `createFormatters("cs")` (`src/lib/format.ts`),
  not hand-typed; only hand-type a number in cs copy when it's a fixed
  constant unrelated to project data (e.g. "TOP 3", "3×").
- **NBSP** before a unit or a multi-character symbol that must not wrap alone
  onto the next line ("12 měs.", "3,0×", "1 000 Kč") — use `&nbsp;`/` `
  in colocated copy where the value and unit are hand-typed together, not
  produced by a formatter.

## Number agreement — no plural mechanism (see `contract.md`)

`interpolate()` has no plural branching, so one `cs` string must read
correctly (or at least not glaringly wrong) for every `{n}`. The existing
catalog's strategy, in order of preference:

1. **Genitive-plural-as-default**, accepted as a known simplification:
   `ariaLabelUnread: "Upozornění ({n} nepřečtených)"` reads slightly off for
   `n=1` ("1 nepřečtených" instead of "1 nepřečtené") but is the established
   pattern for badge/counter copy — don't "fix" it into a broken plural
   system with new keys unless the surface specifically warrants it.
2. **Count-invariant units**, the preferred new pattern: `"{n} ks"` (kusů/kusy
   → invariant abbreviation "ks"), `"{n}/3 polí"`, `"{n}/7 témat"` — the
   number carries the meaning, the noun is either abbreviated or already
   genitive-plural-invariant.
3. **Verbal-noun / process framing** sidesteps agreement entirely:
   `"Generuji {done}/{total}… ({failed} chyb)"` reads naturally regardless of
   count because it's a live progress readout, not a countable noun phrase.
4. If a surface genuinely needs 1 / 2–4 / 5+ Czech forms (rare — most UI
   counters tolerate the genitive-plural default), **flag it**; per the
   contract, don't fake a plural with string concatenation.

## Aspect: buttons vs. progress/status

Czech verbal aspect marks whether an action is a one-off ask or already under
way — get this right, it's a common tell of a non-native translation:

- **Button / CTA (imperfective infinitive or imperative, not yet started)**:
  "Naplánovat", "Generovat AI texty", "Vzít na vědomí", "Zkusit znovu",
  "Exportovat CSV".
- **In-progress status (present progressive, -ing sense via the finite verb)**:
  "Generuji…", "Ukládám…", "Skenuji web…", "Měním…", "Připravuji…" — first
  person singular present, paired with the ellipsis, distinct from the
  button's infinitive.
- **Completed / result state (past participle or short adjective)**:
  "Hotovo", "Zkopírováno", "Uloženo", "Navštíveno", "Vyřešeno".

Keep all three forms of the same verb consistent across a single component's
button → status → result cycle (see `CatalogModule`: "Generovat AI texty" →
"Generuji…" → "Zkopírováno"/"Uloženo").

## Loanword policy

Decide per term **in `glossary.md`**, not ad hoc. Established loanwords in
this catalog: "lead", "brief", "case study", "Asset group" (verbatim, inside
otherwise-Czech copy), all marketing-metric abbreviations (PNO, CAC, ROAS,
CPC, …). When in doubt, check whether the existing catalog already rendered
the term once — precedent wins over a "more correct" fresh Czech coinage.

## Length discipline

Czech runs close to English length (unlike German/French, which the contract
notes run 20–35% longer) — don't over-budget space for cs. Chip/pill copy
stays as short as the English: "Hotovo", "Uloženo", "×{n}".

## Tone

Calm, direct, competent — never exclamation-spam. The one exception in the
sample is a single first-run welcome ("Vítejte!"), which earns its `!` as a
one-time greeting; status, error, and result copy never use `!`. Errors are
plain and actionable, not alarmist: "Uložení se nepodařilo. Zkuste to prosím
znovu." — state what failed, then what to do, in two short sentences.
