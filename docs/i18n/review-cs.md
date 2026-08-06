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

### Added by the 2026-08-06 fan-out (wave 1)

| # | Decision | Sites | Severity | The tension |
|---|---|---|---|---|
| **A5** | **The product tagline is split two ways** — `AI inteligence pro reklamu` vs `AI reklamní inteligence` | 6+ | **major** | `Nav.tsx` declares the first as "the established tagline pairing" and `BrandLanding.heroTagline` is byte-identical to it because the sticky header renders it ~40 px above the hero. But `LandingNewWorld.tagline` uses the second, and the metadata is split the same way (`layout.tsx` → `AI reklamní inteligence`, `opengraph-image.tsx` → `AI inteligence pro reklamu`). **This is the app's headline claim, rendered inconsistently on the marketing site.** Ruling + glossary row, then a sweep across `Nav.tsx`, `layout.tsx`, `opengraph-image.tsx` and three landings. Blocks CS-PREP-REPEAT below. |
| **A6** | **`-ise` vs `-ize` in the `en` column** | ~15 | minor | No house standard exists — measured 4:3 on `optimis*`, 3:5 on `-ised`, 0:2 on `centre`. Only `analyse` (19:4) is a real cluster. Two agents each "discovered" a convention that wasn't there. Pick one variety, sweep once. |
| **A7** | **CS-PREP-REPEAT** — `AI inteligence pro reklamu pro e-shopy a agentury` | 2 | major | Stacked identical prepositions (*hromadění předložek*). Every candidate fix trades one defect for another; the clean one changes the head term, which is frozen by A5. **Decide A5 first.** |
| **A8** | **CS-SVO-AMBIG** — an English passive that parses backwards in Czech | 2 | major | `ByomQuality{Overview,Matrix}.selfJudge`: en "models … *are graded by* a sibling model" → cs default-reads as the models doing the grading. Needs a native to say whether context disambiguates; if not, use an explicit passive. |
| **A9** | **`change package` vs `change-set`** (en only) | 8 | minor | One object, two English names (5 vs 3); cs is uniformly `balíček`. The code type is `ChangeSet` while "change package" is the calque of the Czech. Product-vocabulary call. |
| **A10** | **`map pack` vs `mapový balíček`** | 6 | minor | Split 3:3, with `LocalSeoShowcase` using both twice each. Tie-breakers sit in `RankClimbChart.tsx`, `projects/types.ts`, `organic-channels/sample.ts`. |
| **A11** | **`spend` → `útrata` vs `výdaje`** | ~7 | minor | The glossary says `útrata`, but `výdaje` is live in ~6 files, mostly in the compound `výdaje na reklamu`. The glossary row probably needs a "…but `výdaje na reklamu` for the formal compound" carve-out **before** anyone sweeps. |
| **A12** | **`snapshot` → `snímek` or `snapshot`** | 2 | minor | Exactly two user-facing renderings exist, 1-1. Needs a glossary row. |
| **A13** | Czech gender/declension of loanwords — `microsite` (masc. vs fem.), `twin` (animate vs inanimate) | ~5 | minor | `Klientský microsite` and `poučit twin` are each internally consistent but a native may prefer the other. One ruling + glossary rows. |
| **A14** | `home-team bias` left English in the cs column | 3 | minor | Term decision: keep, or render it. |

**Also documented, not a decision:** `case study` has a *systematic and correct*
split in cs — standalone → `případová studie` (13 sites), attributive → English
pre-posed (`case-study účtu`, `case-study datasetu`). An agent nearly "fixed"
this and reverted after measuring. **It belongs in `glossary.md` so the next run
doesn't re-derive it.**

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

### Found by the 2026-08-06 fan-out — ranked by user impact

