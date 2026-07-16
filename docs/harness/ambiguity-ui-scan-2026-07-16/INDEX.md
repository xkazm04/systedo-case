# Ambiguity + UI Scan — systedo-case, 2026-07-16

> Combined **ambiguity-guardian + ui-perfectionist** audit: 5 findings per context.
> 54 parallel subagent runs, batched in 7 waves of <=8. Read-only; no code was modified.

---

## Totals

| | Critical | High | Medium | Low | **Total** |
|---|---:|---:|---:|---:|---:|
| Across 54 contexts | 0 | 101 | 150 | 19 | **270** |
| Share | 0% | 37% | 56% | 7% | 100% |

Counts verified two ways: sum of per-report `> Total:` headers = 270; count of `**Severity**:` bullets = 270 (0C/101H/150M/19L).

Baseline at scan time: **tsc 0 errors, 1541/1541 unit tests passing** (`npm run test:unit`).

---

## Per-context breakdown

(Sorted by High count desc, then total.)

| # | Context | High | Medium | Low | Total | Report |
|---:|---|---:|---:|---:|---:|---|
| 1 | Account, Settings & AI Model Configuration | 3 | 2 | 0 | 5 | [account-settings-ai-config.md](./account-settings-ai-config.md) |
| 2 | Campaign ops & tenant utility/research | 3 | 2 | 0 | 5 | [campaign-ops-api.md](./campaign-ops-api.md) |
| 3 | Campaign Triage, Ad-Ops Control Plane & AI Reporting | 3 | 2 | 0 | 5 | [campaign-triage-control-plane.md](./campaign-triage-control-plane.md) |
| 4 | Scheduled cron jobs | 3 | 2 | 0 | 5 | [cron-jobs.md](./cron-jobs.md) |
| 5 | Local SEO & Map Pack | 3 | 2 | 0 | 5 | [local-seo-mappack.md](./local-seo-mappack.md) |
| 6 | Performance Dashboard & Reporting | 3 | 2 | 0 | 5 | [performance-dashboard.md](./performance-dashboard.md) |
| 7 | Project & tenant workspace API | 3 | 2 | 0 | 5 | [project-tenant-api.md](./project-tenant-api.md) |
| 8 | Social Command Center & Speed-to-Lead Response | 3 | 2 | 0 | 5 | [social-speed-lead.md](./social-speed-lead.md) |
| 9 | AI Digital Twin (Communication Autopilot) | 3 | 2 | 0 | 5 | [twin-autopilot-ui.md](./twin-autopilot-ui.md) |
| 10 | AI Abuse Guards & Response Governance | 2 | 2 | 1 | 5 | [ai-abuse-guards.md](./ai-abuse-guards.md) |
| 11 | AI Content & Marketing Tools | 2 | 3 | 0 | 5 | [ai-content-marketing-tools.md](./ai-content-marketing-tools.md) |
| 12 | AI generation, creative studio & ops telemetry | 2 | 3 | 0 | 5 | [ai-generation-studio-telemetry.md](./ai-generation-studio-telemetry.md) |
| 13 | AI Workspace Contracts, Pipeline & Ad Experiments | 2 | 2 | 1 | 5 | [ai-workspace-pipeline.md](./ai-workspace-pipeline.md) |
| 14 | App Shell & Shared Chrome | 2 | 3 | 0 | 5 | [app-shell-chrome.md](./app-shell-chrome.md) |
| 15 | Article & Reporting Publishing Pipeline | 2 | 2 | 1 | 5 | [article-publishing-pipeline.md](./article-publishing-pipeline.md) |
| 16 | BYOM Keys & Provider Adapters | 2 | 2 | 1 | 5 | [byom-keys-adapters.md](./byom-keys-adapters.md) |
| 17 | Campaign Sync & Google Ads Connector | 2 | 2 | 1 | 5 | [campaign-sync-google-ads.md](./campaign-sync-google-ads.md) |
| 18 | Campaigns / Ad Ops Control Plane | 2 | 2 | 1 | 5 | [campaigns-control-plane-ui.md](./campaigns-control-plane-ui.md) |
| 19 | Catalog, Inventory, Audience & Distribution | 2 | 3 | 0 | 5 | [catalog-inventory-ui.md](./catalog-inventory-ui.md) |
| 20 | Core Marketing AI Tools & Skill SDK | 2 | 2 | 1 | 5 | [core-ai-tools-skill-sdk.md](./core-ai-tools-skill-sdk.md) |
| 21 | Core Platform Infrastructure | 2 | 3 | 0 | 5 | [core-platform-infra.md](./core-platform-infra.md) |
| 22 | Creative Studio - Image Generation & Revenue Attribution | 2 | 3 | 0 | 5 | [creative-studio-images.md](./creative-studio-images.md) |
| 23 | Design System Primitives | 2 | 3 | 0 | 5 | [design-system-primitives.md](./design-system-primitives.md) |
| 24 | Diagnostic, Growth & Twin-Voice AI Tools | 2 | 2 | 1 | 5 | [diagnostic-growth-twin-tools.md](./diagnostic-growth-twin-tools.md) |
| 25 | Finance: LTV, Profit, Spend & Client Reporting | 2 | 3 | 0 | 5 | [finance-ltv-profit-ui.md](./finance-ltv-profit-ui.md) |
| 26 | Inventory & Warehouse Sync | 2 | 3 | 0 | 5 | [inventory-warehouse-sync.md](./inventory-warehouse-sync.md) |
| 27 | LLM Provider Wrapper, Telemetry & Quality Scoring | 2 | 3 | 0 | 5 | [llm-wrapper-telemetry-quality.md](./llm-wrapper-telemetry-quality.md) |
| 28 | Local SEO, Map Pack, Leads & Reviews | 2 | 3 | 0 | 5 | [local-seo-leads-reviews-ui.md](./local-seo-leads-reviews-ui.md) |
| 29 | Local SEO, social, reviews, reporting & catalog modules | 2 | 3 | 0 | 5 | [local-seo-pages.md](./local-seo-pages.md) |
| 30 | Marketing Landing Pages | 2 | 3 | 0 | 5 | [marketing-landing-pages.md](./marketing-landing-pages.md) |
| 31 | Metrics & Analytics Engine | 2 | 2 | 1 | 5 | [metrics-analytics-engine.md](./metrics-analytics-engine.md) |
| 32 | Organic Visibility, Content Distribution & Brand Voice | 2 | 3 | 0 | 5 | [organic-visibility-brand.md](./organic-visibility-brand.md) |
| 33 | PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets | 2 | 3 | 0 | 5 | [ppc-patterns-targets.md](./ppc-patterns-targets.md) |
| 34 | Product Catalog: Model, Feed Import & Ad-Copy Generation | 2 | 3 | 0 | 5 | [product-catalog.md](./product-catalog.md) |
| 35 | Project Lifecycle, Onboarding & Overview | 2 | 3 | 0 | 5 | [project-lifecycle-ui.md](./project-lifecycle-ui.md) |
| 36 | Monthly Report: Live Metrics Ingestion & Tile Model | 2 | 3 | 0 | 5 | [report-metrics-ingestion.md](./report-metrics-ingestion.md) |
| 37 | SEO, Keyword & Content Workspace | 2 | 3 | 0 | 5 | [seo-keyword-content-ui.md](./seo-keyword-content-ui.md) |
| 38 | Social Media Planning | 2 | 2 | 1 | 5 | [social-media-planning.md](./social-media-planning.md) |
| 39 | Twin - Brand Communication Double | 2 | 3 | 0 | 5 | [twin-brand-double.md](./twin-brand-double.md) |
| 40 | Account, Activity Feed, Demo Data, Users & Usage Metering | 1 | 3 | 1 | 5 | [account-activity-usage.md](./account-activity-usage.md) |
| 41 | App shell, dev tooling, design system & site metadata infrastructure | 1 | 3 | 1 | 5 | [app-infra-metadata.md](./app-infra-metadata.md) |
| 42 | Article Reading Experience | 1 | 4 | 0 | 5 | [article-reading-experience.md](./article-reading-experience.md) |
| 43 | Auth & BYOM entitlements | 1 | 3 | 1 | 5 | [auth-byom-entitlements.md](./auth-byom-entitlements.md) |
| 44 | Campaign performance & ads operations modules | 1 | 3 | 1 | 5 | [campaign-perf-pages.md](./campaign-perf-pages.md) |
| 45 | Competitive Intelligence: Keywords, SEO Compare & LP Experiments | 1 | 4 | 0 | 5 | [competitive-intelligence.md](./competitive-intelligence.md) |
| 46 | Content, creative & keyword tooling modules | 1 | 3 | 1 | 5 | [content-creative-keyword-pages.md](./content-creative-keyword-pages.md) |
| 47 | Cost Model & Profit Analytics | 1 | 4 | 0 | 5 | [cost-model-profit.md](./cost-model-profit.md) |
| 48 | LTV, Spend & Cross-Module Insights | 1 | 4 | 0 | 5 | [ltv-spend-insights.md](./ltv-spend-insights.md) |
| 49 | Onboarding, Integrations & Growth Funnel | 1 | 3 | 1 | 5 | [onboarding-integrations-growth.md](./onboarding-integrations-growth.md) |
| 50 | Project shell, settings & onboarding | 1 | 3 | 1 | 5 | [project-shell-settings-pages.md](./project-shell-settings-pages.md) |
| 51 | Public marketing & demo pages | 1 | 4 | 0 | 5 | [public-marketing-demo-pages.md](./public-marketing-demo-pages.md) |
| 52 | Site Chrome, Auth & Demo Shell | 1 | 4 | 0 | 5 | [site-chrome-auth-demo.md](./site-chrome-auth-demo.md) |
| 53 | UI Shell: Navigation, i18n & Design Tokens | 1 | 3 | 1 | 5 | [ui-shell-nav-i18n-tokens.md](./ui-shell-nav-i18n-tokens.md) |
| 54 | Projects, Project State & Project Data Spine | 0 | 4 | 1 | 5 | [projects-data-spine.md](./projects-data-spine.md) |

