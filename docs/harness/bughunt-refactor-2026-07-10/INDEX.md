# Bug-Hunter + Code-Refactor (deduped) Scan — systedo-case ("Adamant"), 2026-07-10

> A **dual-lens** audit over all **54 contexts** of the rebuilt context map, 5 findings each.
> Lens 1 (**bug-hunter**, primary, unconstrained): latent failures, races, edge cases, silent failures.
> Lens 2 (**code-refactor**, secondary, **strictly deduped**): every scanning agent read its context's
> 2026-07-09 `code_refactor` report in full and reported a refactor finding **only if genuinely new** —
> so this INDEX does **not** re-litigate yesterday's 270-finding refactor pass.
> 54 parallel subagent runs, batched in waves of 8. Every finding is anchored to a `file:line` the agent verified.

---

## Totals

| | Critical | High | Medium | Low | **Total** |
|---|---:|---:|---:|---:|---:|
| Across 54 contexts | 2 | 55 | 118 | 95 | **270** |
| Share | 1% | 20% | 44% | 35% | 100% |

**Verified two ways:** sum of `> Total:` headers = **270**; count of `- **Severity**:` bullets = **270** (match).
**Lens split:** bug-hunter **226** · code-refactor (new-only) **44**. The refactor lens intentionally starved
because the 2026-07-09 pass was exhaustive — agents rejected ~4 already-covered refactor candidates *per context*.
**By category (Crit+High):** latent-failure 17 · silent-failure 14 · state-corruption 11 · edge-case 9 · race-condition 6.
This is a **money-truth + concurrency** codebase: the dominant shapes are *"a paid/quota/spend counter is charged
before the work is done (or on a cache hit) and never refunded"*, *"a full-document read-modify-write silently
loses a concurrent write"*, and *"real synced totals are spliced onto sample data and shown under a živá-data / real-proof label."*

---

## The 2 Criticals (both trust-boundary / honesty on public, indexed surfaces)

- **Tenant microsites publish undisclosed, Google-indexed fabricated KPIs as a real client's "proof of results."** `enableMicrosite` never sets `illustrative`, so the public `/m/{slug}` page goes `index:true` and suppresses its demo-disclosure banner, while `buildMicrositeView` *always* renders scaled case-study numbers — any signed-in user can publish an indexed page presenting invented revenue/ROAS as a named brand's genuine results. `src/lib/microsite.ts:113` (+ `src/app/m/[slug]/page.tsx:60`) · [`article-and-reporting-publishing-pipeline.md`](article-and-reporting-publishing-pipeline.md) · [`public-marketing-and-demo-pages.md`](public-marketing-and-demo-pages.md)
- **SSRF block-list bypass via IPv4-mapped IPv6 literal in hex form.** `isPublicIp` normalizes only the dotted `::ffff:1.2.3.4` form; the mapped `::ffff:0:0/96` hex range (`http://[::ffff:a9fe:a9fe]/`) isn't in the IPv6 block-list, so the feed-fetcher reaches cloud-metadata / loopback despite the module's central threat model. `src/lib/catalog/feed-fetch.ts:65` · [`product-catalog-model-feed-import-and-ad-copy-generation.md`](product-catalog-model-feed-import-and-ad-copy-generation.md)

---

## Cross-cutting themes (this is how to run the waves)

Most of the 57 Crit+High findings collapse into a handful of *one-root-cause* clusters. Fixing the root once closes many at a time.

