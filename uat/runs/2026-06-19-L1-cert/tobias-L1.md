# L1 (theoretical) certification — Tobias (SaaS growth lead)

- **Skill under test:** simulated UAT (L1 = reason only over source; no app run, no browser)
- **Character:** Tobias — SaaS growth lead, content-led acquisition (`uat/characters/tobias-saas-growth.md`)
- **Journey:** Build a coherent topic cluster from keywords, see where I beat/lose competitors in search, get a distribution plan (`uat/journeys/build-content-cluster.md`)
- **Date:** 2026-06-19
- **Verdict:** **L1-fail** (one scored, load-bearing criterion is contradicted by code design; the rest pass)

---

## (a) Surface model

Four sub-surfaces, all gated by `requireProjectModule(projectId, …)` and rendered inside `ModulePage`. All seed data is illustrative (`SAMPLE_*`) with documented "real-integration seams."

### 1. Keywords — `/klicova-slova` (entry point)
- Route: `src/app/app/[projectId]/klicova-slova/page.tsx:13` → `KeywordsModule` → `KeywordResearch`.
- Data grounding is real-or-sample: `researchKeywords()` uses the live Google Ads Keyword Planner when the user has a connected Ads account + dev token + OAuth token, else a deterministic sample — `src/lib/keywords/engine.ts:18-33`. So volume/competition/CPC are *real demand data* when connected.
- Derived signals computed deterministically: intent classification (Czech-aware keyword markers) `src/lib/keywords/types.ts:117-123`; opportunity score = 60% normalized volume + 40% inverse competition `src/lib/keywords/types.ts:127-131`.
- Affordances: research form (seed + optional URL) → ranked ideas → multi-select → **save as list** (core/watch tags, `src/components/ai/KeywordResearch.tsx:175+`), **create brief**, and inline **AI clustering** (`runClusters`, `src/components/ai/KeywordResearch.tsx:133-144`). Clustering payload carries `{keyword, volume, intent}` — grouping is by real demand, not bare phrases.

### 2. Content engine — `/obsahovy-engine`
- Route: `src/app/app/[projectId]/obsahovy-engine/page.tsx:15` → `ContentEngineModule(clusters=SAMPLE_CLUSTERS, decay=SAMPLE_DECAY)`.
- **Cluster coverage logic is genuinely senior** (`src/lib/content-engine/compute.ts`): weighted completeness where a published **pillar is worth 3×** a supporting page (`PILLAR_WEIGHT=3`, `:7-58`) — so "three supporting articles, no pillar" correctly reads as incomplete. `nextGap()` makes a **missing pillar always the next article** because it unlocks cluster authority (`:63-68`). `rankedClusterStats()` surfaces least-complete-first, volume as tiebreak (`:104-108`).
- **Internal-link debt is modeled**: hub-and-spoke graph where a published supporting page not linked to a published pillar is "link debt," surfaced coral in `ClusterLinkMap` (`src/lib/content-engine/compute.ts:72-85`, `src/components/app/modules/ClusterLinkMap.tsx:33-59`). This is exactly the pillar-cluster mechanic a senior SEO cares about.
- **ClusterBuilder** (`src/components/app/modules/ClusterBuilder.tsx`) closes the keyword→cluster loop: it loads the user's **saved keyword lists** (`/api/keywords/lists`), sends `{keyword, volume:avgMonthlySearches, intent}` to the `keyword-clusters` AI tool (`:64-74`), and each generated cluster has a one-click **"Vytvořit brief"** that seeds the content brief (pillar = primary keyword, supporting = grounding set) via sessionStorage + route handoff (`:79-91`). So the cluster is real-keyword-grounded *and* actionable.
- `ClusterNextStep` (`src/components/app/modules/ClusterNextStep.tsx`) and `DecayTable` both route into `/obsah` (AI brief). NextSteps points to Obsah + Distribuce (`ContentEngineModule.tsx:85-90`).

