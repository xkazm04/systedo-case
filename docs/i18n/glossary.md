# i18n glossary — systedo-case

The termbase for `/i18n-translate`. **cs is the source locale** (see
`contract.md`); every row is anchored in an *existing* colocated `T` table —
in-catalog precedent wins over translator preference. Add a row the moment you
make a new term decision so it sticks for the next run.

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
