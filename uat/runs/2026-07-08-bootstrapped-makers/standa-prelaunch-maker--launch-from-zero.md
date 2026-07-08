# L1 UAT — Standa (pre-launch maker) · Journey: launch-from-zero

- **Character:** standa-prelaunch-maker (`uat/characters/standa-prelaunch-maker.md`)
- **Journey:** `uat/journeys/launch-from-zero.md`
- **Surface:** `app` project type (demo-app / "Flowbase")
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Date:** 2026-07-08
- **Verdict:** **L1-conditional**

---

## First-person review (Standa's voice)

Okay. Launch is in three weeks, I have a landing page and a name and literally zero
of anything else — no users, no traffic, no budget, no ad account I want to plug in.
The whole reason I opened this thing is to find out: does it work for *me*, right now,
when I have nothing to show it?

Two answers, and they're opposite.

The **making** side is genuinely good. I go to Klíčová slova, type my topic, and I get
back real-looking keyword ideas — volume, competition, CPC, intent, an opportunity
score that ranks them for me. No "connect your account first" wall. It even tells me
honestly it's sample data until I hook up Google Ads. Then one button — "Vytvořit brief
z výběru" — carries my picks straight into the content engine, which opens a brief
generator seeded with my topic and keywords: title + meta in SEO limits, an H2 outline,
FAQ, internal-link ideas, a SERP preview using *my* domain, and then a full article
draft I can export as Markdown. That's the thing I came for. From zero, in one sitting,
I can go from "a topic" to "a draft I could publish." That's a real day of work
compressed.

But then I did the thing I always do — I poked the modules that are supposed to need
data I don't have, to see if they'd be honest about it. And this is where my old scar
started aching.

I open **Výkon**. It's a full performance dashboard. Visits, cost, CAC, registrations,
conversion trends, channel breakdowns — all populated, all confident, all for an app
that *has never had a single visitor*. There's no "you have no data yet," no sample-data
label, nothing. Just invented numbers wearing the costume of my reality. This is exactly
the lie that burned me last time: a dashboard that pretends. If I hadn't built things
before, I might believe it.

Then **CAC → LTV**. Cohort retention curves, payback months, LTV:CAC ratios — for
customers I don't have. At least this one puts a little "sample data" note at the top,
which is more honest than Výkon. But it's still a fully-drawn financial analysis of a
business that doesn't exist yet. I don't want a fake analysis. I want it to say "come
back when you have signups, here's what you'll see."

And the **Obsahový engine** tables — the top of the screen shows me topic clusters about
*baby sleep* and *breastfeeding* and "best strollers 2024" and a decaying post about car
seats. I build project-management software. None of this is mine. It's clearly seeded
demo content that never changed to reflect my project. The "New content" button works
fine and ignores all of it — but the default view is someone else's business handed to
me as if it were my inventory.

The one module that got the empty state *right* was **Knihovna vzorů**: "No data to
analyse yet — sync campaigns," and "Nothing saved yet — pin detected patterns or add
your own." That's the tone I wanted everywhere. It teaches, it redirects, it lets me add
my own. If Výkon and LTV did that, I'd trust this whole app.

So: the tool that helps me *make* my launch content is here and it's good. But half the
modules I opened either faked data or showed me a stranger's business. For someone whose
entire test is "be honest when I have nothing," that's a real problem — the making
surfaces earn my trust and the data surfaces spend it right back.

---

## Reachability check (modules.ts · `app`)

All surfaces Standa touches are available for `app` (`src/lib/projects/modules.ts:53–367`):
Přehled (`""`), Výkon (`vykon`), Klíčová slova (`klicova-slova`), Obsahový engine
(`obsahovy-engine`), Sociální sítě (`socialni`), Knihovna vzorů (`knihovna`),
CAC→LTV (`ltv`), Srovnání & SEO (`srovnani-seo`). No reachability dead-ends.

## Empty-state audit (his signature class)