| # | Theme | Root cause (one line) | Where it bites |
|---|---|---|---|
| A | **Charge-before-work / charge-on-cache-hit / no-refund** | Quota + per-IP + global-daily-spend counters are committed *before* the concurrency gate / cache lookup / provider call, and never reclaimed on 429 / 502 / demo-fallback / cache-hit. | `usage.ts`, `paid-guard.ts`, `durable-limit.ts`, `ai/route.ts`, `campaigns/analyze`, `campaigns/batch`, Leonardo poll-vs-maxDuration, `images/upload-ref` |
| B | **"Živá data" honesty / fabricated numbers under a real-data label** | Real synced daily totals are spliced onto the *sample* channel-mix / goals / story-events; degraded live→sample silently feeds demo numbers into diffs, alerts and AI recaps; "12-month / meziročně" fabricated when `SYNC_DAYS=400 < 730`. | `report-metrics/build.ts`, `recap-context.ts`, `campaigns/sync.ts`, `snapshot-to-article.ts`, `local-signals`, `cost-model/compute.ts` |
| C | **Lost-update / non-atomic read-modify-write** | Every mutation is a full-document `.set()` overwrite with no transaction/CAS; concurrent writes silently clobber each other while the UI reports success. | BYOM keys/config (×3 ctx), `experiments.ts`, `campaigns/mutations.applyBudgetShift`, `control-plane.approveChangeSet`, project-state, social `connectAccount`, `ReviewInbox`, twin `enforceAutonomy` |
| D | **Tenant-key / customerId orphaning + cross-client leak** | The volatile Google Ads `customerId` is folded into the tenant storage key; connect/disconnect orphans posts, microsites, report links, activity — and an unlinked project falls back to the user's *other* account. | `connector.resolveTenant`, `aktivita/page`, `report-metrics/sync`, `cron/digest` (active-account-only) |
| E | **Global-cap-before-tenant-filter under-reporting** | `listLlmTelemetrySince(sinceIso, 1000)` caps the newest 1000 rows across *all* tenants, then filters by project in memory — a money-facing spend number silently shrinks (or flips to seed data) as platform traffic grows. | `llm/telemetry.ts`, `spend/live.ts`, `spotreba/page` |
| F | **localStorage / stale-closure → hydration mismatch + persistence loss** | Reading localStorage in a `useState` lazy initializer (SSR≠client), or capturing state in a debounced/async closure, then a whole-blob PUT re-persists the stale snapshot. | `ProfitModule`, `TwinOutbox`, `ContentSchedule.draftCopy`, `ReviewInbox`, `OnboardingModule` (global slot → cross-project bleed) |
| G | **Signed-profit / edge-case metric math** | Guards assume metrics are positive: `prev > 0` → 0 % delta when prior profit ≤ 0; y-axis floor hard-wired to 0 clips loss days; partial trailing calendar month fakes a collapse; contribution-vs-net delta mismatch; `coverValue` drops the price factor. | `metrics/totals.ts`, `dashboard/TrendChart.tsx`, `profit/trend.ts`, `cost-model/compute.ts`, `inventory/compute.ts` |
| H | **Time/timezone + cron correctness** | Timezone-naive `datetime-local` compared to a UTC clock; falsy-zero rewrites hour 0 → 10:00; no claim/idempotency before publish; digest covers only the active account. | `social/store.ts`, `WeekPlanner`, `cron/social`, `cron/digest` |
| I | **Input / trust-boundary hardening** | SSRF hex-mapped bypass (Critical); CSV spreadsheet formula injection in Ads-Editor export; `fetchSiteText` reachable from the *unauth public* `/api/ai` onboarding-scan path; unguarded `decodeURIComponent(hash)`; unrecognized `project.type` crashes `Record<ProjectType,…>` lookups. | `catalog/feed-fetch.ts`, `ads-editor.ts`, `site-fetch.ts`, `FaqHashOpen.tsx`, `projects/store.firestore.ts` |
| J | **Silent-failure / success-theater UI** | An action reports success while its network write is unchecked / no-ops after a refresh / dropped. | `planWeek` (no `res.ok`), `AppSignInGate` deep-link drop, `TwinOutbox` restored buttons, `AdsAccountPicker` fetch storm, `baselinker` truncate-then-delete |

---

## All 57 Critical + High findings, by theme

### A. Charge-before-work / no-refund (money leak)
1. **[High]** `consume()` charges quota before the paid work, no refund — a degraded/failed generation burns the whole daily allowance. `src/lib/usage.ts:68`
2. **[High]** Durable per-IP + global daily-spend counters committed *before* the concurrency gate — a 429 "server busy" still drains budget. `src/lib/ai/paid-guard.ts:49`
3. **[High]** Global daily spend ceiling counts cache hits + BYOM calls as paid app ops — public demo locks out early while real bill ≈ 0. `src/lib/ai/durable-limit.ts:114`
4. **[High]** Signed-in users charged their AI quota for demo / no-provider results that aren't even cached. `src/app/api/ai/route.ts:94`
5. **[High]** Single-campaign evaluate charges the global ceiling + per-IP eval cap on cache hits and server-busy rejections (batch sibling proves the correct order). `src/app/api/campaigns/analyze/route.ts:41`
6. **[High]** Leonardo poll budget (120 s) == route `maxDuration` (120 s) — a slow-but-successful image gen is killed *after* quota is charged and Leonardo billed. `src/lib/leonardo/client.ts:23`

