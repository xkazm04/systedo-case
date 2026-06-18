# Feature Scout — Lokální dominance (`/app/[projectId]/lokalni`)

> Module: src/components/app/modules/LocalModule.tsx
> Project type: leadgen
> Total: 5 ideas

## 1. Local rank surfaced as a service×location grid (the unused `rank` field)
- **Category**: functionality
- **Impact**: 9
- **Effort**: 4
- **Risk**: 2
- **Gap today**: `LocalTarget.rank` is captured in the data model (src/lib/local/sample.ts:13, populated for every covered row e.g. Praha=4, Brno=9, Plzeň=12) but is **never rendered anywhere** in LocalModule.tsx. The UI shows only a flat "missing pages" gap table; covered combinations and their actual SERP position are invisible. The module is literally called "dominance" yet doesn't show where you rank.
- **Proposal**: Replace/augment the gap table with a true service×location matrix: rows = services, columns = areas, each cell colored by `rank` (1–3 green, 4–10 amber, 11+ coral, no-page = grey "chybí"). Add a `coveredButWeak` rollup in compute.ts (hasPage && rank > 10) and a KPI tile "Slabé pozice" next to "Pokrytí". This turns three disconnected lists into one at-a-glance dominance board.
- **User value**: A leadgen agency instantly sees not just *where they have no page* but *where they have a page that isn't ranking* — the higher-leverage problem (a page stuck at #12 needs SEO, not a new microsite).
- **Fit**: Pure extension of existing data + `localSummary`/`gaps` pattern in compute.ts; matches the matrix vibe promised by the blurb ("Pokrytí služba×lokalita") which the current flat table only half-delivers.

## 2. AI review-response drafting per location
- **Category**: feature
- **Impact**: 8
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Reviews are shown as static count+rating cards per area (LocalModule.tsx:84-92, `ReviewProfile` = area/reviews/rating only). The footer seam mentions a "reviews API" but there is zero interaction — no review text, no response workflow — even though every other studio module (e.g. rychla-reakce "AI návrh odpovědi", obsah brief) uses the `generateStructured` LLM wrapper with a demo fallback.
- **Proposal**: Add a `recentReviews` array (author/rating/text/area) to the reputation panel and a "Navrhnout odpověď" action that calls `generateStructured` (src/lib/llm) with a localized Czech system prompt to draft a tone-appropriate reply (thank-you for 5★, de-escalation + offline-offer for ≤3★), respecting the deterministic-demo pattern so it works from a clean checkout. Tag it `// llm-tool: local-review-reply`.
- **User value**: Responding to local reviews is a proven GBP ranking + trust signal; agencies do it manually across many clients. One-click localized drafts are a direct time-saver that mirrors the existing "Rychlá reakce" value prop.
- **Fit**: Reuses the established single LLM wrapper + demo fallback convention; deepens the "reputace z recenzí" half of the blurb that is currently read-only.

## 3. One-click service-area landing-page generator for the top gaps
- **Category**: feature
- **Impact**: 8
- **Effort**: 6
- **Risk**: 4
- **Gap today**: The gap table's footer literally instructs "Pro každou mezeru nasaďte lokální microsite (/m/…)" (LocalModule.tsx:75-78) and `sample.ts` documents "pages shipped as microsites (/m/[slug])" — but there is no generator, no draft, no link. The user is told what to do and given no tool to do it.
- **Proposal**: Add a "Vygenerovat stránku" action on each gap row that calls `generateStructured` to produce a localized landing-page brief (H1, meta title/description, 3 section outlines, FAQ, suggested `/m/<service>-<area>` slug, plus a copy-pasteable LocalBusiness schema stub). Sort by `monthlyVolume` (already done in `gaps()`), and let it batch the top N gaps. Output as a downloadable/copyable brief, no publishing required for the case study.
- **User value**: Converts the highest-volume coverage gaps into ready-to-ship page drafts, closing the loop the module already diagnoses — the single biggest revenue lever in local leadgen.
- **Fit**: Lead-gen project type lives on local landing pages; directly fulfills the module's own stated next action and reuses the LLM + JSON-schema convention.

## 4. NAP / citation & GBP consistency checker
- **Category**: functionality
- **Impact**: 7
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Reputation is modeled per area but there is no notion of the business's NAP (name/address/phone) or its presence across local directories — a core local-SEO health signal that's entirely absent from the data model and UI.
- **Proposal**: Add a `LocalListing` model (directory name, present?, nameMatch/addressMatch/phoneMatch booleans, lastSeen) and a "Konzistence zápisů" panel that scores citation consistency (e.g. Firmy.cz, Google, Seznam, Mapy.cz) with a coral badge per inconsistency. Add a `citationHealth` rollup to compute.ts and a KPI tile. Seed sample data illustratively; the footer seam already names GBP as the real integration.
- **User value**: Inconsistent NAP across Czech directories silently caps local-pack ranking; surfacing a prioritized fix list is a concrete, recognizable local-SEO deliverable agencies sell.
- **Fit**: Extends the same pure-rollup + sample-data + Pill-badge pattern as coverage/reputation; squarely inside "lokální dominance" scope.

## 5. NextSteps wiring + competitor local share-of-voice
- **Category**: user_benefit
- **Impact**: 6
- **Effort**: 3
- **Risk**: 2
- **Gap today**: LocalModule.tsx renders **no `NextSteps` strip** — unlike its leadgen siblings (LeadQualityModule.tsx:97 links to `kampane`), so this module is a dead-end in the cross-link graph the product is explicitly built around (NextSteps.tsx doc comment). Separately, gaps/rank are shown in a vacuum with no competitor context (no SoV signal).
- **Proposal**: (a) Add a `NextSteps` strip linking the highest-volume gap → `kampane` ("Spustit lokální kampaň") and weak reviews → `rychla-reakce` ("Zrychlit reakci na poptávky"), making local findings actionable. (b) Add a lightweight per-area "podíl hlasu" estimate (your rank vs. an illustrative competitor-presence count) shown as a small bar beside each area in the reputation grid, so dominance is framed relative to rivals, not absolute.
- **User value**: Turns a diagnostic dead-end into a workflow that routes the user to the module that fixes each finding, and reframes "we rank #4" as "we hold 38% of the local pack" — the language clients understand.
- **Fit**: NextSteps is the product's canonical cross-link mechanism (every connected module uses it); SoV deepens "dominance" with minimal new data. Lowest effort of the five.
