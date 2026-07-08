# L1 UAT — Standa (pre-launch maker) · Journey: get-found-organically

- **Character:** standa-prelaunch-maker (`uat/characters/standa-prelaunch-maker.md`)
- **Journey:** `uat/journeys/get-found-organically.md`
- **Surface:** `app` project type (demo-app / "Flowbase")
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Date:** 2026-07-08
- **Verdict:** **L1-pass** (with minor caveats)

---

## First-person review (Standa's voice)

No budget, no ad account, no intention of paying for clicks. If I'm going to get found
before launch, it's organic or nothing. So the question I brought is narrow: *which few
queries are actually worth targeting, and can this thing help me turn one into a page
that could rank?*

This is where the app is at its best, and honestly it surprised me.

**Klíčová slova** first. I type my topic, hit "Najít klíčová slova," and I get a ranked
list — each idea carries volume, competition, CPC and an intent tag, sorted by an
opportunity score that's literally "high volume + low competition." That's the exact
discipline I want: precise buyer intent over raw volume. I can even hit "Seskupit do
klastrů" and it groups them into a pillar + supporting structure — a ready content map,
not just a word dump. It's honest that the numbers are sample data until I connect Google
Ads, which I respect even if I wish the free real signal were more in my face.

Then **Srovnání & SEO**, which is app-only and turns out to be the sharpest tool for me.
It generates the high-intent comparison queries — "{my brand} alternativa," "{brand} vs
{competitor}," "{brand} cena," "{brand} recenze" — straight from my catalog's named
competitors, and ranks them by opportunity with a difficulty and a current-rank column.
For a pre-launch product, "alternativa" and "vs" queries are gold: people comparison-
shopping are the ones I can actually convert. And it's grounded in *my* brand and *my*
competitors, not generic filler. It even ties the ranking to my organic conversion
economics so it's about expected results, not vanity volume. There's a clear "sample
data" note so I know what's real.

The best part: I don't hit a wall between "which query" and "the draft." I pick a query
or a cluster, click through, and I'm in the **Obsahový engine** brief generator, already
seeded — topic, primary keyword, my selected keywords carried in as grounding (there's a
"Podloženo N klíčovými slovy" chip so I can see it). Out comes a title and meta inside
SEO limits, a SERP preview on *my own domain*, an H2 outline, FAQ, internal-link ideas,
an SEO scorecard, and then a full article draft I can export as Markdown. From "I need to
get found" to "here's a draft I could publish with light editing," in one sitting, with
no ad account and no budget anywhere in sight.

Caveats, because I'm me: the keyword volumes are synthetic until I connect an account, so
this is more "which intents are structurally winnable" than "here's proven live demand."
And I have to not wander into Výkon or CAC→LTV, which fabricate performance data I don't
have. But for *this* journey — target queries → grounded brief → shippable draft, budget-
free — the path is clean, connected, and grounded in my actual product. This is the one
that would make me keep the tab open.

---

## Reachability check (modules.ts · `app`)

Journey surfaces available for `app` (`src/lib/projects/modules.ts`): Klíčová slova
(`klicova-slova`, ALL), Srovnání & SEO (`srovnani-seo`, app-only, :217–225), Obsahový
engine (`obsahovy-engine`, ALL). All reachable; the app-specific comparison surface is
correctly exposed only for his type.

## Grounding audit (per AI surface)

- **Keyword research** — grounded in his typed seed + intent; volume/competition is a
  deterministic sample until Ads is connected, honestly labeled (`engine.ts:32`,
  `KeywordResearch.tsx:40`). **2/3** (topic + intent real; demand synthetic pre-connect).
- **Srovnání & SEO** — `comparisonQueriesFromCatalog(project.name, plans)` builds queries
  from his real brand + catalog competitors; ranking is tied to the organic channel's
  real conversion economics over 90 days; volume/difficulty/rank are seeded per query
  string (`catalog.ts:29–47`, `srovnani-seo/page.tsx:20–27`). Falls back to generic
  SAMPLE_QUERIES only if the catalog has no plans. **2.5/3** (brand + competitors + real
  econ grounded; per-query volume synthetic).