### B. "Živá data" honesty / fabricated-as-real
7. **[High]** "Živá data" monthly report splices real daily totals onto the sample channel mix, goals & demo story-events. `src/lib/report-metrics/build.ts:23`
8. **[High]** `historyGroundingText` fabricates a "12-month / meziročně" figure on every live sync (`SYNC_DAYS=400 < 730`). `src/lib/report/recap-context.ts:49`
9. **[High]** Degraded live→sample sync feeds demo numbers into the change-diff and fires real critical/anomaly alerts. `src/lib/campaigns/sync.ts:78`
10. **[High]** Anomaly/trend sections computed over the *whole* dataset but titled as events "in the period." `src/lib/snapshot-to-article.ts:180`
11. **[High]** Client report pairs TRUE net profit with the pre-COGS *contribution* delta — wrong change %. `src/lib/cost-model/compute.ts:23`

### C. Lost-update / non-atomic read-modify-write
12. **[High]** Every BYOM config mutation is a non-transactional full-document overwrite (route). `src/app/api/byom/keys/route.ts:35`
13. **[High]** Same lost-update, settings surface — a just-connected key can silently vanish. `src/components/app/modules/ByomMatrix.tsx:78`
14. **[High]** Same lost-update, Firestore store layer. `src/lib/llm/keys/store.firestore.ts:51`
15. **[High]** First key auto-activates BEFORE its test runs and is never deactivated on failure — all AI silently routes through a known-broken key. `src/app/api/byom/keys/route.ts:35`
16. **[High]** Ad-experiment save is a non-atomic RMW — concurrent saves lose a variant or fork the experiment. `src/lib/ai/experiments.ts:54`
17. **[High]** `applyBudgetShift` non-atomic: donor lowered, failing recipient write leaves the account starved, no snapshot, no audit, un-revertable. `src/lib/campaigns/mutations.ts:140`
18. **[High]** `approveChangeSet` check-then-act race: a double-click double-applies the budget moves. `src/lib/campaigns/control-plane.ts:91`
19. **[High]** ReviewInbox debounced draft-save clobbers a just-set flag/answered on the server. `src/components/app/modules/ReviewInbox.tsx:146`
20. **[High]** `enforceAutonomy` stomps an auto-approved draft's terminal `sent` status back to `approved` (regression from the 2026-07-09 client-only-gate fix). `src/app/api/projects/[id]/twin/route.ts:26`

### D. Tenant-key / customerId orphaning + cross-client leak
21. **[High]** `resolveTenant` folds the volatile Ads `customerId` into the tenant key — connect/disconnect orphans social posts, microsites, shared-report links & message replies. `src/lib/campaigns/connector.ts:150`
22. **[High]** Aktivita live-feed key includes `customerId` — activity history orphans on account connect/switch. `src/app/app/[projectId]/aktivita/page.tsx:18`
23. **[High]** Unlinked project silently syncs the user's *other* connected Ads account (cross-client data leak). `src/lib/report-metrics/sync.ts:28`
24. **[High]** Weekly digest & scheduled report cover only the *active* Ads account — every other connected account's client is silently never contacted. `src/app/api/cron/digest/route.ts:54`

### E. Global-cap-before-tenant-filter under-reporting
25. **[High]** Per-project spend reads the newest 1000 rows across ALL tenants, then filters by project — under-reports once platform traffic > 1000/window. `src/lib/llm/telemetry.ts:90`
26. **[High]** Same global-1000 cap on the live-spend seam — undercounts or shows fabricated seed data. `src/lib/spend/live.ts:14`
27. **[High]** Same, on the Spotřeba page — live/sample flapping across reloads. `src/app/app/[projectId]/spotreba/page.tsx:15`

