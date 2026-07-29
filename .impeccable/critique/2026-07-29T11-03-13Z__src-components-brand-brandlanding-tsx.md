---
target: landing
total_score: 18
max_score: 28
na_heuristics: 7,9,10
p0_count: 0
p1_count: 4
timestamp: 2026-07-29T11-03-13Z
slug: src-components-brand-brandlanding-tsx
---
**Provenance:** Assessment A (design review) and Assessment B (detector + browser evidence) ran as two isolated parallel subagents. Not degraded. Caveat: the synthesizing context had seen raw detector counts before Assessment A returned, so the anti-anchoring guard protected A's independence but not the parent's.

## Design-Specificity Verdict

**Half-authored.** The top ~700px could only belong to this product; everything below it could be lifted into any B2B SaaS site with six string swaps.

Unmistakably this product: the channel-support strip (`BrandLanding.tsx:24-29, 177-188`), where four chips each state a *different* level of support (`živý sync` / `kontrola inzerátů` / `publikování` / `publikování`) — PRODUCT.md principle #1 rendered as a visual device, above the fold, in eight words. The hero composition (a 70% text column overlapping a right-anchored monument with a two-gradient scrim) is real art direction, and the Czech is authored, not translated. The proof band is *computed* through `buildSnapshot("90d")` and the same formatters the dashboard uses — numbers that cannot drift from the product.

Category-interchangeable: the page skeleton is the default 2021-2026 SaaS landing (dark hero → eyebrow pill → two CTAs → chip strip → light section → four-stat band → dark closing CTA). Structure carries zero product argument. The `<Sparkles/>` eyebrow pill is the most exhausted signifier in the category, 40px above a genuinely original headline. There is no interaction character at all: total motion is a background tint and a 4px arrow nudge, on a brand whose thesis is *unbreakable*. Below `:191` the Monolith world is abandoned for default light SaaS; `.bg-facets` registers as nothing in either theme and the four crossroad illustrations render as indistinguishable dark tiles.

## Nielsen Heuristics — 18/28 (64%, Acceptable)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Header renders logged-in chrome then swaps to `Přihlásit přes Google` on the same load. No CTA discloses destination or commitment. |
| 2 | Match System / Real World | 3 | Czech-first; `PNO`/`ROAS` are the operator's vocabulary. Docked for `SQLite`, `Gemini`, `Bonus:` in customer-facing blurbs. |
| 3 | User Control and Freedom | 3 | Nothing traps; locale + theme toggles work. Nav was emptied into the crossroad, so return is browser-back only. |
| 4 | Consistency and Standards | 3 | Real token discipline. The closing CTA drops `shadow-card` and `active:scale-[0.99]` that the identical hero CTA has. |
| 5 | Error Prevention | 2 | `Začít zdarma` → `/app` silently lands on a Google OAuth wall; "zdarma" is an unsubstantiated, unlinked pricing claim. |
| 6 | Recognition Rather Than Recall | 2 | On mobile the crossroad blurbs are heavily clipped and the `01-04` index is hidden; four destinations reduce to one-word titles. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface — one intended path by design. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained, confident whitespace. Minimalism has tipped into under-informing. |
| 9 | Error Recovery | n/a | No forms, no async, no user-triggerable failure states. |
| 10 | Help and Documentation | n/a | Persuade surface. |

Applicable maximum 28; heuristics 7, 9, 10 scored `n/a`.

## Cognitive Load — moderate (3 failures)

- **FAIL — single focus:** three competing entry actions in the first viewport (header auth CTA, hero primary → `/dashboard`, hero secondary → `/app`). Browse and sign-up are different commitments at near-equal weight.
- **FAIL — minimal choices:** the footer offers 7 ungrouped links and is the page's only route to pricing.
- **FAIL, inverted — progressive disclosure:** the page discloses *less* than the visitor needs. No layer between "Stand adamant" and four demo links: no what-it-does, no how, no differentiation, no price. Total scroll ≈ 2 viewports.
- PASS: chunking (4/4/4), grouping, hero hierarchy, one-thing-at-a-time, working memory.

## Emotional Journey

