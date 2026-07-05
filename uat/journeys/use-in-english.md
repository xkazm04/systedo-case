---
character: Emma (international / English-market growth manager)
goal: "Run the whole tool in English — UI and generated output — with sensible currency/date formatting, so my non-Czech team can actually use it."
promotion: discovery
seed: authed local mode → set locale = EN (LocaleSwitcher) → roam app/eshop surfaces and generate AI output
references:
  - https://www.w3.org/International/questions/qa-i18n — real i18n (output, not just chrome) bar
---

## Trigger (why now)
Emma's team is about to trial the tool for a new English-speaking market. Day one she switches it to English and stress-tests whether it's actually usable in English — or only translated on the surface.

## Definition of done (her POV)
- English locale translates the full UI on the surfaces she uses, with no Czech leaks.
- AI-generated output (ads, briefs, analyses, replies, reports) comes back in English when the locale is English.
- Currency/number/date formatting respects the chosen locale, not hardcoded CZK/cs-CZ.
- The locale choice persists across navigation; no mixed-language screens.

## Out of scope
- Adding new languages beyond the cs/en the app ships (judging EN parity is the point).

## Discovery hints
Entry: switch to EN, then roam — landing, dashboard, an AI tool, a report. Don't script — the key test is generating something and checking the *output* language, plus currency/date formatting and any untranslated labels. A UI that's English but output that's Czech is the headline finding to look for.

## Frozen happy path
_(filled in on `promote`)_