### 3. SEO comparison — `/srovnani-seo`
- Route: `src/app/app/[projectId]/srovnani-seo/page.tsx:15` → `CompareSeoModule(queries=SAMPLE_QUERIES)` → `CompareSeoTable`.
- Data model (`src/lib/seo-compare/sample.ts:7-28`): each query has `{query, intent, volume, difficulty, rank}` where `rank` = **the project's own** current SERP position or null. **There is no competitor entity anywhere** — no competitor domains, no competitor SERP positions, no SERP feature/gap dataset. Grep of the entire `src/lib/seo-compare` dir for competitor/SERP terms returns a single hit: the `rank` comment (`sample.ts:14`).
- Scoring (`src/lib/seo-compare/compute.ts:57-71`): opportunity = `volume × intentWeight × rankFactor ÷ max(20, difficulty)`. `rankFactor` rewards white-space — 1.3× when not ranking, 1.15× when rank>10, down to 0.3× in top-3 (`:50-55`). Intent weights default pricing 1.4 > alternative 1.3 > vs 1.2 > review 1.0 (`:33-42`). User-tunable via the "Ladění skóre" panel (sliders, persisted per-project to localStorage; `CompareSeoTable.tsx:312-426, 449-458`).
- AI: per-row **"Vygenerovat srovnání"** calls the `comparison-outline` tool (`CompareSeoTable.tsx:199-202`) and renders an inline scaffold (H1, sections, comparison criteria, verdict, FAQ) with a "Předat do briefu" handoff (`ScaffoldPanel`, `:90-179`).
- **Grounding of that AI output (decisive):** `src/lib/ai/tools/comparison-outline.ts:9-13, 25-40, 59`. The system prompt **explicitly tells the model it has NO competitor data** and must keep entity names generic/placeholder ("daný nástroj", "alternativní řešení") and **not invent** specific competitor facts, prices, or product names. The deterministic `demo()` is a pure intent-template (vs/alternative/pricing/review) with literal placeholder copy like "Kdy zvolit první řešení / druhé řešení" and FAQ "Doplňte podle aktuálních ceníků obou nástrojů" (`:142-205`). It is a publish-ready *skeleton for an editor to fill*, by design — not a competitor-gap analysis.

### 4. Distribution — `/distribuce`
- Route: `src/app/app/[projectId]/distribuce/page.tsx:15` → `DistributionModule(source=SAMPLE_SOURCE, attribution=SAMPLE_ATTRIBUTION)`.
- **Repurposing is concrete and channel-aware**: deterministic `repurpose()` produces 4 channel-native variants (Newsletter/LinkedIn/Instagram/X) each honoring a soft char budget and carrying a **per-channel UTM-stamped link** (`src/lib/distribution/generate.ts:20-61`). The AI `repurpose` tool can swap in model text per channel; deterministic stays as the fallback (`DistributionModule.tsx:161-235`).
- Per-variant affordances: live length counter + over-budget trim, copy, copy UTM link, **"Naplánovat na {platform}"** which POSTs a scheduled draft to `/api/social/posts` and routes to the social center (`DistributionModule.tsx:237-262`); Newsletter gets a dedicated subject/body split + HTML export (`:424-530`).
- **Attribution table** (`:80-120`): per-channel reach / clicks / CTR / share, rows keyed to `utm_source`. **Learnings panel** (`:572-644`, `src/lib/distribution/learnings.ts`): reach-weighted-CTR rollup picking best channel / format / length + a hand-rolled CTR sparkline.

---

## (b) L1 findings