---

## All 101 High findings — one-liners

(No Criticals were found. Highs listed alphabetically by context; each links to the full entry.)

- **Account, Activity Feed, Demo Data, Users & Usage Metering** — `actorFor` misattributes AI and teammate actions as "you" — `src/lib/activity/compute.ts:53-58` ([account-activity-usage.md](./account-activity-usage.md) #1)
- **Account, Settings & AI Model Configuration** — Project delete never checks the response — failure still navigates away as if it succeeded — `src/components/app/modules/ProjectSettings.tsx:118-127` ([account-settings-ai-config.md](./account-settings-ai-config.md) #1)
- **Account, Settings & AI Model Configuration** — Failed BYOM key save silently wipes the pasted key and collapses the input — `src/components/app/modules/ByomKeys.tsx:177-183` ([account-settings-ai-config.md](./account-settings-ai-config.md) #2)
- **Account, Settings & AI Model Configuration** — "Request account deletion" confirms a GDPR request that is never recorded anywhere — `src/components/app/modules/AccountSecurity.tsx:171-179` ([account-settings-ai-config.md](./account-settings-ai-config.md) #3)
- **AI Abuse Guards & Response Governance** — `x-real-ip` is trusted unconditionally — a Vercel-only assumption that turns into a full per-IP-cap bypass anywhere else — `src/lib/ai/rate-limit.ts:82-86` ([ai-abuse-guards.md](./ai-abuse-guards.md) #1)
- **AI Abuse Guards & Response Governance** — Preflight status is blind to the global daily ceiling — the banner says "you're fine" right before a until-midnight 429 — `src/lib/ai/status-core.ts:27-50 (payload contract), src/lib/ai/durable-limit.ts:99-103 (the gate it can't see)` ([ai-abuse-guards.md](./ai-abuse-guards.md) #2)
- **AI Content & Marketing Tools** — CreativeStudio hand-rolls the AI request lifecycle — no timeout, no abort, no persistence — `src/components/ai/CreativeStudio.tsx:361-396 (also 239-285, 626-631)` ([ai-content-marketing-tools.md](./ai-content-marketing-tools.md) #1)
- **AI Content & Marketing Tools** — Optimistic deletes with no rollback and no res.ok check (three copies) — `src/components/ai/AdExperiments.tsx:123-135 (same shape: SavedKeywordLists.tsx:110-122, CreativeAttribution.tsx:135-147)` ([ai-content-marketing-tools.md](./ai-content-marketing-tools.md) #2)
- **AI generation, creative studio & ops telemetry** — Background removal accepts any Leonardo image id — no ownership check, no per-user quota for anonymous callers — `src/app/api/images/nobg/route.ts:25` ([ai-generation-studio-telemetry.md](./ai-generation-studio-telemetry.md) #1)
- **AI generation, creative studio & ops telemetry** — Attribution PATCH is a silent upsert — unknown linkId creates a phantom, style-less link that poisons the leaderboard and style prior — `src/app/api/images/attribution/route.ts:89` ([ai-generation-studio-telemetry.md](./ai-generation-studio-telemetry.md) #2)
- **AI Workspace Contracts, Pipeline & Ad Experiments** — Repurpose handoff links every channel variant to a non-existent `/blog/` URL — `src/lib/ai/pipeline.ts:139` ([ai-workspace-pipeline.md](./ai-workspace-pipeline.md) #1)
- **AI Workspace Contracts, Pipeline & Ad Experiments** — A/B winner is declared on raw ROAS with no sample-size or significance floor — `src/lib/ai/experiment-types.ts:62-77` ([ai-workspace-pipeline.md](./ai-workspace-pipeline.md) #2)
- **App shell, dev tooling, design system & site metadata infrastructure** — Share/install metadata speaks three different languages for one brand surface — `src/app/layout.tsx:23 (also src/lib/site.ts:29, src/app/opengraph-image.tsx:10, src/app/manifest.ts:15)` ([app-infra-metadata.md](./app-infra-metadata.md) #1)
- **App Shell & Shared Chrome** — AppShellSkeleton no longer mirrors the real sidebar — 40px layout shift on reveal, stale doc comment — `src/components/app/AppShellSkeleton.tsx:8,12 (vs src/components/app/AppSidebar.tsx:106)` ([app-shell-chrome.md](./app-shell-chrome.md) #1)
- **App Shell & Shared Chrome** — Modal claims `aria-modal` but has no focus trap and never restores focus on close — `src/components/app/Modal.tsx:47-61,74-76` ([app-shell-chrome.md](./app-shell-chrome.md) #2)
- **Article & Reporting Publishing Pipeline** — `enableMicrosite` lets any tenant hijack or overwrite another tenant's slug (including the demo) — `src/lib/microsite.ts:109` ([article-publishing-pipeline.md](./article-publishing-pipeline.md) #1)
- **Article & Reporting Publishing Pipeline** — Generated microsite article self-certifies "reálná časová řada" while rendering scaled demo data — `src/lib/snapshot-to-article.ts:215` ([article-publishing-pipeline.md](./article-publishing-pipeline.md) #2)
- **Article Reading Experience** — Reading-resume stores an absolute pixel offset with no layout invalidation or expiry — `src/components/article/reading-resume.ts:8 (and src/components/article/ReadingProgress.tsx:115)` ([article-reading-experience.md](./article-reading-experience.md) #1)
- **Auth & BYOM entitlements** — `BYOM_MATRIX=true` silently voids the paid entitlement in ANY environment — and the guard never says so — `src/app/api/byom/guard.ts:19 (via src/lib/usage.ts:55-57)` ([auth-byom-entitlements.md](./auth-byom-entitlements.md) #1)
- **BYOM Keys & Provider Adapters** — Gemini API key sent in the URL query string — `src/lib/llm/byom/adapters.ts:276` ([byom-keys-adapters.md](./byom-keys-adapters.md) #1)
- **BYOM Keys & Provider Adapters** — A transient provider outage during "test connection" silently disables a healthy BYOM key — `src/lib/llm/keys/validate.ts:33-36 (with src/lib/llm/keys/store.ts:155-158, 219)` ([byom-keys-adapters.md](./byom-keys-adapters.md) #2)
- **Campaign ops & tenant utility/research** — Connecting a Google Ads account never verifies the user can actually access it — `src/app/api/campaigns/accounts/route.ts:63-74` ([campaign-ops-api.md](./campaign-ops-api.md) #1)
- **Campaign ops & tenant utility/research** — Unknown alert actions silently fall through to bulk "mark all read" — `src/app/api/alerts/route.ts:45-52` ([campaign-ops-api.md](./campaign-ops-api.md) #2)
- **Campaign ops & tenant utility/research** — Semantic pattern search burns the paid daily quota even when the call was free or failed — `src/app/api/patterns/search/route.ts:42-67` ([campaign-ops-api.md](./campaign-ops-api.md) #3)
- **Campaign performance & ads operations modules** — /vykon is hard-pinned to the sample dataset while /zisk and the report resolve live-over-sample — a live-synced tenant reads contradictory KPIs across surfaces — `src/app/app/[projectId]/vykon/page.tsx:12-17` ([campaign-perf-pages.md](./campaign-perf-pages.md) #1)
- **Campaign Sync & Google Ads Connector** — Invisible Private-Use-Area character is load-bearing in the snapshot id-range query — `src/lib/campaigns/store-keys.ts:98-104` ([campaign-sync-google-ads.md](./campaign-sync-google-ads.md) #1)
- **Campaign Sync & Google Ads Connector** — Unknown Google channel types silently become "search"; REMOVED campaigns render as "Pozastavená" — `src/lib/google/ads.ts:583 (also 474-476, 550-566)` ([campaign-sync-google-ads.md](./campaign-sync-google-ads.md) #2)
- **Campaign Triage, Ad-Ops Control Plane & AI Reporting** — Revert settles "reverted" even when the restore failed — a failed revert is permanently unretryable — `src/lib/campaigns/control-plane.ts:335` ([campaign-triage-control-plane.md](./campaign-triage-control-plane.md) #1)
- **Campaign Triage, Ad-Ops Control Plane & AI Reporting** — Suppression state is persisted before the alert is delivered — a delivery throw swallows the alert forever — `src/lib/campaigns/alerts.ts:184 (same pattern: src/lib/campaigns/anomaly-alerts.ts:115)` ([campaign-triage-control-plane.md](./campaign-triage-control-plane.md) #2)
- **Campaign Triage, Ad-Ops Control Plane & AI Reporting** — Stranded-apply recovery lands "failed" while moves may have landed — and their snapshots are unrecoverably lost — `src/lib/campaigns/control-plane.ts:184-194 (contract: src/lib/campaigns/control-plane-types.ts:194-197)` ([campaign-triage-control-plane.md](./campaign-triage-control-plane.md) #3)
- **Campaigns / Ad Ops Control Plane** — Non-CZK accounts still see hard-coded CZK on signed deltas and the change strip — one row mixes two currencies — `src/components/campaigns/ControlPlane.tsx:221 (also BudgetMoves.tsx:234,246,319; ChangeStrip.tsx:87)` ([campaigns-control-plane-ui.md](./campaigns-control-plane-ui.md) #1)
- **Campaigns / Ad Ops Control Plane** — Staging a change-set from a critical table row fails completely silently — `src/components/campaigns/CampaignsClient.tsx:266-286 (consumed at CampaignTable.tsx:321-329, 630-641)` ([campaigns-control-plane-ui.md](./campaigns-control-plane-ui.md) #2)
- **Catalog, Inventory, Audience & Distribution** — Revenue goal ETA is computed and labeled with the SUBSCRIBER growth rate — `src/components/app/modules/AudienceModule.tsx:243-244, 567` ([catalog-inventory-ui.md](./catalog-inventory-ui.md) #1)
- **Catalog, Inventory, Audience & Distribution** — DistributionModule crashes on an empty attribution array — `src/components/app/modules/DistributionModule.tsx:165, 209` ([catalog-inventory-ui.md](./catalog-inventory-ui.md) #2)
- **Competitive Intelligence: Keywords, SEO Compare & LP Experiments** — LP-experiment trust gate fails OPEN exactly when data is scarcest (control CVR = 0) — `src/lib/lp-exp/compute.ts:85,138-141` ([competitive-intelligence.md](./competitive-intelligence.md) #1)
- **Content, creative & keyword tooling modules** — "Sample data" banner shown over the user's real persisted catalog — `src/app/app/[projectId]/produktova-kreativa/page.tsx:18` ([content-creative-keyword-pages.md](./content-creative-keyword-pages.md) #1)
- **Core Marketing AI Tools & Skill SDK** — Repurpose silently bills canned template output as a real generation — `src/lib/ai/tools/repurpose.ts:83` ([core-ai-tools-skill-sdk.md](./core-ai-tools-skill-sdk.md) #1)
- **Core Marketing AI Tools & Skill SDK** — The Skill SDK contract cannot carry the backfill-honesty logic — a registry-driven run of `socialSkill` regresses to canned-billed-as-real — `src/lib/skills/types.ts:19 (contract), src/lib/ai/tools/social.ts:202 (socialSkill)` ([core-ai-tools-skill-sdk.md](./core-ai-tools-skill-sdk.md) #2)
- **Core Platform Infrastructure** — CSV formula guard turns every negative number into text — `src/lib/export.ts:22-29` ([core-platform-infra.md](./core-platform-infra.md) #1)
- **Core Platform Infrastructure** — SCHEMA invites adding tables that existing databases will never receive — `src/lib/db.ts:38-416 (SCHEMA) vs :440-657 (MIGRATIONS)` ([core-platform-infra.md](./core-platform-infra.md) #2)
- **Cost Model & Profit Analytics** — "hold-revenue" reallocation strategy does not hold revenue — `src/lib/profit/compute.ts:104-127 (and src/lib/profit/types.ts:171-175)` ([cost-model-profit.md](./cost-model-profit.md) #1)
- **Creative Studio - Image Generation & Revenue Attribution** — Arbitrary "winner" crowned when vision scoring is unavailable on the live path — `src/lib/images/studio.ts:143-144` ([creative-studio-images.md](./creative-studio-images.md) #1)
- **Creative Studio - Image Generation & Revenue Attribution** — Style prior can lock generation onto a money-losing style (ROAS 0 with spend beats everything) — `src/lib/images/attribution-types.ts:95-104` ([creative-studio-images.md](./creative-studio-images.md) #2)
- **Scheduled cron jobs** — Claimed-but-never-published social post is stranded in "publishing" limbo forever — `src/app/api/cron/social/route.ts:43-65` ([cron-jobs.md](./cron-jobs.md) #1)
- **Scheduled cron jobs** — Digest weekly claim is never released on send failure — the tenant silently loses that week's digest — `src/app/api/cron/digest/route.ts:105 (claim) vs onError at 239-249` ([cron-jobs.md](./cron-jobs.md) #2)
- **Scheduled cron jobs** — Global, app-wide AI telemetry is embedded in every tenant's digest email — `src/app/api/cron/digest/route.ts:70-82, 225` ([cron-jobs.md](./cron-jobs.md) #3)
- **Design System Primitives** — Sparkline claims to be locale-free but hard-wires Czech into the default aria-label — `src/components/charts/Sparkline.tsx:10,63-66,164-172` ([design-system-primitives.md](./design-system-primitives.md) #1)
- **Design System Primitives** — ChartReveal unmounts children on scroll-out — state loss, layout shift, and empty SSR/no-JS output — `src/components/motion/Kinetics.tsx:20-37` ([design-system-primitives.md](./design-system-primitives.md) #2)
- **Diagnostic, Growth & Twin-Voice AI Tools** — Wholesale demo fallbacks in normalize() bill as real output in half the tools — `src/lib/ai/tools/lp-variant-ideas.ts:168 (also channel-research.ts:220)` ([diagnostic-growth-twin-tools.md](./diagnostic-growth-twin-tools.md) #1)
- **Diagnostic, Growth & Twin-Voice AI Tools** — Demo-disclaimer tail ("connect an LLM…") leaks into real model results — `src/lib/ai/tools/channel-research.ts:222 (also cohort-diagnosis.ts:183-188, onboarding-scan.ts:157-161)` ([diagnostic-growth-twin-tools.md](./diagnostic-growth-twin-tools.md) #2)
- **Finance: LTV, Profit, Spend & Client Reporting** — Cost-model currency unit flips Kč↔USD with UI locale while the stored number and all displays stay CZK — `src/components/app/modules/CostModelEditor.tsx:35 (cs `currencyUnit: "Kč"`) vs :53 (en `currencyUnit: "USD"`), consumed at :73, :181–182` ([finance-ltv-profit-ui.md](./finance-ltv-profit-ui.md) #1)
- **Finance: LTV, Profit, Spend & Client Reporting** — Resting "Monthly churn" readout is a fabricated band-position back-projection, not the actual observed churn — `src/components/app/modules/LtvProjectionPanel.tsx:100–106` ([finance-ltv-profit-ui.md](./finance-ltv-profit-ui.md) #2)
- **Inventory & Warehouse Sync** — Numeric JSON fields silently become price 0 in the generic ERP mapper — `src/lib/inventory/erp.ts:139` ([inventory-warehouse-sync.md](./inventory-warehouse-sync.md) #1)
- **Inventory & Warehouse Sync** — Baselinker page cap silently truncates >20k-SKU catalogs while stamping a fully successful sync — `src/lib/inventory/baselinker.ts:87 (cap), src/lib/inventory/sync.ts:103–114 (merge + success stamp)` ([inventory-warehouse-sync.md](./inventory-warehouse-sync.md) #2)
- **LLM Provider Wrapper, Telemetry & Quality Scoring** — BYOM 429 is classified as a terminal user "quota" fault — a transient rate-limit burst becomes a hard error with no retry and no fallback — `src/lib/llm/errors.ts:167` ([llm-wrapper-telemetry-quality.md](./llm-wrapper-telemetry-quality.md) #1)
- **LLM Provider Wrapper, Telemetry & Quality Scoring** — Self-repair re-prompt overwrites the first call's token usage — telemetry and on-screen cost undercount by an entire paid call — `src/lib/llm/index.ts:328` ([llm-wrapper-telemetry-quality.md](./llm-wrapper-telemetry-quality.md) #2)
- **Local SEO, Map Pack, Leads & Reviews** — Map pack's documented "no coordinates" fallback was never implemented — blank map region instead — `src/components/app/modules/MapPackClient.tsx:75 (effect early-return), :34 (`noGeo` dead string), :130 (fallback branch)` ([local-seo-leads-reviews-ui.md](./local-seo-leads-reviews-ui.md) #1)
- **Local SEO, Map Pack, Leads & Reviews** — Rank→tone color ramp is severity-inverted and copy-pasted across four modules — `src/components/app/modules/RankLadder.tsx:46; LocationsModule.tsx:96; MapPackClient.tsx:53; LocalModule.tsx:91 (rankCell)` ([local-seo-leads-reviews-ui.md](./local-seo-leads-reviews-ui.md) #2)
- **Local SEO & Map Pack** — Coverage import silently no-ops on diacritics despite a docstring that claims otherwise — `src/lib/local-signals/import.ts:473 (coverageKey), src/lib/local-signals/resolve.ts:148-153` ([local-seo-mappack.md](./local-seo-mappack.md) #1)
- **Local SEO & Map Pack** — A "live"-labelled coverage matrix still shows hash-seeded fictional ranks — `src/lib/local-signals/resolve.ts:152; src/lib/local/catalog.ts:19` ([local-seo-mappack.md](./local-seo-mappack.md) #2)
- **Local SEO & Map Pack** — Recap counts `untracked` (stale) keywords as if their ranks were current — `src/lib/local-signals/summary.ts:37-44` ([local-seo-mappack.md](./local-seo-mappack.md) #3)
- **Local SEO, social, reviews, reporting & catalog modules** — Seasonal budget plan for REAL projects is scaled off a hidden notional 120 000 CZK baseline, with no sample label — `src/app/app/[projectId]/sklad-sezonnost/page.tsx:16,46,59` ([local-seo-pages.md](./local-seo-pages.md) #1)
- **Local SEO, social, reviews, reporting & catalog modules** — Twin readiness gate silently equates "catalog failed to load" with "business sells nothing" — `src/app/app/[projectId]/twin/page.tsx:17,26` ([local-seo-pages.md](./local-seo-pages.md) #2)
- **LTV, Spend & Cross-Module Insights** — Overview LTV rec reads the global static SAMPLE_COHORTS, not the project's resolved cohorts — `src/lib/insights/aggregate.ts:157` ([ltv-spend-insights.md](./ltv-spend-insights.md) #1)
- **Marketing Landing Pages** — Visibility gauge card shows the wrong subtitle (copy-paste of the click-share sub) — `src/components/marketing/LocalSeoShowcase.tsx:204` ([marketing-landing-pages.md](./marketing-landing-pages.md) #1)
- **Marketing Landing Pages** — "Replay" button does not replay — it silently resets, requiring a second click — `src/components/marketing/RankClimbDemo.tsx:119-124 (label at 147)` ([marketing-landing-pages.md](./marketing-landing-pages.md) #2)
- **Metrics & Analytics Engine** — Snapshot anomalies/trends are full-series while everything else is period-windowed — and the AI grounding already misreads them as "in period" — `src/lib/metrics/snapshot.ts:119` ([metrics-analytics-engine.md](./metrics-analytics-engine.md) #1)
- **Metrics & Analytics Engine** — Ratio-anomaly baseline mixes non-present days in as zero ratios, corrupting mean/std for sporadically-tracked paid traffic — `src/lib/metrics/anomalies.ts:118-126` ([metrics-analytics-engine.md](./metrics-analytics-engine.md) #2)
- **Onboarding, Integrations & Growth Funnel** — Rate card mixes subscriber bases — opens (and sponsor prices) are computed from inconsistent populations — `src/lib/audience/compute.ts:190-198` ([onboarding-integrations-growth.md](./onboarding-integrations-growth.md) #1)
- **Organic Visibility, Content Distribution & Brand Voice** — Brand grounding block mislabels how/what the brand sells — first-offering nature + single-currency price band — `src/lib/brand/context.ts:48-50, 65` ([organic-visibility-brand.md](./organic-visibility-brand.md) #1)
- **Organic Visibility, Content Distribution & Brand Voice** — Store hiccup silently demotes a pinned AI plan to the sample — inviting a save that clobbers real state — `src/lib/organic-channels/resolve.ts:28-36` ([organic-visibility-brand.md](./organic-visibility-brand.md) #2)
- **Performance Dashboard & Reporting** — Load-bearing explanations live only in native `title` tooltips — invisible on touch — `src/components/dashboard/DeltaBadge.tsx:98 (also GoalPacing.tsx:219,225,232,262,318; PnoGauge.tsx:61; AlertsPanel.tsx:127,135; ChannelTable.tsx:106,180)` ([performance-dashboard.md](./performance-dashboard.md) #1)
- **Performance Dashboard & Reporting** — Segmented control claims the ARIA tabs pattern but implements none of it — `src/components/dashboard/vykon/Segmented.tsx:35-56` ([performance-dashboard.md](./performance-dashboard.md) #2)
- **Performance Dashboard & Reporting** — ReportChat: a bucket switch without remount shows the old project's transcript and silently stops persisting — `src/components/dashboard/ReportChat.tsx:77-96` ([performance-dashboard.md](./performance-dashboard.md) #3)
- **PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets** — Short keywords are silently dropped, so Ad Strength can claim "no headline contains a keyword" when they all do — `src/lib/ad-strength.ts:74 (tokenize), src/lib/ad-strength.ts:103-108, 181/186 (the "Žádný nadpis neobsahuje klíčové slovo" copy)` ([ppc-patterns-targets.md](./ppc-patterns-targets.md) #1)
- **PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets** — "Fresh data" contradiction check judges channel pins against demo SAMPLE_ATTRIBUTION, never live data — `src/lib/patterns/extract.ts:370 (`const context: MiningContext = { campaigns, channels: SAMPLE_ATTRIBUTION, pnoGoal }`), consumed at extract.ts:451-455` ([ppc-patterns-targets.md](./ppc-patterns-targets.md) #2)
- **Product Catalog: Model, Feed Import & Ad-Copy Generation** — Fallback ad copy fabricates concrete brand promises for any shop — `src/lib/catalog/generate.ts:83-90 (also 108, 112)` ([product-catalog.md](./product-catalog.md) #1)
- **Product Catalog: Model, Feed Import & Ad-Copy Generation** — Heureka DELIVERY_DATE > 0 is mapped to "out of stock", pausing sellable products — `src/lib/catalog/feed.ts:117` ([product-catalog.md](./product-catalog.md) #2)
- **Project Lifecycle, Onboarding & Overview** — Create-project module matrix is elaborate theater — the assembled module set is silently discarded on submit — `src/components/app/CreateProjectForm.tsx:332 (root: src/components/app/create-project-shared.tsx:56-67)` ([project-lifecycle-ui.md](./project-lifecycle-ui.md) #1)
- **Project Lifecycle, Onboarding & Overview** — Onboarding dismiss (and account-link PATCH) never check res.ok — HTTP errors leave a permanently disabled button and no message — `src/components/app/DismissOnboarding.tsx:16-24 (same pattern: src/components/app/ProjectsHome.tsx:233-246)` ([project-lifecycle-ui.md](./project-lifecycle-ui.md) #2)
- **Project shell, settings & onboarding** — Expired session surfaces as a 404, not a sign-in prompt — `src/app/app/[projectId]/layout.tsx:42 (and src/lib/projects/guard.ts:20)` ([project-shell-settings-pages.md](./project-shell-settings-pages.md) #1)
- **Project & tenant workspace API** — Twin draft send has no idempotency and can be silently un-sent by a concurrent full-state save — `src/app/api/projects/[id]/twin/send/route.ts:33-66 (and src/app/api/projects/[id]/twin/route.ts:29)` ([project-tenant-api.md](./project-tenant-api.md) #1)
- **Project & tenant workspace API** — A scheduled social post with a past timestamp silently publishes immediately — `src/app/api/social/posts/route.ts:62-92` ([project-tenant-api.md](./project-tenant-api.md) #2)
- **Project & tenant workspace API** — PATCH project accepts unvalidated `accentColor` / `logoUrl` that flow into public client-facing surfaces — `src/app/api/projects/[id]/route.ts:21-23 (consumed at src/app/api/campaigns/share/route.ts:38)` ([project-tenant-api.md](./project-tenant-api.md) #3)
- **Public marketing & demo pages** — Shared client report silently renders 0 for any KPI tile whose metric key drifts from the snapshot — `src/app/report/[token]/page.tsx:271 (also 115–118, 272)` ([public-marketing-demo-pages.md](./public-marketing-demo-pages.md) #1)
- **Monthly Report: Live Metrics Ingestion & Tile Model** — Account currency is never captured — non-CZK Ads accounts render real money under "Kč" — `src/lib/report-metrics/types.ts:31 (MetricsSyncMeta), src/lib/report-metrics/map.ts:55, src/lib/report-metrics/sync.ts:67` ([report-metrics-ingestion.md](./report-metrics-ingestion.md) #1)
- **Monthly Report: Live Metrics Ingestion & Tile Model** — buildLiveDataset carries the sample spine's `meta` (disclaimer/asOf/days/seed) and `client.currency` into the live dataset — `src/lib/report-metrics/build.ts:38` ([report-metrics-ingestion.md](./report-metrics-ingestion.md) #2)
- **SEO, Keyword & Content Workspace** — Click-only table rows lock keyboard/AT users out of core actions — `src/components/app/modules/ContentEngine.tsx:311, src/components/app/modules/ContentEngine.tsx:371, src/components/app/modules/OrganicChannels.tsx:351` ([seo-keyword-content-ui.md](./seo-keyword-content-ui.md) #1)
- **SEO, Keyword & Content Workspace** — Scheduling into a full calendar silently strands the post in an unreachable state — `src/components/app/modules/ContentSchedule.tsx:235, src/lib/content-schedule/compute.ts:39` ([seo-keyword-content-ui.md](./seo-keyword-content-ui.md) #2)
- **Site Chrome, Auth & Demo Shell** — Command palette dialog has no focus trap and never restores focus on close — `src/components/site/CommandPalette.tsx:120` ([site-chrome-auth-demo.md](./site-chrome-auth-demo.md) #1)
- **Social Media Planning** — Retry after a mid-batch failure duplicates already-saved posts — `src/components/social/WeekPlanner.tsx:216-278` ([social-media-planning.md](./social-media-planning.md) #1)
- **Social Media Planning** — Late topics are scheduled onto day 8+, outside the visible 7-day calendar — `src/components/social/WeekPlanner.tsx:212-214,242-243,384-386` ([social-media-planning.md](./social-media-planning.md) #2)
- **Social Command Center & Speed-to-Lead Response** — "Real" connection decided by platform-agnostic credentials — a LinkedIn token counts as real when only Meta is configured — `src/lib/social/connection.ts:74 (with :39-41)` ([social-speed-lead.md](./social-speed-lead.md) #1)
- **Social Command Center & Speed-to-Lead Response** — publishReply publishes the reply as a NEW post — messageId is never sent to the provider — `src/lib/social/publish.ts:76-82` ([social-speed-lead.md](./social-speed-lead.md) #2)
- **Social Command Center & Speed-to-Lead Response** — A crash mid-publish strands posts in "publishing" forever — no reclaim or timeout — `src/lib/social/store.ts:91-104 (with src/lib/social/types.ts:33)` ([social-speed-lead.md](./social-speed-lead.md) #3)
- **AI Digital Twin (Communication Autopilot)** — "Reset training" only pretends to untrain when the twin mounted trained — `src/components/app/twin/useTwinState.ts:37-44` ([twin-autopilot-ui.md](./twin-autopilot-ui.md) #1)
- **AI Digital Twin (Communication Autopilot)** — Approving a rehydrated draft banks a record with an empty inbound message — `src/components/app/twin/TwinOutbox.tsx:211-217, 242-258` ([twin-autopilot-ui.md](./twin-autopilot-ui.md) #2)
- **AI Digital Twin (Communication Autopilot)** — Editing an auto-approved draft silently discards the edit — and hides the Send button — `src/components/app/twin/TwinOutbox.tsx:270-296, 503-508, 588-594, 628` ([twin-autopilot-ui.md](./twin-autopilot-ui.md) #3)
- **Twin - Brand Communication Double** — Stored twin blobs are trusted on read — a malformed blob crashes `resolveTwin` outside its own safety net — `src/lib/twin/store.local.ts:17 (also src/lib/twin/store.firestore.ts:18)` ([twin-brand-double.md](./twin-brand-double.md) #1)
- **Twin - Brand Communication Double** — The auto-approval audit trail is client-forgeable, contradicting its stated purpose — `src/lib/twin/types.ts:444-445 (sanitizeDraft), types.ts:120-123` ([twin-brand-double.md](./twin-brand-double.md) #2)
- **UI Shell: Navigation, i18n & Design Tokens** — Swatch ink picker is theme-blind — illegible token labels in dark mode — `src/lib/design-tokens-color.ts:31 (with src/lib/design-tokens.ts:6-9 and src/app/globals.css:172-227)` ([ui-shell-nav-i18n-tokens.md](./ui-shell-nav-i18n-tokens.md) #1)


---

## Triage themes

| Theme | ~Count (High-weighted) | Why this is a wave, not individual fixes |
|---|---:|---|
| A. Ops success-theater — actions settle "done" when the operation failed | ~14 H | One mental model: never persist success before the effect lands; add failure paths + retry. Control plane, cron, social publish, optimistic UI deletes. |
| B. Demo/sample-vs-live honesty | ~15 H | The app's single biggest credibility risk: sample data labeled live, live data labeled sample, canned output billed as real, "fresh data" checks judged against demo constants. One labeling/`meta.demo` doctrine fixes all. |
| C. Currency correctness | ~6 H | CZK is hard-coded across money surfaces while accounts can be EUR/USD; one `currencyCode`-through-the-pipe fix + one formatter. |
| D. Money-math & stats integrity | ~8 H | Fails-open significance gates, populations mixed in rate math, price-0 imports, negative-number CSV corruption — every one silently misprices something. |
| E. Tenant isolation, auth & secrets | ~9 H | Slug hijack, cross-tenant image reads, entitlement env-bypass, forged x-real-ip, API key in URL, cross-tenant telemetry in digests, DM replies going public. |
| F. State-loss, concurrency & idempotency | ~12 H | Twin reset/edit/send, concurrent saves clobbering, retry duplication, corrupt-blob reseed-overwrite, chat bucket switching. |
| G. Accessibility & focus management | ~9 H | No focus traps on modals/palette, fake ARIA tabs, click-only table rows, tooltip-only critical info, Czech hard-wired into aria-labels. |
| H. Locale & copy coherence | ~8 H | Trilingual share metadata, Czech plurals wrong, EN/CS mixed sentences, mislabeled gauge cards. |
| I. Silent-fallback conflation ("error" rendered as "empty/sample") | ~10 M-heavy | Store errors demoted to sample data, sessions-0-vs-error, unknown enums defaulting silently. |
| J. Duplication / design-system drift | mostly M/L | Copy-pasted toasts, plural rules, rank color ramps, hand-rolled buttons; skeleton drift. |

---

## Suggested next-phase split (fix waves)

| Wave | Theme | Candidate findings (report #) | Size |
|---|---|---|---:|
| 1 | Ops success-theater (control plane + cron + social publish) | campaign-triage #1-3, cron-jobs #1-2, social-speed-lead #3, social-media-planning #1 | 7 |
| 2 | Tenant isolation & secrets | article-publishing #1, ai-generation #1, auth-byom #1, ai-abuse-guards #1, byom-keys #1, campaign-ops #1, project-tenant-api #3, cron-jobs #3 | 8 |
| 3 | Billing honesty (canned-billed-as-real) | core-ai-tools #1-2, diagnostic-tools #1-2, campaign-ops #3, llm-wrapper #2, creative-studio #1 | 7 |
| 4 | Sample-vs-live honesty | campaign-perf #1, content-pages #1, article-publishing #2, local-seo-mappack #2, local-seo-pages #1, ltv-spend #1, ppc-patterns #2, report-metrics #2 | 8 |
| 5 | Currency correctness | campaigns-ui #1, finance-ui #1, report-metrics #1, core-platform #1, public-pages #1 | 5 |
| 6 | Money-math & stats | cost-model #1, inventory #1, onboarding-growth #1, product-catalog #2, ai-workspace #2, competitive-intel #1, catalog-inventory-ui #1 | 7 |
| 7 | A11y & focus | app-shell #2, site-chrome #1, perf-dashboard #1-2, seo-keyword-ui #1, design-system #1, ui-shell-tokens #1 | 7 |
| 8 | Twin & state-loss | project-tenant-api #1, twin-autopilot #1-3, twin-brand #1, perf-dashboard #3, byom-keys #2, llm-wrapper #1 | 8 |
| 9 | UI silent-failure tail | account-settings #1-2, ai-content-tools #1-2, campaigns-ui #2, project-lifecycle #1-2, campaign-ops #2, inventory #2 | 9+ |
| 10+ | Medium/Low tail by module | remaining ~150 M + 19 L, grouped per module | n/a |

---

## Context-map drift noted during scan

- `src/app/api/campaigns/apply/route.ts` (context "Campaign ops & tenant utility/research") no longer exists — apply became control-plane approve.
- `src/app/api/cron/microsite/route.ts` (context "Scheduled cron jobs") no longer exists — only 5 cron routes remain.

## How this scan was run

- Scanner prompts: Vibeman registry `ambiguity-guardian` + `ui-perfectionist` (combined per-context dual-lens subagent), 5 findings per context.
- Date: 2026-07-16. Scope: all 54 contexts / 10 groups per the Vibeman context map (project 081e8fd1, systedo-case).
- Method: 7 dispatch waves of <=8 parallel read-only subagents; orchestrator read only terse replies. ~650 file reads across agents.
- Wave 1 was interrupted by API 529 overload + a session usage-limit window and resumed; all 54 reports completed and verified.
- Verification: header sum vs severity-bullet count = 270 = 270. One report (`ai-abuse-guards.md`) intentionally quotes an invisible U+E000 char and greps as binary — use `grep -a`.
