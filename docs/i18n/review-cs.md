# cs review queue — decisions this process cannot make alone

Opened 2026-08-05, on the run that flipped the authoring direction to en-source.
Two kinds of entry: **house decisions** (a term or convention that needs one
ruling and then one sweep) and **source defects** (problems in the code that cap
quality for every locale — the owner's to fix, never patched silently).

Nothing here is a bug in the current build. Everything here is a thing that
would be wrong to decide unilaterally.

---

## A · House decisions — parked, evidence gathered, awaiting one ruling

Each is recorded as a rule in [`constructions-cs.md`](./constructions-cs.md)
Part 2. **Do not apply any of them partially** — a stranded minority is worse
than not starting ([`lessons-i18n.md`](./lessons-i18n.md) § 6).

| # | Decision | Sites | Severity | The tension |
|---|---|---|---|---|
| A1 | **CS-DASH** — em dash `—` → en dash `–` in cs | **258** | major | Czech norm (ČSN 01 6910) sets the *pomlčka* as a spaced en dash. The catalog uses the em dash 258× in cs and 273× in en — the counts travel together, the classic leak tell. **But [`style-cs.md`](./style-cs.md) currently endorses `—` for Czech**, so two artifacts contradict and neither is citable until this is settled. Fixing it is one scripted pass plus one style-guide edit. |
| A2 | **CS-PROSIM** — thin out `prosím` | 20 | minor | 20 cs `prosím` against 21 en `please`: 1:1 tracking. Microsoft cs uses it far more sparingly than English does. `style-cs.md` cites "Zkuste to prosím znovu." approvingly. House vs authority. |
| A3 | **CS-CLICK** — `klikněte na` → `vyberte` | 19 | minor | Device-neutrality: `klikněte` is wrong on touch and for keyboard/AT users, and Microsoft cs prefers `vyberte`. Real accessibility argument, but it is a uniform voice change. |
| A4 | **CS-NOUNMOD** — `Google Ads účet` → `účet Google Ads` | 11 (vs 5 already correct) | minor | English noun-modifier order. The calque is the *majority* here, so a sweep changes 11 to match 5. Both forms occur in real Czech PPC writing. **Excludes `AI vyhodnocení`/`AI texty` (20 sites)** — `AI` is an indeclinable adjective in Czech, not a brand modifier, and is correct as-is. |

**A1 is the one worth deciding first.** It is the largest, the most visible, the
only one with an artifact contradiction behind it, and the only one that is
purely mechanical once decided.

## B · Term decisions — 45 `cs` = `en` values that are not gaps

`node scripts/i18n-audit.mjs` reports these after excluding the
Do-Not-Translate list. Each needs a ruling, then a glossary row.

| Cluster | Sites | Question |
|---|---|---|
| `ContentBriefGenerator` export labels (`copyTitle`, `copyMeta`, `copySlug`, `copyOutline`, `copyFaq`, `copyKeywords`, `copyInternalLinks`, `mdOutlineHeading`, `mdFaqHeading`, `mdKeywordsHeading`, `mdInternalLinksHeading`, `groupSeoMeta`) | 12 | **Not UI.** These are the field labels of a clipboard/Markdown document the user exports. Should a Czech user's export carry `## Outline` or `## Osnova`? SEO convention says the English keys (`TITLE:`, `META:`, `SLUG:`) stay; the prose headings could go either way. |
| Marketing metric words that are *not* on the DNT list — `Open rate` (2), `Win rate` (2), `drift` (1), `relevance` (1), `Blended CAC`, `LTV : CAC` (2) | ~9 | The DNT list covers abbreviations (ROAS, PNO, CPC). These are English *words* used as Czech marketing jargon. Add them to the glossary as kept loanwords, or translate (`Míra otevření`, `Úspěšnost`)? |
| Product / technical nouns — `API token`, `Feed`, `Autopilot`, `Challenger`, `Fulfillment (3PL)`, `Asset group · {sku} ·`, `PMax / RSA`, `Article JSON`, `LLM wrapper` | ~9 | Mostly already justified by glossary precedent (`asset group` is an explicit row). Confirm and add the missing rows so the audit stops reporting them. |
| Placeholders and format strings — `https://…/logo.png`, `https://…/feed.xml`, `Δ CPQL`, `Δ win rate`, `AOV {val}`, `ROAS {val}`, `Brand · Search`, `Firestore · AI: Gemini`, `Text` | ~9 | Almost certainly correct as-is. Candidates for the audit script's DNT list rather than for translation. |
| `TwinChannelsModule.stepTwin` / `TwinInboxModule.stepTwin` = "Twin" | 2 | Product module name — DNT, needs a glossary row. |

## C · Source defects — the owner's to fix, capping quality for both locales

| # | Defect | Where | Why it caps quality |
|---|---|---|---|
| C1 | **No plural mechanism.** `interpolate()` is a bare `{\w+}` regex; there is no ICU, and `czPlural()` exists but is not wired into it. | `src/lib/i18n/interpolate.ts` | Czech needs 1 / 2–4 / 5+ agreement. Every counted string is written to dodge the problem (see CS-COUNT). It works, but it constrains phrasing permanently and would block German/Polish outright. |
| C2 | **Static metadata is Czech while `<html lang>` is now `en`.** | `src/app/layout.tsx`, `src/lib/site.ts` | Deliberate — metadata is prerendered under Cache Components and can't read the locale cookie without making every route dynamic. Recorded in `contract.md` so no wave "fixes" it. Revisit only as an SEO decision. |
| C3 | **Locale-less server paths write Czech.** Cron stock alerts, newsletter labels, CSV cells and chart axes default to `HOME_MARKET_LOCALE` (`cs`). | `src/lib/inventory/sync-alerts.ts`, `distribution/newsletter.ts`, `export.ts`, `charts/*` | Correct today (Czech customers), and deliberately pinned so the UI-default flip moved no numbers. But it means an English-speaking user gets Czech alert emails. The real fix is threading the recipient's stored locale, which is plumbing, not translation. |
| C4 | **`RankClimbChart` and `Sparkline` never receive a locale.** 11 call sites, all using the default. | `components/charts/Sparkline.tsx`, `marketing/charts/RankClimbChart.tsx` | Their axis ticks and aria labels are formatted in the home market's locale regardless of what the reader chose. Pass the real locale when `LocalSeoShowcase` is next touched. |

## D · Strings a native should read

Nothing yet. This run made only anchored, evidence-backed edits (7 register
fixes, 10 leftover-source fills) — none of them required a judgment call a
native would overturn. The queue starts filling when the en-first re-authoring
wave begins and Czech is being *derived* rather than *audited*.