```json
[
  {
    "id": "L1-TOB-01",
    "cert_level": "L1",
    "type": "scope-gap",
    "dimension": "task-fit / senior-quality",
    "severity": "high",
    "title": "SEO 'comparison' is NOT competitor-grounded — by explicit prompt design it cannot name a single real competitor gap",
    "expected": "Tobias's scored criterion: 'SEO comparison cites specific, real competitor gaps.' The Ahrefs SERP-gap bar in the character + journey references. He wants 'where do we actually beat/lose them in search.'",
    "got": "There is no competitor dataset at all (no competitor domains, no competitor SERP positions). The comparison-outline system prompt forbids the model from inventing competitor facts/names/prices and tells it to use placeholders ('daný nástroj', 'alternativní řešení'). The output is a generic publish-ready page skeleton; its FAQ answers are literally 'Doplňte podle aktuálních ceníků obou nástrojů'. The 'rank' field is the project's OWN position, never compared against a rival.",
    "evidence": "src/lib/ai/tools/comparison-outline.ts:9-13,39,59,153-155; src/lib/seo-compare/sample.ts:7-28; src/lib/seo-compare/compute.ts:50-71",
    "code_check": "grep -rE 'competitor|konkuren|domain|serp' src/lib/seo-compare → only the 'rank' comment; comparison-outline.ts prompt contains 'NEMÁŠ k dispozici data o konkrétních konkurentech'.",
    "suggested_acceptance": "Given a comparison query, the SEO surface SHOULD name at least one specific rival and a concrete, query-anchored gap ('competitor X ranks #2 for \"asana alternativa\" with no pricing table; we rank null → write a pricing-led comparison'). Requires a competitor/SERP dataset seam (even sample-grade: rival domain + rank + a gap tag per query) feeding both the table and the outline prompt. Until then, the surface should be labeled 'comparison-page scaffold builder', not 'competitor SEO comparison'."
  },
  {
    "id": "L1-TOB-02",
    "cert_level": "L1",
    "type": "acquisition-tie-gap",
    "dimension": "acquisition / conversion",
    "severity": "medium",
    "title": "Whole flow optimizes for traffic/clicks/CTR — no line drawn to sign-ups, conversion, or CAC",
    "expected": "Tobias: 'Traffic's nice — does it convert to sign-ups?' Scored: 'Tied to acquisition (not vanity traffic).' He's judged on sign-ups/CAC.",
    "got": "Cluster ranking is by volume + completeness; SEO opportunity is volume × intent × white-space ÷ difficulty; distribution learnings rank by CTR / reach / clicks. Intent weighting (pricing>alternative>vs>review, compute.ts:33-42) is the ONLY proxy for conversion intent, and it's a coarse buying-stage multiplier, not a sign-up/conversion signal. No conversion-rate, sign-up, lead, or CAC field exists in any of the four data models.",
    "evidence": "src/lib/seo-compare/compute.ts:57-71; src/lib/content-engine/compute.ts:104-108; src/lib/distribution/learnings.ts:108-133; src/lib/distribution/sample.ts:10-26 (reach/clicks only)",
    "code_check": "grep for 'signup|sign-up|conversion|konverze|lead|CAC' across the four libs → only campaign/lead modules elsewhere; none in content-engine/seo-compare/distribution data.",
    "suggested_acceptance": "Distribution attribution and SEO scoring SHOULD carry at least a conversion/sign-up column (or a configurable goal-event) so a channel/query can be ranked by clicks→sign-ups, not clicks alone — turning 'best channel by CTR' into 'best channel by sign-ups per reach'. The intent-weight panel is a reasonable v1 conversion proxy but should be named as such."
  },
  {
    "id": "L1-TOB-03",
    "cert_level": "L1",
    "type": "continuity-gap",
    "dimension": "flow / journey continuity",
    "severity": "low",
    "title": "Engine clusters and SEO/keyword data are two disconnected worlds at the surface level",
    "expected": "One coherent engine: the clusters I build from my keywords feed the engine's coverage view and the SEO comparison.",
    "got": "The /obsahovy-engine grid renders 100% static SAMPLE_CLUSTERS (parenting-niche: 'spánek miminka', 'kojení'), while ClusterBuilder below it generates clusters from the user's real saved keyword lists — they never merge; the AI clusters can only flow to /obsah (brief), not into the coverage grid. SEO comparison queries (SaaS-niche: 'asana alternativa') share no keys with either. Cross-surface, the three sets are independent samples.",
    "evidence": "src/app/app/[projectId]/obsahovy-engine/page.tsx:15 (SAMPLE_CLUSTERS); src/components/app/modules/ClusterBuilder.tsx:64-91 (only path out is /obsah); src/lib/seo-compare/sample.ts:18-28",
    "code_check": "ContentEngineModule receives static clusters; ClusterBuilder's generated clusters are not appended to `stats`. No shared keyword/cluster store between the three surfaces.",
    "suggested_acceptance": "A cluster built in ClusterBuilder SHOULD be persistable and appear in the coverage grid (with completeness/link-debt), so the engine reflects MY keyword research rather than a fixed demo set."
  }
]
```