| Module | Zero-data behavior | Verdict |
|--------|--------------------|---------|
| Klíčová slova | Teaching empty state (`ToolEmpty`), works on any typed topic | ✅ good |
| Obsahový engine (brief/draft) | `ToolEmpty` until submit; works from user input | ✅ good |
| Knihovna vzorů | Honest teaching empty state + manual add | ✅ good |
| Obsahový engine (tables) | Hardcoded baby-product clusters/decay, only volume scaled | ⚠️ misgrounded fiction |
| CAC → LTV | Fully-drawn fake cohorts; `SampleDataNote` present | ❌ no empty state |
| Výkon | Fully-drawn fake performance data; **no** sample note | ❌ no empty state, unlabeled |

## Grounding audit (per AI/data surface)

- **Keyword research** — `researchKeywords(userId, seed, url)` (`engine.ts:32`): grounded
  in his typed topic + intent classification; demand figures are a deterministic sample
  until an Ads account is connected, honestly labeled. **2/3.**
- **Content brief → draft** — sends topic + primaryKeyword + audience + keyword grounding,
  SERP preview grounded in his real domain (`ContentBriefGenerator.tsx:353,443,574`). All
  the context he *can* provide reaches the prompt; no data he lacks is required. **4/4.**
- **Obsahový engine cluster/decay tables** — hardcoded `SAMPLE_CLUSTERS`/`SAMPLE_DECAY`,
  project-independent except a volume scale (`content-engine/sample.ts:30–74`). **0/2.**
- **Výkon** — `getProjectDataset` scales a base series deterministically; never his data,
  never empty (`dataset.ts:48–54`, `seed.ts:26–34`). **0/1.**
- **CAC→LTV** — static `SAMPLE_COHORTS` (`ltv/page.tsx:15`), project-independent. **0/1.**

**Journey grounding: creation surfaces 6/7 · data-probe surfaces 0/4.**

---

## Findings