- **Content brief → draft** — topic + primaryKeyword + audience + keyword grounding reach
  the prompt; SERP preview grounded in his real domain; "grounded by N keywords" chip
  surfaces the handoff (`ContentBriefGenerator.tsx:353,443,574`). **4/4.**

**Journey grounding: 8.5/10 across the three surfaces — strongest of Standa's runs.**

---

## Findings

```json
[
  {
    "id": "STANDA-GFO-STR-01",
    "journey": "get-found-organically",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "strength",
    "dimension": "Completion",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "app: srovnani-seo is app-only and central to this journey", "trust_erosion": "none" },
    "title": "Srovnání & SEO generates high-intent comparison queries grounded in his real brand + catalog competitors, ranked by opportunity",
    "expected": "Leave knowing the few queries worth targeting first, prioritized by winnable intent, grounded in his product.",
    "got": "comparisonQueriesFromCatalog synthesizes 'alternativa / vs {competitor} / cena / recenze' queries from the project's brand name and each plan's named competitors, ranks by opportunity with difficulty + current-rank columns, and grounds the acquisition estimate in the project's real 90-day organic conversion economics. Falls back to sample queries only when the catalog is empty; a SampleDataNote sets expectations.",
    "evidence": ["src/lib/seo-compare/catalog.ts:29", "src/app/app/[projectId]/srovnani-seo/page.tsx:20", "src/app/app/[projectId]/srovnani-seo/page.tsx:26"],
    "code_check": "page derives seoChannel from channelRows over data.daily.slice(-90); generated = comparisonQueriesFromCatalog(project.name, loadPlansFor(project)); queries = generated.length>0 ? generated : SAMPLE_QUERIES.",
    "verdict": "confirmed",
    "l2_priority": "n/a"
  },
  {
    "id": "STANDA-GFO-STR-02",
    "journey": "get-found-organically",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "strength",
    "dimension": "Effort",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "app: keywords/compare → obsahový engine handoff", "trust_erosion": "none" },
    "title": "No gap between 'which query' and 'the draft' — selections seed the brief with keyword grounding carried through",
    "expected": "At least one target becomes a brief + draft grounded in his actual product, without a ground-up rewrite.",
    "got": "A keyword selection or cluster hands a BriefSeed (topic + primary keyword + keyword list) via sessionStorage into ContentEngine, which opens the brief workspace pre-seeded; a 'Podloženo N klíčovými slovy' chip confirms the grounding reached the generator, which then yields brief + SEO scorecard + SERP preview (his domain) + a full exportable article draft.",
    "evidence": ["src/components/app/modules/KeywordsModule.tsx:18", "src/components/app/modules/ContentEngine.tsx:205", "src/components/ai/ContentBriefGenerator.tsx:365", "src/components/ai/ContentBriefGenerator.tsx:443"],
    "code_check": "briefSeedKey sessionStorage handoff read on ContentEngine mount; grounding state initialized from seed.keywords; groundedBy chip renders when grounding.length>0.",
    "verdict": "confirmed",
    "l2_priority": "n/a"
  },
  {
    "id": "STANDA-GFO-01",
    "journey": "get-found-organically",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Trust",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "app: keyword volumes underpin query prioritization", "trust_erosion": "low-medium" },
    "title": "Query prioritization rests on synthetic volume/difficulty until an Ads account is connected",
    "expected": "Ranking 'the few queries worth targeting' by opportunity implies the underlying volume/competition is real demand signal.",
    "got": "Keyword volumes come from the deterministic sample generator (engine.ts:32) and compare-query volume/difficulty/rank are seeded off the query string (catalog.ts:17–24) pre-connection. Intent structure and brand/competitor grounding are real, but the magnitudes ranking the list are synthetic. Honestly labeled, so it's a soft caveat rather than a trust break.",
    "evidence": ["src/lib/keywords/engine.ts:32", "src/lib/seo-compare/catalog.ts:17", "src/components/ai/KeywordResearch.tsx:349"],
    "code_check": "sampleKeywordIdeas(seed) and synth() derive figures deterministically from strings via seed01; both surfaces disclose sample vs live.",
    "verdict": "confirmed",
    "l2_priority": "medium",
    "scope_note": "Real signal (Google Ads Keyword Planner) is free and unlocks the same UI — account-gated, not budget-gated."
  },
  {
    "id": "STANDA-GFO-02",
    "journey": "get-found-organically",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "confusion",
    "dimension": "Clarity",
    "severity": "minor",
    "impact": { "frequency": "medium", "reachability": "app: fresh (non-demo) project entering srovnani-seo", "trust_erosion": "low" },
    "title": "A freshly-created app project generates only brand queries (no 'vs' rows) because the starter catalog seeds empty competitors",
    "expected": "The comparison surface's most valuable rows for him are the 'vs {competitor}' queries; on his own new project those should be easy to populate.",
    "got": "appStarter seeds plans with competitors: [] and a differentiator literally telling him to 'Doplňte konkurenty v Katalogu'. Until he adds competitors, comparisonQueriesFromCatalog emits only 'alternativa / cena / recenze' brand queries — still grounded, but missing the highest-intent 'vs' comparisons. The demo-app project (Flowbase) has real competitors so this only bites on his own new project.",
    "evidence": ["src/lib/catalog/starter.ts:67", "src/lib/seo-compare/catalog.ts:42"],
    "code_check": "appStarter plans have competitors: []; catalog.ts only pushes 'vs' queries per competitor, so an empty competitor set yields no 'vs' rows (but plans.length>0 still avoids the generic sample fallback).",
    "verdict": "confirmed",
    "l2_priority": "low"
  },
  {
    "id": "STANDA-GFO-STR-03",
    "journey": "get-found-organically",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "strength",
    "dimension": "Senior-quality",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "app: keyword research entry point", "trust_erosion": "none" },
    "title": "Opportunity scoring + intent classification + AI clustering match the buyer-intent discipline his references demand",
    "expected": "Precise long-tail buyer-intent over raw volume; a senior organic strategist's approach.",
    "got": "Ideas are intent-classified and ranked by an opportunity score that combines high volume with low competition; the 'Seskupit do klastrů' action produces pillar + supporting topic clusters with per-cluster volume — a ready content architecture, not a flat keyword list.",
    "evidence": ["src/components/ai/KeywordResearch.tsx:220", "src/components/ai/KeywordResearch.tsx:40", "src/components/ai/KeywordResearch.tsx:442"],
    "code_check": "runClusters posts keywords+intent+volume to the keyword-clusters AI tool; opportunity semantics documented in footerNote; ClusterCard renders pillar/supporting/totalVolume.",
    "verdict": "confirmed",
    "l2_priority": "n/a"
  }
]
```