Peak arrives first and is correct: the monument plus `Stůjte pevně. / Reklamy, které nepovolí.` pays off the brand name. Then a valley at the crossroad, where the register collapses from monument to table-of-contents and the copy turns internal (`Bonus:`, `SQLite`) — a prospect learns they are reading somebody's homework, a trust puncture on a page whose job is trust. A small lift at the proof band is damped in the same breath by `Ilustrativní case-study data`: the honesty is required and correct, but reassurance and deflation are fused with nothing offered as a reason to believe anyway. Reassurance at the one high-stakes moment is absent — `Začít zdarma` says nothing about what free includes, that it means Google OAuth, or what happens next. The ending is weak: the closing CTA repeats the hero's *browse* CTA verbatim, so under the peak-end rule the last impression duplicates the first.

## Deterministic Evidence (Assessment B, verified in context)

Reported 43 desktop / 48 mobile → **6 desktop / 10 mobile confirmed** after false-positive verification.

**False positives, with root cause:**
- `ai-color-palette` x31 — all false. The teal is a documented brand token (`--color-brand-300: #6ee3da`) measured in-page at hue **175°**, at the green edge of the rule's 160-200 window and away from the slop cyans at 187-192. An in-page census found only 9 of the flagged nodes contain a text node; 28 are `svg`/`path`/`circle`/wrapper spans inheriting `color` for icon strokes, so ~4 real decisions inflate to 31 findings.
- `low-contrast` x5 "via analytic-gradient+alpha" — false. `globals.css:145-161` `.bg-facets` (applied to `<main>`) sets two `repeating-linear-gradient`s of `rgba(11,27,43,0.03)` and **no `background-color`**. The resolver averages the gradient stops, gets near-transparent, and computes text against itself. Correlation is exact: every flagged element sits on `main.bg-facets` or on `bg-brand-50/40`; the hero `h1` on solid `bg-onyx` was not flagged under identical conditions. Real value for "Vyberte si cíl" is ~17:1.
- `gpt-thin-border-wide-shadow` x1 — false. `--shadow-card` is `0 1px 2px rgba(13,26,36,.04), 0 8px 24px -12px rgba(13,26,36,.12)`; the rule reads the 24px blur and ignores the **-12px spread** that pulls it into a tight tucked lift.

**True findings:**
- `#ffffff` on `#0e9c97` = **3.4:1**, real WCAG AA failure — `src/components/ui.tsx:89`, the shared `primary` button variant, site-wide blast radius. `BrandLanding.tsx:164` gets it right (`bg-brand-500` + `text-navy-900`); the reusable component is the one that diverges.
- `--color-brand-accent` `#117d79` at ~4.6:1 on canvas — passes as large text in the proof band, exposed on the 12px eyebrows. `globals.css:44-48` documents the near-miss knowingly and a contrast guard test pins it.
- `kicker-above-heading` x2 — `Crossroad.tsx:37` `<Eyebrow>` "Pracovní prostor" above "Vyberte si cíl"; `BrandLanding.tsx:201` "Důkaz" above the proof headline. Banned outright.
- `overused-font` + `single-font` — `Geist_Mono` is loaded in `layout.tsx:18` and bound to `--font-mono` but never invoked on this page, so Geist Sans is 100% of rendered text. A second family is already paid for and unused.
- `text-overflow` x4 (mobile) — `Crossroad.tsx:76` `truncate`. Not a layout break: `truncate` works exactly as specified and the page does not overflow because of it. That is the problem. Measured `clientWidth` 110px against `scrollWidth` 528/581/662/757px, so **15-21% of each blurb renders**; the detector's gentler figures give ~28-43%. Fix is `line-clamp-2`, not a layout fix.

## Priority Issues

**[P1] The page ends before it makes an argument.** Between `BrandLanding.tsx:191` and `:197` there is one crossroad of four links; total desktop scroll ≈ 2,017px. PRODUCT.md's thesis — generation grounded in the account's own live data, catalog and captured voice; measure → triage → generate — appears as one subordinate clause in the subhead and nowhere else. No what-it-does, no how, no differentiation, no objection handling, no pricing link outside a 7-item footer row.

**[P1] Mobile destroys the only content that differentiates the four destinations.** `Crossroad.tsx:76` (`truncate`) plus `:67` (`hidden … sm:block` on the `01-04` index). At 390px, blurbs clip mid-word and the index disappears simultaneously, so the page's decision point degrades to four one-word titles beside four indistinguishable dark chips.

**[P1] The homepage side-scrolls at 390px.** `documentElement.scrollWidth` 507 vs `clientWidth` 380 — **127px of horizontal overflow**, from the shared shell rather than `BrandLanding.tsx`: the header action cluster (right edge 432px, with the theme and menu buttons clipped to ~25px effective width) and the footer link row (`Mapa` right edge 433px). The controls are physically unreachable.

