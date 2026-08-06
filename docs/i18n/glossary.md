# i18n glossary — systedo-case

The termbase for `/i18n-translate`. **`en` is the source locale and `cs` is
transcreated from it** (see `contract.md` — this reversed on 2026-08-05); every
row is anchored in an *existing* colocated `T` table — in-catalog precedent
wins over translator preference. Add a row the moment you make a new term
decision so it sticks for the next run.

Note the rows below were harvested while Czech was the source, so their
evidence reads cs→en. The *decisions* still hold — precedent is precedent — but
when a row's note cites a cs value as the authority, that authority is now the
`en` value written from the call site.

## Domain terms (en ↔ cs)

| en | cs | note |
|---|---|---|
| campaign | kampaň | `CampaignTable`, `BudgetMoves` — consistent |
| ad set / asset group | **asset group** (kept English) | `CatalogModule.assetGroupSuffix`: cs column literally reads "Asset group · {sku} ·" — an established loanword in the Ads/PMax UI, same as the Do-Not-Translate tool names. Do not translate to "sada reklam". |
| keyword | klíčové slovo | `KeywordResearch`, `RankLadder.colKeyword` |
| bid / CPC | CPC (kept English) | no plain "bid" noun rendered anywhere; the app always speaks in CPC (`KeywordResearch.cpc`, `LtvModule` limits). Keep CPC as-is per the contract's marketing-metric abbreviation list. |
| budget | rozpočet | `BudgetMoves.heading`, `WeekPlanner` |
| spend | útrata / (verb) utrácet | `BudgetMoves.pauseMoveSpend`: "utrácí {amount} bez návratnosti" → "spending {amount} with no return". Use the verb form in a sentence, "útrata" as a bare noun. |
| conversion | konverze | `AlertsInbox`/`AudienceModule`/dashboard — consistent |
| lead | lead (kept English) | `LeadQualificationPanel.leadQualification`: "Kvalifikace leadu" — industry loanword, declined as a Czech masculine noun (leadu = genitive). Do not translate to "poptávka" here (that word is reserved for the `leadgen` project-type label). |
| revenue | **obrat** in ads/campaign context; **výnos** in content-monetization context | `BrandLanding.proofRevenue`: "obrat připsaný marketingu" (ads attribution). `AudienceModule.monthlyRevenue`: "Měsíční výnos" (newsletter/sponsorship revenue). Both are correct Czech but keyed to context — pick "obrat" for ad-spend/attribution surfaces, "výnos" for content/audience-monetization surfaces. Do not homogenize; flag if a new surface doesn't clearly fit either bucket. |
| margin | marže | `BudgetMoves.marginStated`: "při marži {m}" |
| profit | zisk | `BudgetMoves.projectedProfit`: "Projektovaný zisk" |
| review (n., rating) | recenze | `LocalReviews.latestReviews`: "Nejnovější recenze" |
| ranking / rank | žebříček (n.) / pozice (position) | `RankLadder.title`: "Žebříček pozic klíčových slov" — "žebříček" for the ladder/leaderboard framing, "pozice" for an individual keyword's rank |
| visibility | viditelnost | not yet rendered anywhere in the sampled catalog — no precedent found; use "viditelnost" (standard Czech SEO/marketing term) and flag the string for a native check on first use |
| audience | publikum / cílové publikum | `AudienceModule` (file header comment: "Publikum & výnos"); "cílové publikum" = target audience (`OnboardingModule.fAudience`) |
| content brief | (obsahový) brief | `KeywordResearch.clusterCreateBrief`: "Vytvořit brief" / "briefFromSelection". "brief" is kept as an English loanword inside Czech copy — established usage, do not force "zadání" or "podklad". |
| draft (n.) | návrh | `CatalogModule`/`Composer`: "AI návrh" = AI draft |
| draft (v.) | navrhnout | `Composer.aiBtn`: "Navrhnout s AI" = "Draft with AI" |
| publish (make live now) | zveřejnit | `Composer.publishNow`: "Zveřejnit teď" = "Publish now" |
| publish (ship/distribute content) | vydat | `DistributionModule.nextStepHint`: "Vydat varianty v centru sociálních sítí" = "Publish the variants in the social center" |
| publish (noun, "the act of publishing") | publikace | `DistributionModule.nextStepLabel`: "Naplánovat publikaci" = "Plan to publish" |
| schedule (v.) | naplánovat | `WeekPlanner.planBtn`, `Composer.schedule`, `DistributionModule.nextStepLabel` — consistent across all three social/distribution surfaces |
| catalog | katalog | `CatalogModule`, `WeekPlanner.voiceHint`: "Odvozeno z vašeho katalogu" |
| offering (what you sell) | nabídka / (verb) nabízet | `OnboardingModule.fOffering`: "Co prodáváte / nabízíte" |
| onboarding | (avoided as a loanword — described instead) | `OnboardingModule` never renders the word "onboarding" to the user; user-facing copy describes the action ("Připojení dat" = "Connecting your data", `checklistTitle`). Follow this precedent: don't introduce the bare loanword "onboarding" into new cs copy, describe the step instead. |
| report | report (product tab) / reporty (route) | route `/reporty`; `nav.items` — kept close to English, standard Czech marketing usage |
| insight | (no fixed noun — rendered as a descriptive phrase) | e.g. `CatalogModule.rationaleTitle`: "Proč právě takhle" = "Why this approach" (not "Insight"). `LtvModule.healthyInsight`/`unhealthyInsight` keys are internal names only — their cs *values* are full sentences, not the word "insight". Don't introduce a bare "insight" noun without a concrete UI precedent; translate the sentence, not the label. |
| alert | upozornění | `AlertsInbox` — consistent throughout |
| diagnosis | diagnóza | `DiagnosisTracking.historyTitle`: "Historie diagnóz" |