### Passing / strong dimensions (for balance)
- **Cluster coherence + keyword grounding (PASS, senior-grade).** `keyword-clusters` tool is strictly input-anchored: the prompt forbids inventing keywords, and `normalizeKeywordClusters` *drops* any returned keyword not in the input set, dedupes across clusters, and sums `totalVolume` from supplied volumes; a deterministic head-term `demo()` is the floor (`src/lib/ai/tools/keyword-clusters.ts:25-35,156-207,119-150`). Pillar+supporting structure is exactly the topic-cluster model. This meets "clusters coherent and grounded in real keyword data."
- **Distribution concreteness (PASS).** Channel-native variants, real char budgets, per-channel UTM links visible+copyable, schedule-to-social handoff, newsletter HTML export, CTR/format/length learnings. This clears "distribution guidance is concrete and actionable" — and it's verifiably attributable (UTM), which Tobias would respect.
- **Faster-than-manual (PASS, qualified).** Keyword→cluster→brief and query→scaffold→brief are one- to two-click handoffs; this plausibly compresses his manual cluster build to minutes. The SEO half saves less than claimed because the editor must supply all the real competitor substance (see L1-TOB-01).

---

## (c) L1 verdict

**L1-fail.**

Rationale: of Tobias's four identically-scored criteria, two pass strongly (clusters coherent+grounded; distribution concrete), one passes qualified (faster than manual), but **"SEO comparison cites specific, real competitor gaps" is contradicted at the design level** — the code intentionally has no competitor data and the prompt forbids producing any (L1-TOB-01), and the acquisition tie is absent (L1-TOB-02). For a character whose entire thesis and named reference bar is Ahrefs-style competitor SERP-gap analysis, a comparison surface that cannot name one rival or one real gap is a fail on a load-bearing criterion, not a polish nit. The honesty of the design (it openly says "no competitor data") is the right engineering call but does not satisfy the journey's definition of done.

---

## (d) Character feedback — in Tobias's voice

The cluster engine? Genuinely good. You weighted the pillar 3× a supporting page, so a cluster with no pillar reads as incomplete even with three subpages live — that's the call I'd make, and most tools get it wrong. You surface internal-link debt as its own coral flag (`ClusterLinkMap`), and "next article = the missing pillar" is exactly right. And when I build a cluster from a saved keyword list, it carries real volume and intent and isn't allowed to invent keywords — I checked, your normalizer literally drops anything I didn't give it. That's the part of my 1–2-day workflow you actually compress. One click from cluster to brief. Sold on that half.

Then I hit "Srovnání & SEO" and the wheels come off for my use case. I clicked "Vygenerovat srovnání" expecting "here's where monday.com beats you for 'asana alternativa' and the gap you can take." What I get is a blank-form skeleton — "Kdy zvolit první řešení / druhé řešení," and a FAQ that literally tells me "Doplňte podle aktuálních ceníků obou nástrojů." I read the prompt: you're *telling* the model it has no competitor data and to use placeholders. That's honest, but it's not a comparison — it's a content brief with the competitor-shaped holes left blank for me to fill from Ahrefs. The "rank" column is *my* position with nothing to compare it against. So the one job I came for — "where do we actually beat them in search" — the tool structurally can't do.

And the thing that'd make me churn from this entirely: nothing connects to sign-ups. Clusters rank by volume, opportunities by white-space, distribution by CTR. Your intent weighting (pricing over review) is a nice conversion proxy, but reach and clicks are vanity until I see clicks→sign-ups. Best channel "by CTR" is not best channel for CAC. Give me one conversion column in attribution and one competitor + gap per query, and this goes from "nice cluster toy" to "replaces my spreadsheet." Right now it replaces half of it.

---

## Returned summary
See top-level response.
