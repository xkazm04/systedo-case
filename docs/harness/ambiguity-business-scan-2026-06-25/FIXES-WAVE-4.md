# Ambiguity+Business Fix Wave 4 — "Czech, all the way down"

> 4 commits, 4 i18n-correctness findings closed. Theme: English leaks / hardcoded word
> order on a cs-CZ-first app. Baseline preserved: tsc 0 → 0 · unit 173 → 173 · 0 regressions.

## Commits

| # | Commit | Finding | Files |
|---|--------|---------|-------|
| 1 | `863940c` | ai-tool-forms #1 — Content Brief shows English in the cs locale | `ContentBriefGenerator.tsx` |
| 2 | `c3a5ab0` | design-system #2 — Sparkline aria-label hardcoded cs | `charts/Sparkline.tsx` |
| 3 | `993290b` | nav-header-footer #3 — `navLabel` ignores locale | `lib/nav.ts`, `clanek/page.tsx`, `clanek/vykon/page.tsx` |
| 4 | `10e3b56` | format-helpers #2 — `fmtRange` hardcodes Czech word order | `lib/format.ts` |

## What was fixed
1. **~15 untranslated cs strings** in the Content Brief tool (SERP warnings, scorecard labels, group headings, rationale title, example placeholders) translated to Czech — the default-locale user no longer sees half the UI in English.
2. **Sparkline aria-label is now localizable** via an optional `describeLabel` builder (cs default kept); resolves the "one formatting source" contradiction without touching any caller.
3. **`navLabel` is locale-aware** (optional `locale` param, defaults to cs); the two clanek breadcrumbs pass the server locale, so en breadcrumbs stop showing Czech.
4. **`fmtRange` composes per-locale** — Czech genitive day-first stays gated behind `locale==="cs"`; other locales use `Intl.formatRange`, fixing broken en strings like "1.–31. May 2026".

## Scope decisions (deferred — product calls, not bugs)
- **home-app-shell #2 (English-only landing)** — deferred: the repo's brand is English ("Adamant — AI ad intelligence"), so whether the landing should be Czech is a positioning decision.

## Verification
tsc 0 · unit 173/173 · LLM gate green (cached).

## Patterns established (catalogue 12)
12. **"Same key in two locale blocks, byte-identical" = an untranslated leak**, not a coincidence — grep locale dictionaries for English values under the default locale. (Also: an exact-match Edit will hit *both* blocks — anchor on a locale-unique sibling line.)

## What remains
Waves 5–6 + gate-locked track. Next: Wave 5 "Make it convert & shareable" (export deliverables).
</content>