| # | Defect | Where | Why it matters |
|---|---|---|---|
| **C5** | **Two Czech-only label maps render unconditionally in the English UI.** `POST_STATUS_LABELS` (`Koncept`, `Naplánováno`, `Zveřejňuje se…`, `Zveřejněno`, `Chyba`) and `TONE_LABELS` (`Věcný a důvěryhodný`, …). | `lib/social/types.ts:59`, `lib/ai-types.ts:181` → rendered by `PostsList`, `Composer`, `WeekPlanner`, `AdGenerator`, `ContentPipeline` | **Verified.** Both are `Record<K, string>`, not `Record<locale, …>`. An English user sees Czech status pills and a Czech tone dropdown. This is the single largest *visible* localization hole left, and no locale-table wave can fix it — it needs the constants restructured. |
| **C6** | **`OverheadPanel` double-renders the `×` suffix** — `overheadMonthsMult` supplies a leading `×` and is passed `fmt.fmtMultiple(months)`, which already appends one. Ships as **"× 3,0× months in the period"**. | `app/modules/profit/OverheadPanel.tsx:72` | Same class as the `před {rel}` bug fixed this wave, in a different file. Fix at the call site (`fmtDecimal`), not in the string. |
| **C7** | **`sparkAria` mislabels its own placeholders.** `"…over the period: from {start} to {end}"` is filled with `fmtCZKCompact(values[0])` / `…[last]` — **money, not dates**. | `campaigns/CampaignTable.tsx` | Screen-reader users hear "over the period: from 12 k Kč to 3 k Kč". Both locales share it; fixing means re-authoring the sentence in both columns. |
| **C8** | **`scoreLabel()` returns hardcoded Czech** (`Horký lead` / `Vlažný lead` / `Studený lead`) into a pill beside localized copy. | `lib/speed-lead/qualification.ts:67` | The panel's own table already holds those three words as `dispositionHot/Warm/Cold` — the fix is to route through them. |
| **C9** | **`projectTypeFor()` seeds the twin-reply prompt with a Czech literal** `"poptávaná služba"`. | `app/modules/SpeedLeadModule.tsx:160` | An English user's AI-generated reply is grounded on a Czech noun phrase. |
| **C10** | **`currencyUnit: "USD"` on inputs that are koruny in both locales**, rendered with `fmtCZK` (active-locale currency). | `profit/strings.ts` + `ProfitReallocationPanel.tsx:56` | `CostModelEditor.tsx:55` documents this exact bug and fixed its own label to "Kč". Both remaining sites render in one module, so fixing one alone would put "Kč" and "USD" beside two inputs on the same screen. **One sweep across both.** |
| **C11** | **Hardcoded `%` and decimal commas outside the formatters.** `{d.confidence} %`, `{cfg.autoThreshold} %`, `CompetitorBars` `{d.value}%`, `RankClimbDemo` `"311 · 4,7"`. | `twin/TwinOutboxHistory.tsx:81`, `TwinChannels.tsx:209`, `marketing/charts/CompetitorBars.tsx`, `marketing/RankClimbDemo.tsx` | Czech wants `34 %` (NBSP), en-US wants `34%`; the hand-typed decimal commas render `4,7` to an English reader. `TwinOutbox.autonomyAuto` gets it right by splitting the value per locale. |
| **C12** | **CSV filename localization is inconsistent** — `ActivityFeed` routes its filename through the catalog; `table/csv.ts:82` hardcodes `adamant-kampane.csv` for every locale. | `campaigns/table/csv.ts:82` | Minor, but an English user downloads a Czech-named file. |
| **C13** | **Concatenated sentences** — `overheadFooter` finished by a JSX count; `breakEven` + `breakEvenLoaded` joined into one sentence whose second half starts with ", "; `responseGoal` + `slaGoal` sharing one key across two grammatical contexts. | `profit/OverheadPanel.tsx:150`, `CostModelEditor.tsx:149`, `SpeedLeadModule.tsx:483` | Caps translation quality permanently — the translator cannot see or reorder the whole sentence. The classic i18n source defect. |
| **C14** | **`ControlPlane.tsx:241` hardcodes `label="COS"`** outside the locale table. | `campaigns/ControlPlane.tsx:241` | Now the last "COS" in the codebase after this wave renamed three catalog values to PNO — it renders "COS" to Czech users for a number the rest of the app calls PNO. One-word fix. |
| **C15** | **Four dead keys** carried in both columns, never rendered: `ByomKeys.disabled`, `AccountSecurity.deleteTitle`, `SpeedLeadModule.learned`, `OnboardingModule.open`. Plus `TwinOutbox` duplicates five keys only its child renders. | various | Wasted translation effort and a drift vector — two hand-synced copies of one string is how the `koncepty` term drift spread. |
| **C16** | **`LegalSections.tsx` header comment still claims `cs` is the source of truth.** | `site/LegalSections.tsx` | Stale since the 2026-08-05 flip; will mis-direct the next agent to read it. |

## D · Strings a native should read

Nothing yet. This run made only anchored, evidence-backed edits (7 register
fixes, 10 leftover-source fills) — none of them required a judgment call a
native would overturn. The queue starts filling when the en-first re-authoring
wave begins and Czech is being *derived* rather than *audited*.