### F. localStorage / stale-closure → hydration + persistence loss
28. **[High]** `ProfitModule` reads localStorage in `useState` lazy initializers → SSR/hydration mismatch for any returning user. `src/components/app/modules/ProfitModule.tsx:448`
29. **[High]** A twin-reply restored from localStorage renders Approve/Reject buttons that silently no-op (draftContext stays null). `src/components/app/twin/TwinOutbox.tsx:220`
30. **[High]** `draftCopy` writes the AI result through a stale `posts` snapshot — silently reverts (and re-persists) any edit made while the model was thinking. `src/components/app/modules/ContentSchedule.tsx:99`
31. **[High]** New project's Start wizard pre-fills with a DIFFERENT project's scanned profile (global localStorage slot) and "Apply" writes it in. `src/components/app/modules/OnboardingModule.tsx:144`

### G. Signed-profit / edge-case metric math
32. **[High]** Profit delta silently reads 0 % whenever the previous period's profit was ≤ 0. `src/lib/metrics/totals.ts:42`
33. **[High]** Trend chart clips negative `profit` (loss days) below a y-axis floor hard-wired to 0. `src/components/dashboard/TrendChart.tsx:184`
34. **[High]** Year-view profit trend's trailing partial calendar month fakes a ~60% collapse. `src/lib/profit/trend.ts:111`
35. **[High]** `coverValue` drops the price factor — "value at risk" shown in Kč is really units×margin (wrong by ~price). `src/lib/inventory/compute.ts:133`

### H. Time/timezone + cron correctness
36. **[High]** Scheduled social posts fire late by the user's UTC offset (naive-local time vs UTC clock); WeekPlanner sends `toISOString()` so the same tenant flaps. `src/lib/social/store.ts:72`
37. **[High]** `planWeek` never checks the posts-save response — a 401/429/500 mid-batch silently drops scheduled posts while the bar completes. `src/components/social/WeekPlanner.tsx:240`
38. **[High]** Midnight (hour 0) schedule silently rewritten to 10:00 by a falsy-zero guard. `src/components/social/WeekPlanner.tsx:209`
39. **[High]** `social` publish cron has no claim/idempotency — overlapping runs (or a failed status write after publish) double-post to live platforms. `src/app/api/cron/social/route.ts:27`

### I. Input / trust-boundary hardening (+ the 2 Criticals above)
40. **[High]** Ads Editor / listing CSV export open to spreadsheet formula injection (`=`/`+`/`-`/`@` leading cells). `src/lib/ads-editor.ts:80`
41. **[High]** Unguarded `decodeURIComponent(window.location.hash)` crashes the FAQ deep-link island on `#%`. `src/components/article/FaqHashOpen.tsx:16`
42. **[High]** Legacy/unrecognized `project.type` never coerced to a valid `ProjectType` — NaN dashboard + hard crash in `Record<ProjectType,…>` lookups. `src/lib/projects/store.firestore.ts:27`

