# Ship milestone design record: kanaly-core-path

Personas milestone id: `ff6c981c-befd-4076-aa58-a6eb508c42cb` (project `systedo-case`). Created 2026-08-28 from the operator's brief through the management API; this file is the impact analysis the cut was derived from. Goals, buckets and ratings live in the Personas Ship tab; this record travels with the code.

# Impact analysis - systedo-case (Adamant): "finding places to promote a web product" as first core path

Read-only pass, 2026-08-28. Repo: C:\Users\kazda\kiro\systedo-case, local HEAD de508451 (2026-08-28), origin/master 37906245 (2026-08-27, local is ahead, unpushed). All paths below are relative to that repo root unless noted. Nothing was run (no gates, no tests, no build); "last known" results come from journal/CI history only.

## 0. Headline

- The path the operator describes EXISTS and is the module **`kanaly` = "Kanály zdarma"** (OrganicChannels + `channel-research` LLM tool), not `DistributionModule` (which is "one article repurposed across channels", DistributionModule.tsx:1-2). It is registered as one of 38 modules, order 5 in section "comms", available to all five project types (src/lib/projects/modules.ts:144-153).
- It is real code with a real LLM call, real persistence and 26 pure-logic unit tests, but: no e2e spec, no UAT journey names it, no L2 empirical run, no baked quality score, tiger characters empty, and it was rebuilt (lifecycle/signpost) on 2026-08-07..10 AFTER the last UAT run (2026-07-16). "Not proven" is the accurate verdict; "not tested" is too strong.
- The 12 Personas use cases do not contain it. Nothing in PRODUCT.md, value-case, README, the home page, `/cena` or the three LP variants mentions free/organic channels; positioning is "measure -> triage -> generate" for paid ads (PRODUCT.md:28-45).
- UAT characters already found it on their own and said what the operator says: "Kanály zdarma I didn't even know to look for, and it's honestly the best-fit thing in here for me ... More people need to know this exists." (uat/runs/2026-07-16-full-cert/standa-prelaunch-maker--launch-from-zero.md:258).

## 1. CORE PATH MAP

### 1.1 Which modules

