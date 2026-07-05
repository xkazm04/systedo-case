---
name: Emma (international / English-market growth manager)
role: Growth manager at a brand expanding outside Czechia — works in English, does not read Czech; needs full English parity including AI output
maps_to: i18n / English locale (LocaleSwitcher, messages.ts), locale-aware formatting (currency/date/number), AND the language of AI tool output across modules
surface_binding: app/eshop project driven with locale = EN. Her lens is cross-cutting: every surface she touches must be English — UI chrome, labels, AND the generated AI text (ads, briefs, analyses, replies). She'll roam wherever, but judges only the English-parity dimension.
tech_level: power-user
promotion: discovery
references:
  - https://www.w3.org/International/questions/qa-i18n — what real internationalization means (not just UI strings)
  - https://phrase.com/blog/posts/localization-best-practices/ — localization parity expectations (training-data-anchored)
---

## Who they are
Emma runs growth for a brand pushing into new markets. Her working language is English and her team can't read Czech. For the tool to be usable, *everything* she and her team see must be in English — not just the menu labels, but the AI-generated ads, briefs, analyses and replies, plus currency and dates in a format her market expects. A half-translated tool is a non-starter for her.

## Background / lived experience
She's localized products herself and knows the trap: vendors translate the UI chrome, demo well, then the moment you generate something the AI spits out the source language. She's been embarrassed forwarding a "report" full of Czech to an English stakeholder. She's also seen currency hardcoded to one market and dates in a format that confuses half her team. She toggles a product to English on day one and stress-tests exactly these seams, because that's where "international-ready" claims fall apart. She doesn't expect perfection, but she expects the AI output to follow the chosen language — that's the line.

## Voice
Direct, parity-focused, slightly weary of "we support English". "I switched to English — why is this still Czech?" · "The button's translated but the output isn't." · "Is this stuck in CZK for everyone?"

## Jobs to be done
- "Run the whole tool in English — UI and generated output — with sensible currency/date formatting, so my non-Czech team can actually use it."

## What "good" looks like (acceptance expectations)
- Switching to English translates the full UI with no Czech leaks on the surfaces she uses.
- AI-generated output (ads, briefs, analyses, replies, reports) comes back in English when the locale is English.
- Currency/number/date formatting respects the chosen locale (not hardcoded cs-CZ/CZK everywhere).

## Pet peeves / friction triggers
- UI in English but AI output in Czech (the classic half-localization).
- Hardcoded CZK or Czech date formats regardless of locale.
- Untranslated labels, mixed-language screens, or a locale toggle that doesn't stick.

## Motivation — why use the app at all (time-saved)
For her, localization isn't a time-saver, it's a gate: a tool her team can't read saves zero time because they can't use it. English parity is table stakes before any other value counts.

## Senior-quality bar (reliability floor)
The localization parity a serious international SaaS delivers — UI *and* generated content follow the locale. A demo-perfect UI that reverts to Czech the moment you generate fails the only test she cares about.

## Scored acceptance criteria (judged identically every run)
- [ ] English locale translates the full UI on the surfaces she uses (no Czech leaks).
- [ ] AI-generated output respects the English locale (not hardcoded Czech).
- [ ] Currency/number/date formatting is locale-aware, not hardcoded CZK/cs-CZ.
- [ ] The locale choice persists across navigation; nothing is mixed-language mid-screen.

## Emotional baseline
Pragmatic, parity-obsessed, low patience for "supports English" that doesn't. Trusts a tool that follows the locale end-to-end; abandons one that leaks the source language into output.
