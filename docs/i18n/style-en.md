# English voice guide — systedo-case

`en` is the **source** locale (see `contract.md` — reversed 2026-08-05): it is
written from the functionality, not from another string. This guide is the
voice it is written in. Calibrated from the existing `en` columns, which are
consistently strong — but note they were *derived from Czech*, so where this
guide and a shipped string disagree, the guide wins and the string is a
re-authoring candidate.

## Register

Same B2B professional tone as cs, but English doesn't need an explicit
formality marker — just avoid casual filler ("Hey!", "Oops!", "Awesome!").
Direct, competent, second person where natural ("Where do you want to go?"),
otherwise impersonal UI chrome ("Show more", "Clear").

## Casing

**Sentence case** everywhere, matching cs — resist the instinct to Title Case
English UI labels: "Keyword ranking ladder", "Lead qualification", "Diagnosis
history", not "Keyword Ranking Ladder". The only capitals are the first word
and proper nouns (Google Ads, PMax, PNO).

## Word order and calques

Don't mirror Czech sentence structure. Czech happily fronts the object or
drops the subject; English wants SVO and an explicit subject. E.g. cs
`Odvozeno z vašeho katalogu: příspěvky drží váš sortiment a slovník.` becomes
`Derived from your catalog: posts stay in your range and vocabulary.`, not
a passive-preserving `"Derived from your catalog is that posts hold your…"`.
*(Quote refreshed 2026-08-06: this example carried an em dash and the British
`catalogue`, both of which the live string has since lost — to the CS-DASH sweep
and to a US-spelling fix. **A guide that quotes the catalog verbatim goes stale
when the catalog moves**; re-check quoted examples after any sweep.)*
When cs uses a compact noun-phrase heading, prefer the equivalent English
noun phrase over a translated verb clause: `Žebříček pozic klíčových slov` →
`Keyword ranking ladder`, not `Ladder of keyword positions`.

## Punctuation

- Real ellipsis `…`, not `...`: "Generating…", "Saving…", "Scanning your
  website…".
- Curly quotes `“…”` (not straight), paired with cs's `„…"`:
  `“Let's grow together.”`, `Click "Generate AI copy"` in `footerDet` — keep
  this pairing whenever the cs source uses `„…"`.
- **Dashes: avoid them.** ⚠ **HOUSE RULE, decided 2026-08-06 — this reverses
  what this guide previously said.** The em dash is grammatical English, but a
  product that reaches for it constantly reads as machine-written, and this
  catalog reached for it 254 times. **Default to no dash.** Recast, in this
  order: **full stop** (independent halves) → **colon** (the second half
  explains the first) → **comma** (appositive) → **parentheses** (true aside).

  `Done — the app speaks your business` → `Done. The app now speaks your business.`

  **Only when none of those works** — a genuine single beat of contrast — use a
  **spaced en dash ` – ` (U+2013)**. **Never the em dash `—` (U+2014).**
  This is deliberately the same rule as cs, so the two columns punctuate alike.

  **Out of scope:** the standalone `"—"` no-data placeholder (a design-system
  glyph, 92 sites), numeric/date ranges, and `·` middots.

  **2026-09-14: fleet-wide operator decision, same rule.** The em dash is now
  banned in product copy across the whole fleet (registry rule EN-DASH, contract
  `dash.emDash: "ban"`). This house rule already said so; nothing here reverses.
  At adoption the English side still carried **106 em dashes** (and 24 en
  dashes); they are debt in `.ai/copy-baseline.json`, drained separately.

## Spelling: US English

**Ruled 2026-09-14 (operator, fleet-wide): US spelling, every surface** (registry
rule EN-SPELLING, contract `variant: "US"`). This supersedes the *parked*
EN-SPELLING note in [`constructions-en.md`](./constructions-en.md), whose measured
table stays there as history, and extends the 2026-08-06 `-ize` ruling
([`glossary.md`](./glossary.md), review-cs A6) to the rest of the variant:
`color`, `modeled`, `labeled`, `canceled`. Count at adoption: US 72 forms, UK 3
(`colour`, `modelled`, `labelled`). The 3 are baselined debt, not swept by the gate.

## Copy gate (native-copy)

Declared mechanics live in [`copy-contract.json`](./copy-contract.json); the
registry's `localization/english` subject owns the rule text, and this guide is the
delta. Curly quotes and `…` above are declared there too (EN-QUOTES, EN-ELLIPSIS);
sentence case is EN-CASE (4 of 307 judgeable headings were Title Case, so no
title-case element class exists).

- `npm run copy:check` reads only the **English** side: the `en` branch of each
  `const T = { cs, en }` dictionary, `src/lib/i18n/messages.ts`, and JSX text in
  `src/components/**` and `src/app/**`. It skips `cs` branches, the design-system
  page, the dev inspector, brand prototypes and the Czech opengraph image. Czech
  route `metadata` (the known mismatch in `contract.md`) and the Czech `EXAMPLE`
  sample inputs are still read and sit in the baseline.
- **It closes the English half of the dash rule.** `scripts/i18n-gate.mjs` tracks em
  dashes in the Czech column only; this gate blocks a new em dash in `en`.
- It exits 1 only on a new error-level finding; warnings print and never block. It
  runs in `.husky/pre-push` inside the master gate, after `check:ci` (so
  `SYSTEDO_SKIP_GATE=1` skips it too). It is **not** in `check:ci`, because the checker
  is a gitignored link to ai-registry that CI does not have. Without the link the
  hook prints `copy gate SKIPPED`. Install with `node scripts/link-registry.mjs
  --project systedo-case` from the registry.
- **Exceptions are visible, never bypassed.** A deliberate string goes into the
  baseline in its own commit whose message says why. A rule wrong for this catalog
  is turned `off` in the contract, with the reason recorded here. Never `--no-verify`.

## Numbers, dates, currency

`createFormatters("en")` → `en-US` / USD (`src/lib/format.ts`). **Never**
hand-type a formatted number, price, or date into an `en` string — keep the
placeholder (`{amount}`, `{n}`) and let the formatter render it. A hand-typed
constant unrelated to project data ("TOP 3", "3×") is fine as literal text.

## Length discipline

English is usually the *shorter* of the two — don't pad a button or chip past
what the cs original needs. Chip/status copy mirrors cs 1:1 in brevity:
"Done", "Saved", "×{n}".

## Terminology

Pull every domain noun from `glossary.md`'s en column — "asset group" stays
English in both locales (it's the product's actual UI vocabulary, not a
translation choice), "lead", "brief", and the marketing-metric abbreviations
(PNO, CAC, ROAS, CPC, …) are identical in both columns by design; don't
"clean up" PNO into "ad spend ratio" or similar — it's the app's chosen term.

## Concision

Prefer the shorter idiomatic English phrasing a native product copywriter
would actually ship over a literal rendering of the Czech: cs
`Reklamy, které nepovolí.` (literally "ads that won't yield/give in") renders
as `Ads that never crack.` — same brand attitude (unbreakable, adamant), a
tighter, more idiomatic English line. Transcreate marketing copy; translate
UI chrome.