## Owner rulings, 2026-08-06 — the parked queue, resolved

These closed `review-cs.md` § A and § B. **In-catalog precedent lost to an
explicit ruling in several places; where it did, the ruling is the rule now.**

### Contextual splits — two correct Czech words for two different objects

| en | cs | The split |
|---|---|---|
| draft | **`koncept`** = the article manuscript · **`návrh`** = a reply / ad proposal | Not drift. `ArticleDraftPanel` titles itself `Koncept článku`, and Gmail-cs uses `Koncepty` for Drafts; the twin modules' *reply* drafts are `návrh`. Two agents independently refused to sweep this and were right. Same shape as the `obrat`/`výnos` row. |
| spend | **`útrata`** bare · **`výdaje na reklamu`** as the formal compound | The glossary said `útrata`; `výdaje` is live in ~6 files, almost all in that compound. Both stay. |
| publish (state participle) | **`Publikováno`** | A **fourth** sense the three `publish` rows above didn't cover. The *verb* is still `zveřejnit` (`Composer.publishNow: "Zveřejnit teď"`). |
| case study | standalone → **`případová studie`** (13 sites) · attributive → **English, pre-posed** (`case-study účtu`, `case-study datasetu`) | Systematic and correct. An agent nearly "fixed" it and reverted after measuring. Recorded so nobody re-derives it. |

### Term rulings