### J. Silent-failure / success-theater / misc High
43. **[High]** Sign-in gate hardcodes `callbackUrl:"/app"`, silently dropping the deep-link destination after login. `src/components/app/AppSignInGate.tsx:78`
44. **[High]** Saving A/B variant performance without editing a field silently zeroes the previously entered metrics. `src/components/ai/AdExperiments.tsx:102`
45. **[High]** `AdsAccountPicker` re-fetches `/api/campaigns/accounts` in an unbounded loop (`[t]` dep from `useT`). `src/components/campaigns/AdsAccountPicker.tsx:90`
46. **[High]** Baselinker sync fetches one page — large catalogs truncated, and `strategy:"replace"` then deletes every SKU past the first page. `src/lib/inventory/baselinker.ts:115`
47. **[High]** Undecryptable stored key silently downgrades to the app's own providers while the UI still shows the user's key "active" (money angle). `src/lib/llm/keys/store.ts:165`
48. **[High]** `normalize()` runs inside the provider try-block — a tool-mapper crash is misclassified as a provider failure after success telemetry is written. `src/lib/llm/index.ts:344`
49. **[High]** Lead-source severity pill derived from the demo's independent cause, not the diagnosis actually shown (a "spam" source can badge green). `src/lib/ai/tools/lead-source-diagnosis.ts:159`
50. **[High]** Imported rank ladder resets its history on every import — the "climb/trend" the map module exists to show is permanently flat for real data. `src/lib/local-signals/import.ts:66`
51. **[High]** LeadSourceDiagnosisPanel shows a stale diagnosis mislabeled with the newly-selected source. `src/components/app/modules/LeadSourceDiagnosisPanel.tsx:195`
52. **[High]** Manually-added catalog rows get a remount-unstable id — a re-opened Katalog collides ids and edits/removes two rows at once. `src/components/app/modules/CatalogManagerModule.tsx:430`
53. **[High]** Re-importing an availability-less feed silently re-activates every product the user paused. `src/lib/catalog/import.ts:57`
54. **[High]** Project workspace CRUD lost-update / orphaning (see D-21; also affects distribution). `src/lib/campaigns/connector.ts:150`
55. **[High]** The mobile "Pokračovat" resume link is permanently pinned to Dashboard — the journey can never reach "finished." `src/components/site/Nav.tsx:48`
56. **[High]** Onboarding `fetchSiteText` reachable from the unauth public `/api/ai` onboarding-scan path (SSRF-guarded fetch + Gemini spend by anonymous callers). `src/lib/onboarding/site-fetch.ts:74`
57. **[High]** Create-project module matrix silently discarded on submit — every custom package collapses to the type's defaults; POST also non-idempotent (double-click = 2 projects). `src/components/app/modules/create-project-shared.tsx`

---

## Per-context breakdown

Sorted by Criticals, then Highs, then Mediums. Every context returned exactly 5 findings (54 × 5 = 270).