| Candidate | Verdict | Evidence |
|---|---|---|
| `OrganicChannels.tsx` + `/kanaly` + `channel-research` | **THE path** - ranked plan of free channels (directories, marketplaces, communities, content, social, PR, partnerships) with fit 0-100, effort, rationale, payoff, 2-4 first actions, optional url + contentAngle | src/lib/organic-channels/types.ts:1-7,11-28,101-120; src/lib/ai/tools/channel-research.ts:1-14 |
| `DistributionModule.tsx` + `/distribuce` | adjacent, downstream: repurposes ONE article into channel variants + seeded attribution; not place-finding | src/components/app/modules/DistributionModule.tsx:1-8; src/app/app/[projectId]/distribuce/page.tsx:37 (SAMPLE_SOURCE + attributionForProject) |
| `KeywordsModule`, `CompareSeoModule` | adjacent, "search queries worth targeting" leg; no link to/from kanaly (grep `kanaly` in those modules: none) | src/components/app/modules/CompareSeoModule.tsx:1-4 |
| `LocalModule`, `MapPack*` | adjacent for `local` type (GBP/Mapy.cz overlap with the plan's directory seeds) | src/components/app/modules/LocalModule.tsx:1; MapPackModule.tsx:1-4; sample.ts:41-58,377 |

### 1.2 The user path, step by step

1. **Entry: "I have a web product (URL)"** -> `/app/[projectId]/start` (new projects land here) -> `OnboardingModule` scan (src/app/app/[projectId]/start/page.tsx:1-24). LLM tool `onboarding-scan` extracts businessName/summary/offering/audience/tone/4-8 keywords/0-5 suggested competitors from server-fetched page text (src/lib/ai/tools/onboarding-scan.ts:1-14,29-44). REAL.
2. **Apply** -> POST `/api/projects/[id]/onboarding` merges scan competitors into the competitor store and seeds a scan-tagged keyword list (src/app/api/projects/[id]/onboarding/route.ts:57-113). REAL. **Grounding gap:** the saved onboarding profile (offering/summary/audience) is read only by that route and by `progress.ts:53`; nothing else consumes `getOnboarding()` (grep, 6 hits, all store/route/progress). It does NOT reach the kanaly grounding (see step 4).
3. **Checklist step "Vybrat kanály zdarma"** -> `kanaly`, `optional: true`, present for all 5 project types, last in each type's order (src/lib/onboarding/steps.ts:81-100); marked done once a track or a pinned plan exists (src/lib/onboarding/progress.ts:61,84-87,100-101). Overview also surfaces one fixture-tagged "Kanál zdarma: X" recommendation computed from the SEEDED plan, never the pinned AI plan (src/lib/insights/aggregate.ts:386-405).
4. **`/app/[projectId]/kanaly` page (server)** builds grounding from the **catalog spine only**: offering = first 4 catalog categories, localities = `localitiesFor(project)`, competitors = curated set (failed read -> `competitorsUnavailable`), keywords = up to 8 catalog offering NAMES (src/app/app/[projectId]/kanaly/page.tsx:29-55). Seeded plan `channelPlanForProject` (:57-60); `resolveOrganicChannels` returns pinned AI plan or sample + tracks + `degraded` (:61-62; src/lib/organic-channels/resolve.ts:28-58); twin state -> `SignpostContext` (:63-77); provenance gutter (:83-86).
5. **Client `OrganicChannels` (514 LOC)**: source pill sample/AI, "Sestavit plán na míru (AI)" -> `useAiTool("channel-research")` with brand = `project.name` + grounding (src/components/app/modules/OrganicChannels.tsx:160,206-216); quick-win callout = first `effort==="low" && fit>=70` untracked channel (:168-171); `ChannelTable` with one derived next step per row (:471-478); `ChannelPlaybook` drawer shows firstActions and the url link (src/components/app/channels/ChannelPlaybook.tsx:188,199-201); `ChannelWizard` decides manual vs twin, inbox source, cadence (channels/ChannelWizard.tsx, 371 LOC).
6. **LLM chokepoint**: POST `/api/ai` mode `"channel-research"` -> `validateChannelResearchRequest` (src/app/api/ai/modes.ts:433-434; src/lib/ai/validation.ts:1104-1129: projectType in set, brand 1-120, offering<=300, localities/competitors <=8x80, keywords <=20x120, refine) -> dispatch (src/app/api/ai/dispatch.ts:87) -> `generateChannelResearch` -> `generateStructured` (src/lib/ai/tools/channel-research.ts:267-286; temperature 0.6, quality tier, no `tier:"fast"`).
   - System prompt: Czech organic-visibility strategist, 7 channel families, 6-9 concrete CZ-market channels, anti-fabrication clause, ranked by fit (channel-research.ts:37-56). User prompt threads type framing, brand, offering, localities, competitors ("jen pro rámec"), keywords, refine (:75-99). Schema (:101-151): summary + channels[{name, category, fit, effort, rationale, payoff, firstActions, url?, contentAngle?}].
   - normalize: slugify->id, dedupe, clamp fit, coerce enums, cap firstActions 4, sort by fit; zero usable channels -> wholesale curated demo flagged `canned` so billing refunds (:196-242,283-286). validate: summary + >=3 named channels else one self-repair re-prompt (:246-256). demo: curated per-type plan + "connect an LLM" tail (:166-188).
7. **Apply plan** -> `reconcilePlanTracks` re-keys existing lifecycle tracks onto renamed channels, orphans surfaced (OrganicChannels.tsx:225-237; src/lib/organic-channels/reconcile.ts, 130 LOC) -> POST `/api/projects/[id]/organic-channels` (ownership-checked, `sanitizeChannelState`; src/app/api/projects/[id]/organic-channels/route.ts:11-21) -> auto-opens wizard for top-3 unconfigured channels. DELETE reverts to sample (:24-31).
8. **Next action per channel** derived, never stored: `deriveChannelNext` walks voice -> enable twin channel -> inbox -> live, or playbook/first-action for manual (src/lib/organic-channels/next-step.ts:1-60; OrganicChannels.tsx:281-307). "Vytvořit obsah" hands `contentAngle` + keywords into the content engine via sessionStorage BriefSeed (:265-278). NextSteps footer -> obsahovy-engine / socialni only (:480-485) - no hop to Klíčová slova.

### 1.3 Data stores

- Dispatcher keyed by **projectId alone** (documented invariant: safe only behind `requireOwnedProject`) (src/lib/organic-channels/store.ts:6-11,15-33). Local: node:sqlite table `organic_channels` (store.local.ts:12-38; DDL src/lib/db.ts:155; migration backfill for pre-ledger DBs db.ts:772-796, i.e. the UAT L2-STANDA "missing table" ceiling at standa...--L2.md:53 has a fix in source, not re-verified live). Prod: Firestore (store.firestore.ts, 33 LOC).
- Catalog: persisted offerings else seed, request-deduped (src/lib/catalog/load.ts:26-45). Competitors: `getCompetitors` + `curatedCompetitors` (kanaly/page.tsx:15-16,42).

### 1.4 REAL vs SEEDED vs STUB

| Piece | State |
|---|---|
| Seeded plan: 24 curated CZ seeds (GBP, Firmy.cz, Zboží.cz, Heureka, Product Hunt, Reddit, Mapy.cz, ...), 5 per-type lists (eshop 10, app 8, leadgen 8, content 8, local 8), `{brand}/{locality}/{category}` fill, fit wobbled +-5% by project hash | SEEDED, honest (sample gutter via `planProvenance`); src/lib/organic-channels/sample.ts:41-432,437-485 |
| AI plan | REAL (Claude CLI dev / Gemini prod / BYOM), demo fallback when keyless |
| Lifecycle tracks, wizard, signpost derivation | REAL, persisted |
| Attribution / "what works" for these channels | NONE - no analytics seam; Distribuce's attribution table is fixture (distribuce/page.tsx:30-34) |
| Content handoff to engine | REAL bridge, but engine's own sample topics are hardcoded baby/parenting (UAT BL-07, SUMMARY.md) |
| Public demo | `DemoModule` has a `case "kanaly"` (src/components/demo/DemoModule.tsx:184-200) but `DemoShell` has no `kanaly` nav entry (grep empty) - could not determine whether it is reachable on `/dashboard` |

**Grounding verdict:** catalog/competitors/localities reach the prompt (tiger rates 6/6, tiger/call-sites/channel-research.md:12,20). But brand = raw `project.name` (no `promptSafeName`, so "(ukázka)" markers leak; grep promptSafeName in organic-channels: none; bughunt finding #1 at docs/harness/bughunt-refactor-2026-07-10/organic-visibility-content-distribution-and-brand-voice.md:11-17 still open), and the onboarding-scan profile never reaches it. A URL-first user with an empty catalog gets "vaší firmy / vaší nabídky" placeholders (sample.ts:439-441) and an AI prompt with only type + brand.

## 2. USE-CASE MAPPING (12 tracked use cases)

**The core path is NOT represented by any existing use case.** Proposed names:
- **"Free-Channel Discovery (Kanály zdarma)"** - URL/offering -> ranked free channels -> first actions -> lifecycle signpost. Owner contexts: `organic-channels` (ui), `organic-channels-keywords` (lib), `ai-tools-campaigns-research` (channel-research.ts), `content-engine` (holds OrganicChannels.tsx per context-map).
- Optionally **"Website Scan Onboarding"** for the entry (onboarding-flow, projects-api) if it should be tracked as the first step rather than folded in.

| Use case | Relation | Order on path | Evidence |
|---|---|---|---|
| Catalog & Offering Spine | ON PATH (grounding input) | 1 | kanaly/page.tsx:29-54 reads catalog categories/names/localities |
| Brand Voice Twin | ON PATH (who speaks on a channel; readiness derives from twin) | 3 | kanaly/page.tsx:63-77; next-step.ts:28-60; ChannelWizard mode "twin" |
| AI Content Brief & Draft | ON PATH (playbook -> "Vytvořit obsah" seed) | 4 | OrganicChannels.tsx:265-278; NextSteps :482 |
| Local SEO Rank Tracking | adjacent (local type: GBP/Mapy.cz seeds overlap `lokalni`/`mapa`; onboarding "ranks" step precedes "channels") | - | sample.ts:41,377; steps.ts:99 |
| Performance Dashboard | adjacent (Overview fixture rec "Kanál zdarma") | - | aggregate.ts:386-405 |
| Landing Page Experiments | adjacent (pre-launch `app` type companion, per Standa report) | - | standa...launch-from-zero.md:222 |
| AI Image Creative Generation | adjacent (week-of-promo leg after channels chosen) | - | uat/journeys/week-of-promo-fast.md |
| Ad Copy Generation, Campaign AI Triage, Campaign Budget Alerts, Lead Quality Scoring, Profit & Margin Analytics | unrelated (paid/perf side) | - | "placené PPC řeší jiný modul" channel-research.ts:37 |

## 3. PROOF STATE

### 3.1 What exists

- **Unit (node --test, 350 files total):** 3 dedicated files, 26 tests, all pure logic: `organic-channels-reconcile.test.mjs` (8: fold keys, renamed-channel track carry, orphans; also asserts every seeded per-type plan has distinct fold keys), `organic-channels-signpost.test.mjs` (4: trained/enabled honesty rules), `organic-channels-track.test.mjs` (14: sanitizers, legacy migration, twin-scope trap, provenance, wizard suggestions, next-step ordering, and "no CTA targets a module the project type lacks" :216). Touch-only mentions in demo-tail-leak (5), wholesale-demo-billing (5), module-registry-routes (5), project-delete/duplicate-cascade, ai-mode-table (not read; counts from grep).
- **NOT unit-tested:** kanaly page grounding assembly, `/api/projects/[id]/organic-channels` route, store/resolve `degraded` path, `buildChannelResearchPrompt`, `sample.ts` fill/wobble bounds, `OrganicChannels.tsx` (no component tests exist repo-wide).
- **LLM harness:** golden `test-llm/golden/channel-research.json` (promptHash 3ebb6e442c386bcb, CHANGELOG.md:47). Registry fixture is a Brno dentist "Dentalis" with a PARAPHRASED system prompt (test-llm/registry.mjs:890-895) - the fidelity gap backlog item 22 and tiger nit (call-site note :32). `llm:gate` is static-only since 2026-08-05 (scripts/llm-gate.mjs:11,22,89); real-model proof is on-demand `npm run test:llm`. Quality matrix (docs/testing/llm-quality-matrix.md:321): sonnet 8.0, opus 7.0, deepseek 7.0, lfm2.5:8b 2.0, qwen/glm not run; production Gemini not in that table; the tool is one of 6 "unbaked" ops with no public scorecard score (scripts/quality-gate.mjs:61-63).
- **Tiger:** call-site assessed 2026-07-15, code_score 5, grounding 6/6, `quality_score "-"`, `characters: []` - Lens B/C never run; line refs stale (says :244, now :267) (tiger/call-sites/channel-research.md:1-16).
- **Playwright:** 7 specs (tests/*.spec.ts: account-modules, ai-asistent, clanek-anchors, dashboard-comparison, design-system, first-run, kampane-triage); none touches `/kanaly` (grep).
- **UAT:** 28 characters, 25 journeys; **no journey or character file mentions `kanaly`** (grep uat/journeys, uat/characters: 0). Runs: 2026-07-16-full-cert (22 chars, 44 reports, newest) - Standa L1 rates it "best-fit ... under-documented" (standa...launch-from-zero.md:202,217,242,258); Radek L1 finding "'Kanály zdarma' (his exact zero-budget JTBD) isn't listed" (radek...cheap-inbound-leads.md:87-93); Vojta's get-found-organically lists it reachable but "lives in Klíčová slova, Srovnání & SEO, Obsahový engine" (vojta...md:5); Standa L2 flags the sqlite table ceiling (--L2.md:53). Zero L2 clicks on `/kanaly` in any run. The newest `findings.json` is 2026-07-08 (2026-07-16 has only SUMMARY.md + per-report md).
- **Recency:** 23 commits on the path, first d091612d 2026-07-09, lifecycle/signpost rebuild 08c8aacf (2026-08-07) through 72d499e5 (2026-08-10) - all after the last UAT. The current UI has never been judged by a Character.

### 3.2 Gates and last known result

- Order per AGENTS.md/package.json: `npm run check` (typecheck -> lint -> build) -> `seed:check` -> `test:unit` -> `llm:gate:check` -> `llm:quality:check` -> `adr:check` -> `agents:surface` = `check:ci` (package.json scripts.check:ci). CI (.github/workflows/ci.yml:26-107): job `check` runs `check:ci` + i18n audit; job `e2e-smoke` runs Playwright. Plus sast.yml, agent-review.yml, supply-chain.yml.
- **Last known:** origin/master 37906245 (2026-08-27) - `check` job **success**, `e2e-smoke` **failure** at step "Run E2E suite"; the two prior master runs (2026-08-25) also failed (gh run list, read-only). Local HEAD de508451 (2026-08-28, "enable --experimental-test-module-mocks in test:unit") and 5 more commits are unpushed and unproven in CI. Ship-loop journal's last recorded local gate is 2026-07-02 (journal.md:53,61); state.md CP10 (2026-07-03) notes `rate-limit.test.mjs` red at that HEAD. Backlog item 26 (e2e/UAT not in CI) is stale: e2e IS in CI now and is red.

**Verdict on "not tested, not proven":** refuted at the unit/static level (26 pure tests + golden + static gate + tiger L1), confirmed at every level that would prove value: no e2e, no UAT journey, no L2, no baked quality, no production-model score, rebuilt after last certification.

## 4. MARKETING PAGES

Composition: `src/app/page.tsx:1-8` -> `BrandLanding` (289 LOC, server component). `/lp` (180 LOC) is an index of three exploratory variants: `LandingBolder` 412, `LandingDistilled` 525, `LandingNewWorld` 1126 LOC (single files, far over the 200-LOC rubric in AGENTS.md). Copy is colocated `T = {cs,en}` via `getT`. Primitives used: `Container/Eyebrow/Pill` (src/components/ui.tsx:7,22,59); the `Button` primitive (ui.tsx:82-157) is used by **none** of the 6 marketing files (Button-prim=0; `/cena` uses `buttonClass`); CTAs are hand-styled `<Link>`s (BrandLanding.tsx:35-46,131-142).

| Page | Sections / claims | Check |
|---|---|---|
| `/` BrandLanding | Hero "Stůjte pevně. Reklamy, které nepovolí." + subhead "měřte výkon, třiďte kampaně a generujte reklamy, opřené o vaše živá data z Google Ads" (:38-42); channel support levels Google Ads live / Sklik checks / Meta+TikTok publishing (:23-29); "Během validace zcela zdarma" (:45-46); BYOM incl. local Ollama (:47-48); proof band = 4 KPIs from `buildSnapshot("90d")` labeled fictional client (:99-106); Crossroad to 4 case-study pages `/dashboard /clanek /ai-asistent /kampane` (crossroad/meta.tsx:17); closing band | Support levels FRESH (README.cs.md:11-13). Free FRESH (`/cena`, PRODUCT.md monetization). Ollama: BYOM exists, matrix lists lfm2.5:8b - FRESH. Proof numbers: seeded, honestly labeled. **Zero mention of free/organic channels** (grep `kanál|zdarma|organick|bezplatn` -> only "Začít zdarma"/paid-channel support). |
| `/lp/*` variants | Bolder/Distilled/NewWorld: same paid-measurement story; NewWorld sections "Měření / Odchylka / Vytyčení" (:142-195) | Exploration, not linked from nav (nav.ts:23-48). NewWorld is the only one with reduced-motion handling. |
| `/cena` | "Během validace zdarma" (:28); Free/Pro/BYOM rows (:55-130) list Google Ads syncs, budget moves, shared reports, hourly sync + alerts, BYOM unlimited; "Paid plans are not live yet ... no payment gateway" | FRESH vs decision; feature rows are all paid-ads features; no free-channels row. UAT BL-18: Free CTA routed to `/kampane` demo (cena/page.tsx:179 per SUMMARY) - not re-verified here. |
| `/ai-asistent` | public AI assistant demo; claims structured output / domain rules / key stays on server / works without key (:29-38) | FRESH (chokepoint + demo mode, AGENTS.md arch 5) |
| `/clanek`, `/clanek/vykon` | case-study article with TOC, share, FAQ, JSON-LD, reading progress (heavy article chrome, 12 imports) | content page, not a feature page |
| `/kampane`, `/knihovna`, `/socialni`, `/dashboard` | public demos of campaign triage, patterns library, social center, app shell on Mionelo | UNPROVEN: knihovna patterns API drops projectId (UAT BL, hela); social simulated publishes labeled demo (backlog 8 done) |
| `/lokalni-seo` | `LocalSeoShowcase` (240) + `RankClimbDemo` (371) + 3 SVG charts - animated rank-climb demo | the only page with a purpose-built animated product showcase |
| `/mapa` | "Mapa případové studie" = sitemap of the case study | not a feature page |
| `/kvalita-modelu` | public BYOM quality matrix | FRESH (docs/testing/llm-quality-matrix.md) |

**Technique, measured (grep counts per file: use-client / Button-prim / animation classes / reduced-motion / aria / responsive breakpoints / images):** BrandLanding 0/0/4/0/3/7/3; Bolder 0/0/8/0/3/14/3; Distilled 0/0/7/0/9/23/2; NewWorld 0/0/7/1/13/30/2; LocalSeoShowcase 1/0/8/1/0/7/0; RankClimbDemo 1/0/14/1/5/2/0.

**What is BASIC vs a modern marketing page:** the shipped home is 5 blocks in 289 lines (hero with one static PNG key visual, 4 KPI tiles, 4 crossroad cards, closing CTA); animation is Tailwind `transition`/`animate-fade-up` only, no scroll-reveal, no motion library, no reduced-motion guard on the home; no product tour/video/interactive demo embed (the interactive demos live on separate case-study pages); no testimonials/logos (honest: none exist), no FAQ, no comparison block, no pricing teaser, no feature grid describing the modules, no page at all for the free-channels path (every other pillar has `/lokalni-seo`, `/socialni`, `/kampane`, `/knihovna`). The LP variants show the team explored richer layouts but none shipped, and each is a >400-line monolith with hardcoded copy tables rather than composable sections.

## 5. STABILIZATION COVERAGE (.claude/scan-history/scan-sweep.jsonl, 13 entries)

- Lens vocabulary in the ledger is 22 named lenses per entry (`security-auditor, ux-reviewer, code-optimizer, test-strategist, error-handler, accessibility-checker, mobile-specialist, bounty-hunter, tech-debt-tracker, ...`). The brief's names (bug-hunter, ui-perfectionist, performance, ambiguity) do not appear in this ledger; nearest equivalents are bounty-hunter/error-handler, ux-reviewer/accessibility-checker, code-optimizer. "bug-hunter" and "ambiguity" lenses exist only in the older docs/harness scans (below).
- **resolve-mode sweeps (5, all 2026-08-05):** account-project-data (12 findings/6 fixed), account-settings (9/3), ad-creative-studio (10/4), ad-platform-integrations (10/3), ads-creative-spend (5/2) = 46 findings, 18 fixed.
- **ideas-mode benchmark entries (8, 2026-08-27, 0 fixed, "findings held in ai-registry .bench pool"):** catalog-core, cost-goals-ltv, cron-scheduler, diagnoses-engine, llm-core-providers, profit-analytics, report-engine, shared-lib-primitives.
- **Core-path contexts (context-map.json):** `organic-channels` (kanaly page + route), `organic-channels-keywords` (lib), `ai-tools-campaigns-research` (channel-research.ts, onboarding-scan.ts), `content-engine` (OrganicChannels.tsx + DistributionModule.tsx), `onboarding-flow`, `projects-api`, `project-data-api`, `catalog-core`. **Swept: 0 in resolve mode.** Only `catalog-core` has an ideas-only benchmark pass. 12 of 117 contexts touched at all (10%), 5 resolved (4%); 105 never swept.
- Older harness coverage of the predecessor context "Organic Visibility, Content Distribution & Brand Voice": bug-hunter 4 + code-refactor 1 (2026-07-10, 5 findings, 0 high) and ambiguity+ui 5 findings / 2 high (2026-07-16). Of the two organic-channels-specific findings, the `degraded` flag (ambiguity #2) is fixed (resolve.ts:17-23,40) and the demo-marker leak (bug-hunter #1, sample.ts:485 raw `project.name`) is still open.

## 6. GAP LIST (ranked)

### Product gaps
| # | Gap | Evidence | Size | Use case |
|---|---|---|---|---|
| P1 | Onboarding-scan profile (offering, audience, summary, keywords) never reaches the channel plan; kanaly grounds on catalog only, so a URL-first user with an empty catalog gets placeholder "vaší firmy/vaší nabídky" seeds and a type+brand-only AI prompt | kanaly/page.tsx:29-55; getOnboarding consumers = route + progress.ts:53 only; sample.ts:439-441 | M | Free-Channel Discovery (new), Catalog & Offering Spine |
| P2 | No single "visibility plan" artifact: queries + content + channels live in 3 modules; nothing packages or exports them | UAT L1-STANDA-004 (standa...md:112-122), confirmed L2 (--L2.md:20); NextSteps :480-485 hops only to engine/social | M | Free-Channel Discovery |
| P3 | The plan never links to Klíčová slova / Srovnání & SEO (the "search queries" half of "places to promote"); keywords are input only | OrganicChannels.tsx:480-485; vojta...md:5 | S | Free-Channel Discovery, (Local SEO for local) |
| P4 | Demo/sample name marker leaks into rationale, first actions and the content-engine handoff (raw `project.name`, no `promptSafeName`) | sample.ts:485; OrganicChannels.tsx:268; harness bughunt #1 | S | Free-Channel Discovery |
| P5 | Overview recommendation is computed from the seeded plan even after the user pins an AI plan | aggregate.ts:389-391 uses `channelPlanForProject`, not `resolveOrganicChannels` | S | Performance Dashboard |
| P6 | Channels step is `optional` and last in every onboarding order; the module is order 5 of 38 in the sidebar - structurally "one of many" | steps.ts:88,95-100; modules.ts:145 | S (decision) | Free-Channel Discovery |
| P7 | No outcome loop: nothing records whether a listing/community actually brought traffic; attribution only exists as fixture in Distribuce | distribuce/page.tsx:30-34; types.ts lifecycle has no metrics | L | Free-Channel Discovery |
| P8 | `url` is optional in the schema and unvalidated (truncated to 300 chars only); plan cannot be trusted to give a "where to register" link per channel | channel-research.ts:128,225-226 | S | Free-Channel Discovery |

### Proof gaps
| # | Gap | Evidence | Size | Use case |
|---|---|---|---|---|
| T1 | No UAT journey or character declares `kanaly`; no L2 has ever clicked it; current UI post-dates the last run | uat/journeys grep 0; radek...md:87-93; git log 08c8aacf..72d499e5 | M | Free-Channel Discovery |
| T2 | No Playwright spec for `/kanaly` (or any project module beyond first-run/account); CI e2e-smoke is red on master (3 consecutive) | tests/*.spec.ts; gh run list ci.yml master 2026-08-25..27 | M | Free-Channel Discovery |
| T3 | Untested seams: page grounding assembly, organic-channels route, store/resolve degraded path, prompt builder, sample fill/wobble bounds | test-unit grep; only reconcile/signpost/track covered | M | Free-Channel Discovery |
| T4 | LLM proof: fixture prompt paraphrased and Dentalis-only; production Gemini score absent; tool "unbaked" on public scorecard; tiger Lens B/C never run | registry.mjs:890-895; quality-matrix.md:321; quality-gate.mjs:61-63; tiger call-site :12-15 | M | Free-Channel Discovery |
| T5 | Personas use-case inventory has no entry for the path, so nothing in the app tracks it | Personas 12-use-case list vs section 2 | S | (new) |

### Copy gaps
| # | Gap | Evidence | Size | Use case |
|---|---|---|---|---|
| C1 | Zero marketing/positioning mention of free channels: home, `/cena`, 3 LP variants, PRODUCT.md, value-case, README all frame paid measure->triage->generate | BrandLanding.tsx:38-48; PRODUCT.md:28-45; grep across marketing = 0 | M | Free-Channel Discovery |
| C2 | No public feature page for the path (every other pillar has one: `/lokalni-seo`, `/socialni`, `/kampane`, `/knihovna`) and it is not in the Crossroad | crossroad/meta.tsx:17; nav.ts:23-48 | S/M | Free-Channel Discovery |

## 7. What I could not determine

- Whether `/dashboard` (public demo shell) can reach the `kanaly` demo case (DemoShell nav grep empty; DemoModule has the case).
- Whether server-side grounding injection is applied to the `channel-research` mode beyond request validation (modes.ts:433-434 shows `validate` only; grounding.ts has no channel branch) - treated as client-supplied grounding.
- Current local gate status (no commands run); the latest local commits (2026-08-28) are unpushed and have no CI result.
- Whether the sqlite `organic_channels` backfill migration (db.ts:772-796) actually repairs the DB Standa's L2 run hit; not re-verified live.
- The exact tests inside demo-tail-leak / wholesale-demo-billing that reference channel-research (counted, not read).
