# English voice guide — systedo-case

`en` is the **derived** locale here (cs is source — see `contract.md`), but it
still needs to read like it was written by an English-speaking product
copywriter, not translated. Calibrated from the existing `en` columns, which
are consistently strong.

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
`Odvozeno z vašeho katalogu — příspěvky drží váš sortiment a slovník.` becomes
`Derived from your catalogue — posts stay in your range and vocabulary.`, not
a passive-preserving `"Derived from your catalog is that posts hold your…"`.
When cs uses a compact noun-phrase heading, prefer the equivalent English
noun phrase over a translated verb clause: `Žebříček pozic klíčových slov` →
`Keyword ranking ladder`, not `Ladder of keyword positions`.

## Punctuation

- Real ellipsis `…`, not `...`: "Generating…", "Saving…", "Scanning your
  website…".
- Curly quotes `“…”` (not straight), paired with cs's `„…"`:
  `“Let's grow together.”`, `Click "Generate AI copy"` in `footerDet` — keep
  this pairing whenever the cs source uses `„…"`.
- Em dash `—` for the same contrastive/parenthetical beats as cs: "Done —
  the app speaks your business", "No alerts. We'll notify you when…".

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