| # | Context | C | H | M | L | Report |
|---|---|---:|---:|---:|---:|---|
| 1 | Product Catalog: Model, Feed Import & Ad-Copy Generation | 1 | 1 | 2 | 1 | [`product-catalog-model-feed-import-and-ad-copy-generation.md`](product-catalog-model-feed-import-and-ad-copy-generation.md) |
| 2 | Article & Reporting Publishing Pipeline | 1 | 1 | 1 | 2 | [`article-and-reporting-publishing-pipeline.md`](article-and-reporting-publishing-pipeline.md) |
| 3 | Monthly Report: Live Metrics Ingestion & Tile Model | 0 | 3 | 2 | 0 | [`monthly-report-live-metrics-ingestion-and-tile-model.md`](monthly-report-live-metrics-ingestion-and-tile-model.md) |
| 4 | AI generation, creative studio & ops telemetry | 0 | 2 | 2 | 1 | [`ai-generation-creative-studio-and-ops-telemetry.md`](ai-generation-creative-studio-and-ops-telemetry.md) |
| 5 | BYOM (Bring-Your-Own-Model) Keys & Provider Adapters | 0 | 2 | 2 | 1 | [`byom-bring-your-own-model-keys-and-provider-adapters.md`](byom-bring-your-own-model-keys-and-provider-adapters.md) |
| 6 | Campaign performance & ads operations modules | 0 | 2 | 2 | 1 | [`campaign-performance-and-ads-operations-modules.md`](campaign-performance-and-ads-operations-modules.md) |
| 7 | Campaign Triage, Ad-Ops Control Plane & AI Reporting | 0 | 2 | 2 | 1 | [`campaign-triage-ad-ops-control-plane-and-ai-reporting.md`](campaign-triage-ad-ops-control-plane-and-ai-reporting.md) |
| 8 | Inventory & Warehouse Sync | 0 | 2 | 2 | 1 | [`inventory-and-warehouse-sync.md`](inventory-and-warehouse-sync.md) |
| 9 | LLM Provider Wrapper, Telemetry & Quality Scoring | 0 | 2 | 2 | 1 | [`llm-provider-wrapper-telemetry-and-quality-scoring.md`](llm-provider-wrapper-telemetry-and-quality-scoring.md) |
| 10 | Scheduled cron jobs | 0 | 2 | 2 | 1 | [`scheduled-cron-jobs.md`](scheduled-cron-jobs.md) |
| 11 | Social Media Planning | 0 | 2 | 2 | 1 | [`social-media-planning.md`](social-media-planning.md) |
| 12 | Auth & BYOM entitlements | 0 | 2 | 1 | 2 | [`auth-and-byom-entitlements.md`](auth-and-byom-entitlements.md) |
| 13 | Cost Model & Profit Analytics | 0 | 2 | 1 | 2 | [`cost-model-and-profit-analytics.md`](cost-model-and-profit-analytics.md) |
| 14 | Local SEO, Map Pack, Leads & Reviews | 0 | 2 | 1 | 2 | [`local-seo-map-pack-leads-and-reviews.md`](local-seo-map-pack-leads-and-reviews.md) |
| 15 | AI Abuse Guards & Response Governance | 0 | 1 | 3 | 1 | [`ai-abuse-guards-and-response-governance.md`](ai-abuse-guards-and-response-governance.md) |
| 16 | AI Digital Twin (Communication Autopilot) | 0 | 1 | 3 | 1 | [`ai-digital-twin-communication-autopilot.md`](ai-digital-twin-communication-autopilot.md) |
| 17 | AI Workspace Contracts, Pipeline & Ad Experiments | 0 | 1 | 3 | 1 | [`ai-workspace-contracts-pipeline-and-ad-experiments.md`](ai-workspace-contracts-pipeline-and-ad-experiments.md) |
| 18 | Campaign ops & tenant utility/research | 0 | 1 | 3 | 1 | [`campaign-ops-and-tenant-utility-research.md`](campaign-ops-and-tenant-utility-research.md) |
| 19 | Campaigns / Ad Ops Control Plane | 0 | 1 | 3 | 1 | [`campaigns-ad-ops-control-plane.md`](campaigns-ad-ops-control-plane.md) |
| 20 | Creative Studio - Image Generation & Revenue Attribution | 0 | 1 | 3 | 1 | [`creative-studio-image-generation-and-revenue-attribution.md`](creative-studio-image-generation-and-revenue-attribution.md) |
| 21 | Diagnostic, Growth & Twin-Voice AI Tools (gate-tracked) | 0 | 1 | 3 | 1 | [`diagnostic-growth-and-twin-voice-ai-tools-gate-tracked.md`](diagnostic-growth-and-twin-voice-ai-tools-gate-tracked.md) |
| 22 | Local SEO & Map Pack | 0 | 1 | 3 | 1 | [`local-seo-and-map-pack.md`](local-seo-and-map-pack.md) |
| 23 | PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets | 0 | 1 | 3 | 1 | [`ppc-ads-creative-tools-winning-pattern-mining-and-profitabil.md`](ppc-ads-creative-tools-winning-pattern-mining-and-profitabil.md) |
| 24 | SEO, Keyword & Content Workspace | 0 | 1 | 3 | 1 | [`seo-keyword-and-content-workspace.md`](seo-keyword-and-content-workspace.md) |
| 25 | Social Command Center & Speed-to-Lead Response | 0 | 1 | 3 | 1 | [`social-command-center-and-speed-to-lead-response.md`](social-command-center-and-speed-to-lead-response.md) |
| 26 | Account, Settings & AI Model Configuration | 0 | 1 | 2 | 2 | [`account-settings-and-ai-model-configuration.md`](account-settings-and-ai-model-configuration.md) |
| 27 | AI Content & Marketing Tools | 0 | 1 | 2 | 2 | [`ai-content-and-marketing-tools.md`](ai-content-and-marketing-tools.md) |
| 28 | App Shell & Shared Chrome | 0 | 1 | 2 | 2 | [`app-shell-and-shared-chrome.md`](app-shell-and-shared-chrome.md) |
| 29 | Article Reading Experience | 0 | 1 | 2 | 2 | [`article-reading-experience.md`](article-reading-experience.md) |
| 30 | Campaign Sync & Google Ads Connector | 0 | 1 | 2 | 2 | [`campaign-sync-and-google-ads-connector.md`](campaign-sync-and-google-ads-connector.md) |
| 31 | Finance: LTV, Profit, Spend & Client Reporting | 0 | 1 | 2 | 2 | [`finance-ltv-profit-spend-and-client-reporting.md`](finance-ltv-profit-spend-and-client-reporting.md) |
| 32 | LTV, Spend & Cross-Module Insights | 0 | 1 | 2 | 2 | [`ltv-spend-and-cross-module-insights.md`](ltv-spend-and-cross-module-insights.md) |
| 33 | Performance Dashboard & Reporting | 0 | 1 | 2 | 2 | [`performance-dashboard-and-reporting.md`](performance-dashboard-and-reporting.md) |
| 34 | Project & tenant workspace: CRUD, data connections, distribution & social publishing | 0 | 1 | 2 | 2 | [`project-and-tenant-workspace-crud-data-connections-distribut.md`](project-and-tenant-workspace-crud-data-connections-distribut.md) |
| 35 | Project Lifecycle, Onboarding & Overview | 0 | 1 | 2 | 2 | [`project-lifecycle-onboarding-and-overview.md`](project-lifecycle-onboarding-and-overview.md) |
| 36 | Projects, Project State & Project Data Spine | 0 | 1 | 2 | 2 | [`projects-project-state-and-project-data-spine.md`](projects-project-state-and-project-data-spine.md) |
| 37 | Public marketing & demo pages | 0 | 1 | 2 | 2 | [`public-marketing-and-demo-pages.md`](public-marketing-and-demo-pages.md) |
| 38 | Site Chrome, Auth & Demo Shell | 0 | 1 | 2 | 2 | [`site-chrome-auth-and-demo-shell.md`](site-chrome-auth-and-demo-shell.md) |
| 39 | Twin - Brand Communication Double | 0 | 1 | 2 | 2 | [`twin-brand-communication-double.md`](twin-brand-communication-double.md) |
| 40 | Account, Activity Feed, Demo Data, Users & Usage Metering | 0 | 1 | 1 | 3 | [`account-activity-feed-demo-data-users-and-usage-metering.md`](account-activity-feed-demo-data-users-and-usage-metering.md) |
| 41 | Catalog, Inventory, Audience & Distribution | 0 | 1 | 1 | 3 | [`catalog-inventory-audience-and-distribution.md`](catalog-inventory-audience-and-distribution.md) |
| 42 | Metrics & Analytics Engine | 0 | 1 | 1 | 3 | [`metrics-and-analytics-engine.md`](metrics-and-analytics-engine.md) |
| 43 | Competitive Intelligence: Keywords, SEO Compare & LP Experiments | 0 | 0 | 3 | 2 | [`competitive-intelligence-keywords-seo-compare-and-lp-experim.md`](competitive-intelligence-keywords-seo-compare-and-lp-experim.md) |
| 44 | Core Marketing AI Tools & Skill SDK (gate-tracked) | 0 | 0 | 3 | 2 | [`core-marketing-ai-tools-and-skill-sdk-gate-tracked.md`](core-marketing-ai-tools-and-skill-sdk-gate-tracked.md) |
| 45 | Core Platform Infrastructure | 0 | 0 | 3 | 2 | [`core-platform-infrastructure.md`](core-platform-infrastructure.md) |
| 46 | Design System Primitives | 0 | 0 | 3 | 2 | [`design-system-primitives.md`](design-system-primitives.md) |
| 47 | Marketing Landing Pages | 0 | 0 | 3 | 2 | [`marketing-landing-pages.md`](marketing-landing-pages.md) |
| 48 | Project shell, settings & onboarding | 0 | 0 | 3 | 2 | [`project-shell-settings-and-onboarding.md`](project-shell-settings-and-onboarding.md) |
| 49 | App shell, dev tooling, design system & site metadata infrastructure | 0 | 0 | 2 | 3 | [`app-shell-dev-tooling-design-system-and-site-metadata-infras.md`](app-shell-dev-tooling-design-system-and-site-metadata-infras.md) |
| 50 | Content, creative & keyword tooling modules | 0 | 0 | 2 | 3 | [`content-creative-and-keyword-tooling-modules.md`](content-creative-and-keyword-tooling-modules.md) |
| 51 | Local SEO, social, reviews, reporting & catalog modules | 0 | 0 | 2 | 3 | [`local-seo-social-reviews-reporting-and-catalog-modules.md`](local-seo-social-reviews-reporting-and-catalog-modules.md) |
| 52 | Onboarding, Integrations & Growth Funnel | 0 | 0 | 2 | 3 | [`onboarding-integrations-and-growth-funnel.md`](onboarding-integrations-and-growth-funnel.md) |
| 53 | Organic Visibility, Content Distribution & Brand Voice | 0 | 0 | 2 | 3 | [`organic-visibility-content-distribution-and-brand-voice.md`](organic-visibility-content-distribution-and-brand-voice.md) |
| 54 | UI Shell: Navigation, i18n & Design Tokens | 0 | 0 | 2 | 3 | [`ui-shell-navigation-i18n-and-design-tokens.md`](ui-shell-navigation-i18n-and-design-tokens.md) |