## Scored acceptance criteria

- [x] Leaves knowing the few queries worth targeting, by winnable intent — **yes**
  (GFO-STR-01/03); minor caveat that magnitudes are synthetic pre-connect (GFO-01).
- [x] At least one target becomes a brief + draft grounded in his product — **yes**
  (GFO-STR-02).
- [x] Whole path works without an ad account, budget, or paid-spend metrics — **yes**;
  no paid gating anywhere in this journey.
- [x] Draft clears his senior bar enough to publish with light editing — **plausible at
  L1** (grounded inputs + SEO scorecard + SERP preview; live quality unverified).

## Time-saved (designed experience)

Manually finding the few winnable comparison queries and turning one into a brief + draft
is a solid half-day for him. This path plausibly compresses it to ~20–30 min, and the
compare surface's brand/competitor grounding is something he couldn't easily replicate
with a generic keyword tool. **Estimated saved: ~3.5 h · confidence: medium-high** (the
path is clean, connected, and grounded; only the demand magnitudes are synthetic).

## Verdict: **L1-pass**

The organic-discovery journey is the app's strongest showing for Standa: keyword research
→ app-only comparison queries grounded in his brand and competitors → a seeded, grounded
brief → a shippable draft, entirely budget-free and connected end to end. Caveats are
minor and honestly labeled (synthetic volumes pre-connection; empty starter competitors
suppress 'vs' rows on a fresh project). No blockers; no dead-ends on this path.