**[P1] Assignment-brief language in customer-facing copy.** Crossroad blurbs sourced from `localizedNavItems`: `Bonus: přehled kampaní … a uložením do SQLite`, `Tři marketingové nástroje na Gemini`. PRODUCT.md names the evaluator audience precisely *because* the public surfaces must read as a shipped product; this copy tells the primary audience it is reading homework, at the decision point.

**[P2] The conversion action has no reassurance and no price; the closing CTA is a duplicate.** `BrandLanding.tsx:169-174` and `:232-238`. `Začít zdarma` is the page's only commitment, lands on an OAuth wall without saying so, and makes a pricing claim with no substantiation and no link — while `Ceník` sits buried in the overflowing footer. The closing CTA repeats the hero *browse* CTA word for word, so the page never asks for the conversion.

## Persona Red Flags

**Jordan (confused first-timer):** four bare labels tell her nothing about what happens on click; `Vzácný druh v adtech` assumes she knows what adtech is; `PNO · cíl 15 %` is undefined and nothing signals that 14,2 % beats target; three CTA-shaped things in the first viewport, none labeled by destination.

**Casey (distracted mobile):** the page side-scrolls; theme and menu buttons are clipped off-screen; all four descriptions cut mid-word; the monolith key visual — the whole brand — is cropped out of frame at 390px, leaving a flat dark rectangle. The primary CTA sits ~590px down with no persistent action bar.

**Riley (deliberate stress tester):** hits OAuth from `Začít zdarma`, hunts for what "zdarma" means and finds `Ceník` only in an overflowing footer row; watches the header render two contradictory auth states in one second; reads `Bonus:` and `SQLite`, concludes this is a case study, then reads `Ilustrativní case-study data` and starts asking what else is not real. Also `Crossroad.tsx:54-59` `return null`s a card in production when `CROSSROAD_META` and the nav model drift — a homepage destination can vanish silently.

**Petra (Czech e-shop operator, the PRODUCT.md primary):** the channel strip speaks to her exactly — she has been burned by tools claiming Sklik parity. Then the page never shows her the product, only four links to a case study about a nut e-shop. Nothing addresses "will this work on my account", "how long to set up", "what does it cost".

## Minor Observations

- The hero repeats the full brand lockup ~40px below the identical lockup in the sticky header: two Adamant logos in one viewport.
- `Vzácný druh v adtech` is the page's only unquantified, unqualified claim, in a voice PRODUCT.md defines as always quantified or qualified — with a Sparkles icon.
- The four proof stats are typographically identical though they are three different kinds of number (multiple, ratio-against-target, absolute, signed delta). Nothing marks the PNO as beating its target, and `fmtSignedPct` carries direction by a `+` glyph alone in the same color a negative would use.
- Each 48px crossroad chip loads a full PNG at `sizes="48px"`, `opacity-70`, under a 20px icon — four requests rendering as indistinguishable dark texture in both themes.
- `alt="Adamant logo"` is redundant beside the visible word "Adamant"; the crossroad `alt=""` is correctly decorative.
- A large empty dark band sits between the closing CTA and the footer; the page has no visual terminus.
- The proof band's `bg-brand-50/40` is so pale in light mode that it barely separates from the white crossroad section above it.
- Skip link (`Přejít na obsah`) is present and correct.
- Reduced-motion behavior could not be meaningfully assessed: there is essentially no motion to reduce.

## Provocative Questions

1. If you deleted the crossroad entirely and put **one live product surface** on the homepage — the actual dashboard, rendering, embedded — would the page be more or less convincing? Right now you have four doors and no room.
2. The brand is *unbreakable*. Nothing on this page resists, holds, or has weight. What would a single interaction feel like if the design believed the copy?
3. The channel-support strip is the most honest and most differentiated thing you have built. Why is it eight words in a chip row instead of a section?
4. PRODUCT.md says the thesis is *generation is downstream of measurement*. What if the page's spine were **measure → triage → generate**, with the crossroad's four stops placed *on* it?
5. Who is `Začít zdarma` for, if the page never says what free includes and never links the pricing page you already have?
6. If a visitor read only your hero and your closing line, would they have learned anything in between?
7. What would this page look like if the Monolith didn't stop at 700px?