---

## Suggested fix-wave split

Organized so each wave shares one mental model and, where possible, closes a whole cluster at once. Recommended order runs the two Criticals + the highest-blast-radius money/leak clusters first.

**Wave 1 — Criticals + honesty on public surfaces (themes B + the 2 Criticals).** Microsite `illustrative`/index gate; SSRF hex-mapped block-list; "živá data" splice in `build.ts`; degraded-sync alert poisoning; `historyGroundingText` 12-month fabrication; snapshot-to-article period labeling. *~7 findings incl. both Criticals.*

**Wave 2 — Money leak: charge-before-work / no-refund (theme A).** One shared "reserve→commit-on-success, reclaim-on-failure/cache-hit" order for `paid-guard` + `durable-limit` + `usage`; fix `ai/route`, `campaigns/analyze`, Leonardo poll-vs-maxDuration, `images/upload-ref`. *~6–8 findings.* **Highest ROI — it's a live budget/DoS drain today.**

**Wave 3 — Lost-update / non-atomic RMW (theme C).** Introduce a transaction/CAS helper (or optimistic `updated_at`) and route BYOM config, experiments, budget-shift, approveChangeSet, project-state, social connect, ReviewInbox and twin `enforceAutonomy` through it. *~9 findings.*

**Wave 4 — Tenant identity + agency multi-account (themes D + E).** Stop keying storage on `customerId` (`resolveTenant`, aktivita); fix unlinked-project cross-account fallback; digest/report fan-out per connected account; scope the telemetry/spend query by project **before** the 1000-row cap. *~7 findings.* **Agency-facing correctness + a cross-client data leak.**

