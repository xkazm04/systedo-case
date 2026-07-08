# Pavla — "Get found organically" · L1 simulated UAT

- **Character:** Pavla (niche SEO blogger, zero ad budget, rank-or-die)
- **Journey:** `get-found-organically`
- **Surface:** `content` project type (demo-content, "Magazín")
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Date:** 2026-07-08 · cohort: bootstrapped-makers
- **Home modules:** Klíčová slova, Obsahový engine (topic-cluster + decaying-content views)

---

## Reachability (checked first)

Both of my rooms exist for `content`. `klicova-slova` and `obsahovy-engine` are `availableFor: ALL`, and `ALL` includes `content` (`src/lib/projects/modules.ts:49,88-103`, `isModuleAvailable` at `:378`). Crucially, `kampane` is **not** `availableFor: content` (`modules.ts:80`) — so nobody is going to wave a Google Ads budget at me. Reachability: **pass.**

---

## My review (first person)

I came here to answer three questions I ask every week: *which cluster has the best shot, which of my pages are dying, and can this draft me something that won't get me deindexed.* Let me go in order.

### Which cluster to build — the engine actually computes it, but not the way I rank

The Obsahový engine opens on two view-first tables: **Tematické klastry** and **Upadající obsah k obnově** (`ContentEngine.tsx:287-397`). Good — clusters AND decay side by side, which is exactly my loop. And this isn't a static list dressed up as insight: the cluster order is *computed*. `rankedClusterStats` sorts least-complete-first, tie-broken on volume desc (`compute.ts:104-108`), and "completeness" is pillar-weighted — a cluster with three supporting posts but no pillar still reads as incomplete (`PILLAR_WEIGHT = 3`, `compute.ts:7,51-58`). The status pill surfaces the single most urgent signal: missing pillar → link debt → next gap → complete (`ContentEngine.tsx:442-447`). That's real content-strategy logic, and the internal-link hub-and-spoke debt detection (`clusterLinkGraph`, `compute.ts:72-85`) is genuinely senior — most tools never catch a published spoke that isn't wired to its pillar.

But here's my problem. I said it plainly: *volume's a vanity metric; show me winnable intent.* The cluster table's only number column is **Objem/měs** (`ContentEngine.tsx:300,326`), and the priority ranking leans on that volume as its tiebreak with **no competition or difficulty signal per cluster**. So "which cluster has the best shot" gets answered as "which is least-built and biggest" — not "which is most winnable." The irony is the keyword tool right next door *does* know difficulty (see below); that winnability just doesn't carry through into the cluster ranking.

### Which of my pages are dying — the logic is right, the pages are not mine

This is my single most valuable job, and the decay logic is correct: `decayingPosts` filters anything below −10% YoY and sorts worst-first (`DECAY_THRESHOLD = -0.1`, `compute.ts:111-117`), then the High/Medium priority pill flips at −30% (`ContentEngine.tsx:380-382`). Worst-decaying first, one click into a refresh brief — that's precisely the auditing I always skip. Structurally, this is the best decay-refresh affordance I've seen.

Then I read the data and my heart sank. The decaying posts are "Nejlepší kočárky 2024", "Výbavička do porodnice", "Cvičení po porodu" — and the clusters are "spánek miminka", "kojení", "příkrmy" (`sample.ts:30-65`). That's a *baby* magazine. It is **hardcoded sample content, byte-identical for every content project**; only the cluster volume is scaled per project (`clustersForProject`, `sample.ts:71-74`) — the decay series passes through untouched. There is no seam wired to my Search Console or my CMS (the file even says so: *"Real-integration seam: keyword tool + Search Console"*, `sample.ts:2`). So the answer to "which of *my* pages are decaying" is somebody else's pages. To the app's credit, the header honestly flags **"Ukázková data"** (`ContentEngine.tsx:252`, `projectDataSource` `source.ts`), so I'm not being lied to — but honest demo data still can't tell me which of *my* posts to refresh first. At L1 this is the weak seam of my whole journey.

### Keywords — this is the part that respects how I think

The keyword tool is competition-aware, not a volume dump. `opportunityScore` is 60% normalized volume + 40% inverse competition (`types.ts:127-131`), sorted by opportunity desc (`finalizeKeywords:148`), each idea carries an intent class from a Czech-aware classifier (`classifyIntent`, `types.ts:117-123`), and I can filter the list by intent (`KeywordResearch.tsx:458-474`). The footer even states the rule I live by: *"Příležitost kombinuje vysokou hledanost s nízkou konkurencí"* (`:40`). This meets my sharpest criterion. The one bit of noise: every row shows a CPC bid range (`KeywordResearch.tsx:542-545`) — a paid metric I don't spend on — though I'll grant it doubles as a commercial-intent tell.

The AI clustering (`keyword-clusters` tool) is disciplined: it groups strictly the keywords I gave it, and `normalizeKeywordClusters` **drops any keyword the model invented** and sums volume only from my supplied numbers (`keyword-clusters.ts:155-211`). Volume + intent ride into the prompt (`:39-59`). That's tight grounding — no hallucinated keywords sneaking into my structure.

### Gap → brief → draft in one flow — yes, genuinely