```json
[
  {
    "id": "STANDA-LFZ-01",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "trust",
    "dimension": "Trust",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "app: Výkon is the 2nd sidebar item, opened immediately", "trust_erosion": "high" },
    "title": "Výkon renders fabricated performance data for a zero-traffic project — no empty state, no sample-data label",
    "expected": "A pre-launch project with no traffic should show a teaching empty state ('no data yet — here is what will appear once you launch / connect analytics'), not invented metrics.",
    "got": "DashboardClient always renders KPIs, trends and channel breakdowns from getProjectDataset(), which scales a base series by a per-project factor that is never zero. There is no zero-data branch and no SampleDataNote (unlike ltv/srovnani-seo). A never-launched app shows confident visits/CAC/signups/conversions.",
    "evidence": ["src/app/app/[projectId]/vykon/page.tsx:14", "src/lib/project-data/dataset.ts:48", "src/lib/project-data/seed.ts:26", "src/components/dashboard/DashboardClient.tsx:38"],
    "code_check": "vykon/page.tsx passes getProjectDataset(project) unconditionally; dataset.ts scaledDataset multiplies the base daily series by projectScale (0.7–1.8×type, never 0); DashboardClient has no empty/zero branch. No SampleDataNote import in vykon/page.tsx.",
    "verdict": "confirmed",
    "l2_priority": "high",
    "scope_note": "Directly hits his named pet peeves: 'faking metrics' and 'a dashboard that shows zeros and calls it a day' — worse, non-zero fiction."
  },
  {
    "id": "STANDA-LFZ-02",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "trust",
    "dimension": "Trust",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "app: CAC→LTV in Insights, deliberately opened", "trust_erosion": "medium-high" },
    "title": "CAC→LTV shows a full fake cohort analysis for an app with zero users; the honest signal is only a small sample-data note",
    "expected": "A module that needs history he lacks should degrade to a teaching empty state that says which integration/data to bring, not render invented retention curves, payback and LTV:CAC.",
    "got": "ltv/page.tsx always feeds LtvModule static SAMPLE_COHORTS (project-independent). LtvModule has no empty-state branch — it renders KPI tiles, cohort table with retention sparklines, and channel economics regardless. A top SampleDataNote mitigates but the analysis reads as a real financial verdict on a non-existent business.",
    "evidence": ["src/app/app/[projectId]/ltv/page.tsx:15", "src/components/app/modules/LtvModule.tsx:217", "src/components/app/modules/LtvModule.tsx:414"],
    "code_check": "cohorts = SAMPLE_COHORTS (static array, not derived from project); LtvModule renders rows/summary/channels with no length-0 guard; the real 'seam: connect product analytics' hint is a table footnote (:414).",
    "verdict": "confirmed",
    "l2_priority": "high"
  },
  {
    "id": "STANDA-LFZ-03",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Trust",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "app: Obsahový engine, primary studio module", "trust_erosion": "medium" },
    "title": "Obsahový engine's cluster/decay tables show a hardcoded baby-products business unrelated to his app",
    "expected": "The content-inventory view should reflect his project (or be empty/teaching), so it reads as his own content gaps.",
    "got": "clustersForProject returns hardcoded SAMPLE_CLUSTERS ('spánek miminka', 'kojení', 'příkrmy') and SAMPLE_DECAY ('Nejlepší kočárky 2024', 'Výbavička do porodnice') with only the volume scaled per project. For a project-management app these tables are a stranger's business presented as his inventory. The 'Nový obsah' → brief path works from zero and ignores them; a 'Ukázková data' pill does label the source.",
    "evidence": ["src/lib/content-engine/sample.ts:30", "src/lib/content-engine/sample.ts:60", "src/lib/content-engine/sample.ts:71", "src/app/app/[projectId]/obsahovy-engine/page.tsx:15", "src/components/app/modules/ContentEngine.tsx:252"],
    "code_check": "SAMPLE_CLUSTERS/SAMPLE_DECAY are literal baby-content arrays; clustersForProject only maps volume via projectVary; ContentEngine renders them directly; the sample/live pill at :252 labels source but content is not project-grounded.",
    "verdict": "confirmed",
    "l2_priority": "medium"
  },
  {
    "id": "STANDA-LFZ-04",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Senior-quality",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "app: Klíčová slova, his first stop", "trust_erosion": "low-medium" },
    "title": "'Demand validation' is deterministic sample fiction until a Google Ads account is connected",
    "expected": "His headline JTBD is 'are people actually searching for this?' — the app should either give a real demand signal or make crystal clear that the free-but-account-gated real signal exists.",
    "got": "Keyless/anonymous research falls back to sampleKeywordIdeas(seed) — deterministic synthetic volumes. It is honestly labeled 'Ukázková data' and the footnote explains live data needs Google Ads Keyword Planner (free, no spend), but the value promise ('validate demand') is soft pre-connection and the path to the free real signal isn't foregrounded.",
    "evidence": ["src/lib/keywords/engine.ts:32", "src/components/ai/KeywordResearch.tsx:40", "src/components/ai/KeywordResearch.tsx:349"],
    "code_check": "fetchRaw returns sampleKeywordIdeas(seed) whenever no connected Ads account; footerNote discloses live vs sample. Honest labeling present; discoverability of the free Keyword Planner path is weak.",
    "verdict": "confirmed",
    "l2_priority": "medium",
    "scope_note": "Not budget-gated (Keyword Planner is free), but account-gated — softens his 'nothing forces an existing audience/budget' criterion only slightly."
  },
  {
    "id": "STANDA-LFZ-05",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Clarity",
    "severity": "minor",
    "impact": { "frequency": "medium", "reachability": "app: sample-labeled modules", "trust_erosion": "medium" },
    "title": "Sample-data honesty is inconsistent across modules (LTV + Compare labeled, Výkon not)",
    "expected": "Every module that renders demo data pre-launch should carry the same honest 'sample data' signal.",
    "got": "srovnani-seo and ltv render a SampleDataNote; vykon does not, despite showing the same class of fabricated figures. The inconsistency makes Výkon read as real when neighbouring modules admit they're demos.",
    "evidence": ["src/app/app/[projectId]/srovnani-seo/page.tsx:31", "src/app/app/[projectId]/ltv/page.tsx:21", "src/app/app/[projectId]/vykon/page.tsx:14"],
    "code_check": "SampleDataNote imported/rendered in srovnani-seo and ltv pages; absent from vykon page.",
    "verdict": "confirmed",
    "l2_priority": "medium"
  },
  {
    "id": "STANDA-LFZ-STR-01",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "strength",
    "dimension": "Completion",
    "severity": "polish",
    "impact": { "frequency": "high", "reachability": "app: keywords → obsahový engine, the core path", "trust_erosion": "none" },
    "title": "Keywords → brief → article draft works fully from zero, no budget/audience/connection required",
    "expected": "Content and keyword modules produce useful output with zero historical data.",
    "got": "KeywordResearch works on any typed topic and hands selections to the brief via sessionStorage; ContentBriefGenerator produces SEO metadata (SERP preview on his real domain), outline, FAQ, internal links, an SEO scorecard, and a full article draft exportable as Markdown — all from user-supplied context.",
    "evidence": ["src/components/app/modules/KeywordsModule.tsx:18", "src/components/app/modules/ContentEngine.tsx:205", "src/components/ai/ContentBriefGenerator.tsx:360", "src/components/ai/ContentBriefGenerator.tsx:574"],
    "code_check": "onCreateBrief writes BriefSeed to sessionStorage → ContentEngine reads it on mount and opens the seeded workspace; brief run() requires only topic+keyword+audience.",
    "verdict": "confirmed",
    "l2_priority": "n/a"
  },
  {
    "id": "STANDA-LFZ-STR-02",
    "journey": "launch-from-zero",
    "character": "standa-prelaunch-maker",
    "cert_level": "L1",
    "type": "strength",
    "dimension": "Clarity",
    "severity": "polish",
    "impact": { "frequency": "medium", "reachability": "app: Knihovna vzorů, a data-probe module", "trust_erosion": "none" },
    "title": "Knihovna vzorů is the model empty state — teaches, redirects, and offers manual add",
    "expected": "A data-dependent module he opens should teach/redirect instead of dead-ending.",
    "got": "With no synced campaigns it shows 'No data to analyse yet — sync campaigns' for auto-detected patterns and 'Nothing saved yet — pin detected patterns or add your own' for the library, plus a manual-add form. Exactly the honest tone he wants everywhere.",
    "evidence": ["src/components/patterns/PatternsLibrary.tsx:35", "src/components/patterns/PatternsLibrary.tsx:329", "src/components/patterns/PatternsLibrary.tsx:309"],
    "code_check": "noData/emptyLibrary strings rendered on empty auto/saved arrays; ManualAdd present for authed users.",
    "verdict": "confirmed",
    "l2_priority": "n/a"
  }
]
```