**Wave 5 — Client-side persistence & hydration (theme F) + signed-profit math (theme G).** Hydrate-in-effect (kill localStorage-in-useState), scope the onboarding-scan result key per project, flush debounced saves; fix `rel()`/`prev≤0`, TrendChart y-floor, partial-month trend, contribution-vs-net, `coverValue`. *~9 findings.*

**Wave 6 — Time/cron + trust-boundary + success-theater tail (themes H + I + J).** UTC-normalize social scheduling, claim-before-publish cron, CSV formula-escape, `decodeURIComponent` guard, `project.type` coercion, `planWeek` `res.ok`, deep-link callbackUrl, AdsAccountPicker loop, baselinker pagination. *~12–14 findings.*

**Then:** the 118 Medium / 95 Low tail per the per-context reports (mostly the same clusters at lower blast radius, plus the 44 new-only refactor findings).

---

## How this scan was run

- **Scanner prompts:** `bug_hunter` (primary) + `code_refactor` (secondary, new-only) role prompts from Vibeman's `src/lib/prompts/registry/agents/`.
- **Scope:** all 54 contexts / 11 groups of the 2026-07-09 rebuilt context map (627 source files), 5 findings per context.
- **Dedup method:** each subagent read its context's 2026-07-09 `code_refactor` report *in full* and suppressed any refactor finding already present (including cross-cutting clusters and deferred items); it also re-checked whether prior findings were **already fixed in the current tree** and deduped against code, not just the report text. Rejected-as-covered candidates: ~4 per context.
- **Verification:** findings counted two ways (header sum 270 = severity-bullet count 270); every context returned exactly 5; every `File:` is a verified `path:line`.
- **Baseline (green, unchanged from 2026-07-09):** `tsc` 0 · unit 657/657 · (deps installed with `npm ci --legacy-peer-deps` — `next-auth` beta peer-conflicts the Next 16 preview; lockfile untouched).
- **Provenance:** `git` HEAD `01cbc83` on clean `master`; project not registered in Vibeman (scanned from `context-map.json` on disk).