From a decay row or a cluster article I land in one workspace: the row seeds `ContentBriefGenerator` (`ContentEngine.tsx:419-436, 369`), and the brief embeds `ArticleDraftPanel` right below it (`ContentBriefGenerator.tsx:665`). From the keyword tool, my selection is handed over via session storage + a route push (`KeywordsModule.tsx:18-25`), read once on mount (`ContentEngine.tsx:205-217`). One input yields gap → brief → draft → .md/.json, no retyping. And critically for me: in the content workspace the brief is mounted **without** the `onCreateAds` prop (`ContentEngine.tsx:435`), so there's no "make ads from this" button pushing me toward spend. The organic loop is the whole product here.

### Will the draft get me deindexed — no, it's disciplined

My deepest fear is thin AI slop triggering a helpful-content penalty. The prompts push back on exactly that. The brief system prompt enforces SEO limits, the primary keyword in *three* places (title, meta, first H2) with an explicit "no keyword stuffing", a 5–7 section H2 outline, real FAQ, and a rationale (`brief.ts:17-27,50-58`). When seeded from research it injects my real volume+competition per keyword and tells the model to *"upřednostni témata s vysokou hledaností a nižší konkurencí"* (`brief.ts:29-40`). The article-draft prompt demands a perex, per-section paragraphs+lists, exactly one callout and one CTA, image placeholders with **no invented URLs**, and "věcný, čtivý, užitečný, ne výplň" (`article-draft.ts:33-51`). On top of the generation there's a real, computed SEO scorecard — readability (words/sentence), keyword coverage in title/meta/intro, and E-E-A-T (meta length, FAQ depth, keyword set) — plus a **pixel-based** SERP truncation preview (Google clips by pixels, not chars) (`seo-score.ts:31-107,199-343`). That pixel table is the kind of detail a senior actually cares about. This is a strong, rankable skeleton — not filler.

Two honest caveats a senior would flag: (1) the draft is capped at ~16 blocks (`article-draft.ts:50`), so for a competitive pillar it's a strong *first* draft I'd still expand — "publish with light editing" slightly overstates it; and (2) neither brief nor draft has any **competitor / SERP grounding** — the model writes from its own knowledge with no look at what currently ranks and no source citations, which is the one thing standing between "rankable skeleton" and "rankable page."

---

## Findings

See JSON in the return payload. Summary: 4 strengths (computed cluster+decay prioritization, competition/intent-aware keywords, substantive disciplined drafts, real one-flow with no paid push), 1 major (flagship cluster+decay tables are static sample, not my Search Console/CMS), 3 minor/quality gaps (cluster priority isn't difficulty-aware; brief/draft lack competitor-SERP grounding + short cap; CPC noise for a zero-budget user).

## Grounding (per AI surface)

- **Keyword research** (`/api/keywords` → sample/live): **3/4** — grounded in my seed term + real volume + competition (live from my Keyword Planner when connected, deterministic sample otherwise; `engine.ts:12-44`, `types.ts:127-148`). Missing: no offering/SERP-difficulty context beyond the Ads competition index.
- **keyword-clusters** (LLM): **4/4** — strictly grounded in supplied keywords + volume + intent; invented keywords dropped (`keyword-clusters.ts:39-59,155-211`).
- **brief** (LLM): **3/4** — grounded in topic/keyword/audience + real per-keyword volume+competition + my domain in the SERP preview (`brief.ts:29-63`, `ContentBriefGenerator.tsx:353`). Missing: competitor/SERP-content awareness.
- **article-draft** (LLM): **3/4** — fully carries the brief (outline/FAQ/keywords) into the draft (`article-draft.ts:53-87`). Missing: source/fact grounding for E-E-A-T "experience"; ~16-block cap.
- **Cluster + decay tables** (data, non-LLM): prioritization **logic real** (`compute.ts:104-117`) but **data ~1/4** — static baby-niche sample, only volume scaled per project; no Search Console/CMS seam (`sample.ts:30-74`).

Aggregate: the keyword→brief→draft spine is well-grounded (3–4/4); the decay-refresh loop — my highest-value job — runs on illustrative data at L1.

## Time-saved (if it worked)

Cluster research + decay auditing + outlining is ~2–3 hrs/article for me, and the auditing I mostly skip entirely. The designed flow plausibly takes gap → brief → draft to ~15 min. **Est. ~2 hrs saved per article. Confidence: medium** — high on the keyword→brief→draft spine (real prompts, real opportunity scoring, real SEO scorecard), low on the decay-refresh loop until Search Console/CMS is wired, because right now it would prioritize the wrong (someone else's) pages.

## Verdict: **L1-conditional**

Everything I need is *built* and mostly meets my bar: clusters and decaying content are both surfaced and genuinely computed, keywords are competition/intent-aware, the drafts are substantive and penalty-conscious, the gap→brief→draft flow is one seamless motion, and nothing pushes me toward paid. The condition is grounding: my single most valuable answer — *which of MY pages are dying* — runs on hardcoded sample content, and the cluster ranking doesn't carry the winnability signal the keyword tool already knows. Wire the decay/cluster tables to real Search Console + CMS data and thread per-cluster difficulty through the ranking, and this goes to L1-pass. As-is: completable, time-saving on the content-production spine, conditional on real data reaching the two tables I live in.
