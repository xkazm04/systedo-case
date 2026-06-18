# Feature Scout — Obsahový engine (`/app/[projectId]/obsahovy-engine`)

> Module: src/components/app/modules/ContentEngineModule.tsx
> Project type: content
> Total: 5 ideas

## 1. „Obnovit" — decay → AI refresh brief handoff into Obsah
- **Category**: functionality
- **Impact**: 9
- **Effort**: 3
- **Risk**: 2
- **Gap today**: The decay table (ContentEngineModule.tsx:72-83) lists upadající articles but every row is read-only — the footer (lines 87-90) only *tells* the user to go to Obsah and refresh manually. There is no per-row action, despite the exact handoff plumbing already existing for keywords (KeywordsModule.tsx:18-25 + brief-seed.ts).
- **Proposal**: Add a per-row "Obnovit" button that, like `onCreateBrief`, writes a `BriefSeed` (sample.ts → BriefSeed: topic=cluster topic, primaryKeyword=article title, plus a `refresh` flag carrying `monthsAgo` + `trafficChangePct`) to `sessionStorage` via `briefSeedKey(project.id)` and `router.push('/app/${id}/obsah')`. ContentBriefGenerator then opens pre-seeded in "refresh" mode. Make the cards client-interactive or split the table into a small client child.
- **User value**: Turns a "here's what's decaying" report into one-click remediation — the single most repetitive content-ops task (refresh-and-reoptimize) becomes two clicks instead of copy-pasting titles across modules.
- **Fit**: Reuses the established cross-module seed pattern verbatim and the existing NextSteps target ("obsah"); directly serves the registry blurb's "obnova upadajícího obsahu".

## 2. Auto-build cluster map from a saved keyword list (LLM)
- **Category**: feature
- **Impact**: 8
- **Effort**: 6
- **Risk**: 4
- **Gap today**: Clusters are 100% static seed data (sample.ts:24-52); there is no path from the keyword research the app already does (KeywordResearch.tsx, saved lists via `/api/keywords/lists`) into a TopicCluster. The pillar/supporting split is hand-authored, so the engine never reflects the project's real keyword demand.
- **Proposal**: A "Sestavit klastr z klíčových slov" action that takes a saved keyword list and calls `generateStructured` (llm/index.ts) with a schema producing `{ topic, volume, articles[] }` — the LLM groups keywords into one pillar + N supporting titles by intent/semantic proximity, summing `avgMonthlySearches` into cluster `volume`. Persist as JSON-in-repo alongside the other module data; render through existing `clusterStats`.
- **User value**: Eliminates the hardest manual step in topic-cluster SEO (deciding which queries belong to which pillar) and grounds the engine in actual search demand instead of a guess.
- **Fit**: content-type project's core workflow is keyword→cluster→article; uses the one sanctioned LLM wrapper and the existing keyword-list store. Builds the missing first half of the engine.

## 3. Cluster completeness score + "next gap" ranking
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 3
- **Risk**: 2
- **Gap today**: `clusterStats` (compute.ts:11-14) computes only `coverage = published/total`, and the UI shows a flat bar per cluster (ContentEngineModule.tsx:27-34). There is no ranking telling the user *which planned article to write next*, and a cluster with no pillar published (e.g. "příkrmy", sample.ts:46 pillar is `planned`) looks the same as a fully-pillared one.
- **Proposal**: Extend `ClusterStat` with a weighted `completeness` (pillar-published worth more than a supporting one) and a `nextGap` = highest-leverage `planned` article (prefer the missing pillar, then supporting by cluster volume). Sort cluster cards by completeness ascending and surface a "Další článek: …" line with an inline "Vytvořit brief" using the idea-#1 handoff. Flag pillar-less clusters with a coral badge.
- **User value**: Answers "what do I write next to finish this cluster?" instantly, prioritizing the missing pillar (which unlocks topical authority) over scattered supporting posts.
- **Fit**: Pure extension of the existing `compute.ts` layer (testable, no new deps) feeding the existing card UI; reinforces the pillar/supporting model the module is built around.

## 4. Internal-link graph: pillar ⇄ supporting wiring checklist
- **Category**: functionality
- **Impact**: 7
- **Effort**: 5
- **Risk**: 3
- **Gap today**: The module names pillar vs supporting articles (sample.ts:5-8, rendered ContentEngineModule.tsx:36-50) but models zero relationships between them. Internal linking is the entire point of a topic cluster, yet there is no representation of which supporting articles link to the pillar — the footer mention of "znovu prolinkujte do klastru" (line 88-89) has no supporting UI.
- **Proposal**: Add a `links?: { from: string; to: string }[]` (or per-article `linksToPillar: boolean`) to TopicCluster and a compact hub-and-spoke view per cluster showing the pillar at center with supporting articles as spokes, coloring missing/one-way links coral. A "missing links" count per cluster surfaces silent internal-link debt. Optionally derive suggested links via `generateStructured` from article titles.
- **User value**: Makes the invisible internal-link structure visible and actionable, catching the most common topic-cluster mistake (orphaned supporting articles that never link back to the pillar).
- **Fit**: Operationalizes the cluster model's reason for existing (link equity flow) and the module's own "prolinkujte do klastru" guidance; small data-model addition, big strategic payoff.

## 5. Cannibalization & coverage-gap check vs SERP/keywords
- **Category**: feature
- **Impact**: 6
- **Effort**: 6
- **Risk**: 5
- **Gap today**: Nothing detects two articles in a cluster competing for the same query (cannibalization), nor compares a cluster's articles against the keywords/queries that *should* be covered. The SERP/opportunity data already exists in a sibling module (CompareSeoModule.tsx / seo-compare) but is never cross-referenced with cluster contents.
- **Proposal**: A per-cluster "Kontrola překryvu" that (a) flags article-title pairs with high semantic overlap (cannibalization risk) and (b) compares the cluster's covered keywords against the keyword list / `CompareQuery` set to list *uncovered* high-intent queries as suggested new supporting articles. Use `generateStructured` for overlap detection; render gaps as planned-article suggestions with the idea-#1 brief handoff.
- **User value**: Surfaces two silent SEO killers — internal keyword cannibalization and cluster coverage holes — and converts the gaps directly into actionable planned articles.
- **Fit**: Connects the engine to the existing keyword/SERP data already in the content-type workspace, multiplying the value of data the app already computes; keeps the brief-handoff loop intact.