| Term | Ruling | Sites |
|---|---|---|
| the product tagline | **`AI pro prodej produktu`** / **`AI for product sales`** | **A rebrand, not a pick between the two existing forms** — the meaning moves from "advertising intelligence" to product sales. Swept across `Nav.tsx`, `layout.tsx`, `opengraph-image.tsx`, `BrandLanding`, `LandingNewWorld`. |
| the hero subhead's head term | **`AI pro digitální reklamu`** / **`Digital advertising AI`** | The cs takes a **genitive** audience (`…reklamu e-shopů a agentur`) rather than a second `pro`, which is what CS-PREP-REPEAT was about. |
| map pack | en **`map pack`** · cs **`mapy`** (`pozice v mapách`) | Not `mapový balíček`. Owner's call. Does **not** apply to `LocalSourcePanel`'s competitor `pack*` keys. |
| `Google Ads účet` | **`účet Google Ads`** — Czech postposes a brand attribute | 11. Excludes `AI vyhodnocení`/`AI texty`: `AI` is an indeclinable adjective, correct pre-posed. |
| change package / change-set | en **`change set`** (the code type is `ChangeSet`); cs stays `balíček` | 8 |
| budget shifts / moves | en **`budget moves`** (the component is `BudgetMoves`); cs `přesuny rozpočtu` | 4 |
| goal / target | **`goal`** = the monthly revenue goal · **`target`** = the PNO target; cs is `cíl` for both | ~13 |
| the geographic axis | en **`area`** (drop `locality`) · cs **`oblast`**. **`location` is reserved for a branch** (`pobočka`) | 14 |
| snapshot | cs **`snímek`**; en keeps `snapshot` | 2 |
| en spelling | **US `-ize`** — the formatters are `en-US` and `catalog` was already US | ~15 |
| microsite, twin | keep the shipped genders: `microsite` masculine, `twin` masculine **inanimate** | ~5 |
| `home-team bias` | **keep English** in cs — technical jargon in a BYOM-quality context | 3 |

### Deliberately NOT changed (closed as "the current form is right")

| # | Item | Why it stays |
|---|---|---|
| A2 | `prosím` in error copy (20) | "Zkuste to prosím znovu." is natural, consistent Czech. Microsoft's sparser preference is not a defect here. |
| A3 | `klikněte na` (19) | Left as-is. *(Not ruled on; still open if device-neutrality matters later.)* |
| A17 | `Fill example` (9) | Every alternative changes the verb; 9 sites of consistent house voice. |
| A23 | `Privacy Policy` / `Terms of Service` Title Case (2) | Legal document *names* are proper nouns — a recognised carve-out from `style-en.md`'s sentence-case rule. |

### § B — kept as loanwords, with rows so the audit stops reporting them

`Open rate`, `Win rate`, `drift`, `relevance`, `Blended CAC`, `LTV : CAC`,
`API token`, `Feed`, `Autopilot`, `Challenger`, `Fulfillment (3PL)`,
`PMax / RSA`, `Article JSON`, `LLM wrapper`, `Twin` (module name) — Czech PPC
speech uses these verbatim.

`ContentBriefGenerator`'s export labels (`## Outline`, `TITLE:`, `META:`, …)
**stay English**: they are the field labels of a Markdown/SEO document the user
exports, not UI chrome.

Format strings and placeholders (`https://…/logo.png`, `Δ CPQL`, `AOV {val}`,
`Brand · Search`) are **not translation candidates** — they belong in the audit
script's Do-Not-Translate list.

## Do-Not-Translate (from `contract.md`)

Adamant (client brand), mionelo.cz, Systedo, product/tool names (Google Ads,
Sklik, Gemini, Firestore, SQLite, GA4), marketing-metric abbreviations kept
as-is in Czech HR/marketing speech: **PNO, CAC, LTV, PPC, SEO, CTR, ROAS, RSA,
CPC, UX**. "Case study" stays English in cs (established usage). Placeholder
names (`{n}`, `{count}`, …) and route/URL slugs (`/clanek`, `/kampane`) are
never translated.

## Known catalog inconsistency (flag, don't silently fix)

`src/components/social/Composer.tsx` — `draftFailed: "Draft failed."` in the
**cs** column is verbatim leftover English (should be e.g. "Návrh se
nezdařil."). This is a genuine source-defect (cs is supposed to be the
authored locale here), not a style choice — surface it, don't quietly patch
it without the user's sign-off per the skill's guardrails.