## Scored acceptance criteria

- [x] Keyword/demand + content modules produce useful output with zero data — **yes** (LFZ-STR-01).
- [~] Every data-dependent module has a helpful empty state — **mixed**: Knihovna good; Výkon + CAC→LTV + content-engine tables fail (LFZ-01/02/03).
- [x] Leaves with a concrete pre-launch plan in one sitting — **yes**, via keywords → brief → draft.
- [x] Nothing forces a budget or existing audience — **yes** (real demand data is account-gated but free; LFZ-04).
- [~] Honest about the unknowable — **partial**: LTV/Compare labeled sample; Výkon fabricates unlabeled (LFZ-01/05).

## Time-saved (designed experience)

Manual pre-launch (keyword spelunking + outlining a content plan + drafting) is his
"full day done badly." The working creation path plausibly compresses that to ~25–35
min. **Estimated saved: ~4 h · confidence: medium** (real model calls; draft quality
unverified at L1, and he must ignore three fabricated data modules to stay on the good
path).

## Verdict: **L1-conditional**

His core job — validate topics and pre-seed rankable content from zero — is achievable
and grounded on the creation surfaces. But his signature test (honest empty states) fails
on three of the four data modules he deliberately opened, and Výkon fabricates metrics
with no sample label. Conditional on: real teaching empty states for Výkon + CAC→LTV,
project-grounded (or empty) content-engine tables, and a uniform sample-data signal.
