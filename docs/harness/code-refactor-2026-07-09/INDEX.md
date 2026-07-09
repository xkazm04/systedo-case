# Code Refactor Scan — systedo-case ("Adamant"), 2026-07-09

> A `code_refactor` audit (dead code, duplication, structure, cleanup) over the **entire** rebuilt context map.
> 54 parallel per-context subagent runs, batched in waves of 8. Every "unused"/duplicate claim was repo-wide-grep-verified by the scanning agent before it was written down.
>
> **The context map was rebuilt first.** The map on file covered 65 of 628 source files (90% stale — whole modules like the AI/LLM layer, campaigns domain, twin, catalog, and the entire `/app` product surface were invisible). It was re-derived from the tree into 54 contexts / 11 groups and persisted back to Vibeman. Scanning the old map would have covered ~10% of the code.

---

## Totals

| | Critical | High | Medium | Low | **Total** |
|---|---:|---:|---:|---:|---:|
| Across 54 contexts | 11 | 97 | 110 | 52 | **270** |
| Share | 4% | 35% | 40% | 19% | 100% |

**By category**: duplication 184 · dead-code 36 · structure 29 · cleanup 21. This is a duplication-dominated codebase — the dominant shape is *"a canonical helper exists and is used by most callers, but N files reinvent it,"* and in ~15 cases the reinvented copy has already **drifted** from the original (different formula, swapped argument order, missing an escape case), which is where the Criticals and the sharper Highs live.

---

## The 11 Criticals (one line each)

Every Critical here is a *drift* Critical: two implementations of one concept that now disagree, and the wrong one is on a user-facing or security path. None are "missing code" — they are all "two copies, silently diverged."

### A. Security / auth

- **Cron auth bypass** — `/api/cron/report` and `/api/cron/social` hand-roll `authorized()` with a plain `===` secret compare instead of the shared `cronAuthorized()` (SHA-256 + `timingSafeEqual`) that the other 4 cron routes use — reintroduces the timing side-channel that helper exists to close. `src/app/api/cron/report/route.ts:19`  ·  [`scheduled-cron-jobs.md`](scheduled-cron-jobs.md)
- **Twin autonomy gate is client-only** — `decideDraft` ("one rule, one place" for whether a draft may auto-approve) is enforced only in `TwinOutbox.tsx` (client); the `POST /api/projects/[id]/twin` route's `sanitizeDraft` trusts a POSTed draft's `status`/`autoApproved` verbatim, so a forged payload can mark any draft `approved`. `src/lib/twin/types.ts:332`  ·  [`twin-brand-communication-double.md`](twin-brand-communication-double.md)

### B. Wrong numbers / wrong honesty signal shown to the user

- **Overhead "unprofitable" count vs row color disagree** — `applyOverhead` counts a channel unprofitable when `contributionProfit < cost`, but `ProfitModule` colors the row green on `contributionProfit >= 0` — a channel renders green while being tallied in the red footer. `src/lib/profit/overhead.ts:52`  ·  [`cost-model-and-profit-analytics.md`](cost-model-and-profit-analytics.md)
- **Inventory guardrail drifted from ad-ops** — `INVENTORY_POLICY.maxMoves = 5` while the canonical `DEFAULT_POLICY.maxMoves = 3` it claims (in its own doc comment) to reuse — the "within guardrails" badge is checked against a laxer rule than the control plane it cites. `src/lib/inventory/action-plan.ts:60`  ·  [`inventory-and-warehouse-sync.md`](inventory-and-warehouse-sync.md)
- **Two disagreeing definitions of "live data"** — `resolveReportDataset` calls data live only after rows actually sync; `projectDataSource` calls it live the moment an Ads account is linked. Settings/Overview say "živá data" while the Monthly Report still shows sample numbers. `src/lib/report-metrics/resolve.ts:27`  ·  [`monthly-report-live-metrics-ingestion-and-tile-model.md`](monthly-report-live-metrics-ingestion-and-tile-model.md)
- **Onboarding "Ads connected" ignores the user-level connection** — The checklist checks only `project.adsCustomerId`, but Integrations + report-sync both honor a user-level `getAdsConnection(userId)` fallback — a connected user sees the step stuck "not done" forever. `src/lib/onboarding/progress.ts:51`  ·  [`onboarding-integrations-and-growth-funnel.md`](onboarding-integrations-and-growth-funnel.md)
- **Insights module labels always render in Czech** — `insights/aggregate.ts` shadows the real `moduleLabel(m, locale)` with a same-named Czech-only lookalike, so every recommendation pill is Czech even in the English UI. `src/lib/insights/aggregate.ts:31`  ·  [`ltv-spend-and-cross-module-insights.md`](ltv-spend-and-cross-module-insights.md)
- **Two "readable ink" formulas pick opposite colors** — `design-tokens-color.ts` (gamma-corrected WCAG) and `branding/compute.ts` (plain weighted average) choose opposite text colors for `#f59e0b` — one of branding's own accent-palette colors. `src/lib/design-tokens-color.ts:11`  ·  [`ui-shell-navigation-i18n-and-design-tokens.md`](ui-shell-navigation-i18n-and-design-tokens.md)

### C. Reinvented-primitive Criticals

- **SEO weight persistence reintroduces a hydration bug** — `CompareSeoTable` hand-rolls localStorage weight restore in a lazy `useState` initializer instead of the `usePersistedForm` hook (which restores in `useEffect` precisely to avoid SSR/hydration mismatch) — on a real SSR'd route, returning users hit a hydration mismatch every load. `src/components/app/modules/CompareSeoTable.tsx:176`  ·  [`seo-keyword-and-content-workspace.md`](seo-keyword-and-content-workspace.md)
- **Product-creative module ignores the persisted catalog** — `produktova-kreativa/page.tsx` imports the static `SAMPLE_PRODUCTS` demo feed instead of the catalog-aware `loadProductsFor()` its sibling modules already migrated to — a user's real catalog edits never reach the module whose whole job is generating ad creative from that catalog. `src/app/app/[projectId]/produktova-kreativa/page.tsx:6`  ·  [`content-creative-and-keyword-tooling-modules.md`](content-creative-and-keyword-tooling-modules.md)
- **Gate mis-attributes `chat.ts`'s real prompt** — `chat.ts` builds its system prompt from `analysis.ts`'s exported `ANALYSIS_SYSTEM`; the LLM gate's per-file attribution only re-proves `"analysis"` when `analysis.ts` changes, so `"chat"` is never re-verified against a live model when its real prompt changes — a correctness hole in the safety gate itself. `src/lib/ai/tools/chat.ts:11`  ·  [`core-marketing-ai-tools-and-skill-sdk-gate-tracked.md`](core-marketing-ai-tools-and-skill-sdk-gate-tracked.md)

---

## Cross-cutting duplication clusters (the meta-themes)

Most of the 184 duplication findings collapse into a smaller set of *"one canonical helper, N reinventions"* clusters. Fixing the cluster once closes many findings at once and is the highest-leverage way to run the waves. Ranked by leverage:

| # | Cluster | What / where it drifted | Contexts |
|---|---|---|---|
| 1 | `roas()` / ratio math | `src/lib/campaigns/store.ts:602` redefines `roas(cost,value)` with the **opposite argument order** of the canonical `roas(value,cost)` in `src/lib/metrics/ratios.ts:11`; `metrics/series.ts`, `experiment-types.ts`, `images/attribution-types.ts`, `patterns/extract.ts` and others each reimplement the same ratio set (pno/aov/cr/roas/ctr/cpc). | 35, 36, 40, 20, 23, 48, 8 |
| 2 | session → `currentUserId()` | The memoized `currentUserId` in `src/lib/session.ts` is hand-reinvented in `projects/guard.ts` and ~27 route files (`auth`, campaign-ops, project-workspace, ai-generation), none going through React `cache()`. | 24, 26, 27, 28 |
| 3 | owned-project guard | `currentUserId()` + `getProject()` + 401/404 is copy-pasted ~19× across the project/tenant routes; two files even invented private `owner()`/`ownedProject()` helpers that nobody else found. Needs one `requireOwnedProject()`. | 27, 26 |
| 4 | CSV escaping + download | `csvCell`/`csvField`/`downloadText` reimplemented across `export.ts`, `activity/compute.ts`, `ltv/compute.ts`, `SpendModule.tsx`, `ActivityModule.tsx`, `catalog/export.ts` — and two copies have **drifted** (missing `\r` handling), so a bare-CR value exports unescaped today. | 45, 44, 42, 2, 5, 37 |
| 5 | seeded PRNG / FNV-1a hash | `src/lib/demo/prng.mjs` (`hashStr`) exists explicitly to be the one copy, but `project-data/seed.ts`, `project-data/vary.ts`, `images/studio.ts`, `organic-channels/sample.ts` each reinvent it (~5 copies). | 43, 50, 53, 23 |
| 6 | `luminance` / readable ink | Two formulas (WCAG gamma-corrected vs plain weighted) that disagree — the Critical above; also duplicated tone→color ternaries in 3 feature modules that bypass `ui.tsx`'s `PILL_TONES`. | 46, 50, 13 |
| 7 | profit / POAS formula | `cost-model/compute.ts periodProfit` and `profit/overhead.ts applyOverhead` independently implement net-profit-after-spend-and-overhead; grossProfit/POAS/break-even copy-pasted 3× within `profit/`. | 39, 5 |
| 8 | `escapeHtml` | Byte-identical across ~5 files (`cron` digest, `campaigns/alerts.ts`, `anomaly-alerts.ts`, `newsletter.ts` — the last missing apostrophe escaping). | 25, 36, 45 |
| 9 | provider-ordering (dev→Claude / prod→Gemini) | Hand-encoded 3× — `llm/index.ts resolveProviders`, `status-core.ts resolveWouldServe`, inline in `status/route.ts` — already drifted (`AiServePath` has no `byom` case), so the preflight banner can lie about who serves. | 16, 21 |
| 10 | clipboard copy-with-fallback | `copyTextWithFallback` sits exported-but-unused in `permalink.ts` while ~6 files (DistributionModule, DevInspector, ShareBar, CopyMarkdownButton…) hand-roll the textarea fallback. | 6, 9, 29 |
| 11 | paid-endpoint abuse-guard sequence | `tooLarge → durableGuard → acquireSlot` copy-pasted across `ai/route.ts`, `images/route.ts`, `images/nobg/route.ts`; `upload-ref` already dropped `acquireSlot`. | 28 |
| 12 | `ProjectType` allow-lists | `PROJECT_TYPES` from `projects/types.ts` is re-hand-listed in `onboarding-scan.ts`, `channel-research.ts`, `onboarding/progress.ts`, `modules.ts ALL[]` — several without exhaustiveness checks, so a 6th type silently degrades. | 19, 43, 51 |
| 13 | `SampleDataNote` gutter block | `<div className="mb-5"><SampleDataNote/></div>` copy-pasted across ~16 module pages; `ModulePage` should own the slot. | 32, 33 |
| 14 | async fetch-action busy/error skeleton | The `setBusy/try/catch/finally/setError` shape is hand-copied ~8× in campaigns UI and byom; needs a `useAsyncAction` hook. | 10, 2 |
| 15 | `clamp` / `cap` / `envInt` / `str()` micro-helpers | `clamp`/`cap` dup'd between `_shared.ts` and `social/draft.ts`; `envInt` 3× with `n>0` vs `n>=0` divergence; `str()` 12× app-wide with trim/no-trim divergence. | 18, 52, 21, 26 |

---

## Per-context breakdown

Sorted by Criticals, then total. Every context returned exactly 5 findings (54 × 5 = 270).

| Context | C | H | M | L | Report |
|---|---:|---:|---:|---:|---|
| Content, creative & keyword tooling modules | 1 | 1 | 2 | 1 | [`content-creative-and-keyword-tooling-modules.md`](content-creative-and-keyword-tooling-modules.md) |
| Core Marketing AI Tools & Skill SDK (gate-tracked) | 1 | 2 | 1 | 1 | [`core-marketing-ai-tools-and-skill-sdk-gate-tracked.md`](core-marketing-ai-tools-and-skill-sdk-gate-tracked.md) |
| Cost Model & Profit Analytics | 1 | 2 | 1 | 1 | [`cost-model-and-profit-analytics.md`](cost-model-and-profit-analytics.md) |
| Inventory & Warehouse Sync | 1 | 1 | 2 | 1 | [`inventory-and-warehouse-sync.md`](inventory-and-warehouse-sync.md) |
| LTV, Spend & Cross-Module Insights | 1 | 2 | 2 | 0 | [`ltv-spend-and-cross-module-insights.md`](ltv-spend-and-cross-module-insights.md) |
| Monthly Report: Live Metrics Ingestion & Tile Model | 1 | 2 | 1 | 1 | [`monthly-report-live-metrics-ingestion-and-tile-model.md`](monthly-report-live-metrics-ingestion-and-tile-model.md) |
| Onboarding, Integrations & Growth Funnel | 1 | 1 | 2 | 1 | [`onboarding-integrations-and-growth-funnel.md`](onboarding-integrations-and-growth-funnel.md) |
| Scheduled cron jobs | 1 | 2 | 1 | 1 | [`scheduled-cron-jobs.md`](scheduled-cron-jobs.md) |
| SEO, Keyword & Content Workspace | 1 | 1 | 2 | 1 | [`seo-keyword-and-content-workspace.md`](seo-keyword-and-content-workspace.md) |
| Twin — Brand Communication Double | 1 | 1 | 1 | 2 | [`twin-brand-communication-double.md`](twin-brand-communication-double.md) |
| UI Shell: Navigation, i18n & Design Tokens | 1 | 1 | 3 | 0 | [`ui-shell-navigation-i18n-and-design-tokens.md`](ui-shell-navigation-i18n-and-design-tokens.md) |
| Account, Activity Feed, Demo Data, Users & Usage Metering | 0 | 2 | 2 | 1 | [`account-activity-feed-demo-data-users-and-usage-metering.md`](account-activity-feed-demo-data-users-and-usage-metering.md) |
| Account, Settings & AI Model Configuration | 0 | 3 | 1 | 1 | [`account-settings-and-ai-model-configuration.md`](account-settings-and-ai-model-configuration.md) |
| AI Abuse Guards & Response Governance | 0 | 2 | 2 | 1 | [`ai-abuse-guards-and-response-governance.md`](ai-abuse-guards-and-response-governance.md) |
| AI Content & Marketing Tools | 0 | 3 | 2 | 0 | [`ai-content-and-marketing-tools.md`](ai-content-and-marketing-tools.md) |
| AI Digital Twin (Communication Autopilot) | 0 | 1 | 3 | 1 | [`ai-digital-twin-communication-autopilot.md`](ai-digital-twin-communication-autopilot.md) |
| AI generation, creative studio & ops telemetry | 0 | 2 | 1 | 2 | [`ai-generation-creative-studio-and-ops-telemetry.md`](ai-generation-creative-studio-and-ops-telemetry.md) |
| AI Workspace Contracts, Pipeline & Ad Experiments | 0 | 2 | 2 | 1 | [`ai-workspace-contracts-pipeline-and-ad-experiments.md`](ai-workspace-contracts-pipeline-and-ad-experiments.md) |
| App Shell & Shared Chrome | 0 | 2 | 2 | 1 | [`app-shell-and-shared-chrome.md`](app-shell-and-shared-chrome.md) |
| App shell, dev tooling, design system & site metadata infrastructure | 0 | 2 | 2 | 1 | [`app-shell-dev-tooling-design-system-and-site-metadata-infras.md`](app-shell-dev-tooling-design-system-and-site-metadata-infras.md) |
| Article & Reporting Publishing Pipeline | 0 | 1 | 3 | 1 | [`article-and-reporting-publishing-pipeline.md`](article-and-reporting-publishing-pipeline.md) |
| Article Reading Experience | 0 | 2 | 2 | 1 | [`article-reading-experience.md`](article-reading-experience.md) |
| Auth & BYOM entitlements | 0 | 2 | 2 | 1 | [`auth-and-byom-entitlements.md`](auth-and-byom-entitlements.md) |
| BYOM (Bring-Your-Own-Model) Keys & Provider Adapters | 0 | 2 | 3 | 0 | [`byom-bring-your-own-model-keys-and-provider-adapters.md`](byom-bring-your-own-model-keys-and-provider-adapters.md) |
| Campaign ops & tenant utility/research | 0 | 3 | 1 | 1 | [`campaign-ops-and-tenant-utility-research.md`](campaign-ops-and-tenant-utility-research.md) |
| Campaign performance & ads operations modules | 0 | 2 | 3 | 0 | [`campaign-performance-and-ads-operations-modules.md`](campaign-performance-and-ads-operations-modules.md) |
| Campaign Sync & Google Ads Connector | 0 | 3 | 1 | 1 | [`campaign-sync-and-google-ads-connector.md`](campaign-sync-and-google-ads-connector.md) |
| Campaign Triage, Ad-Ops Control Plane & AI Reporting | 0 | 2 | 3 | 0 | [`campaign-triage-ad-ops-control-plane-and-ai-reporting.md`](campaign-triage-ad-ops-control-plane-and-ai-reporting.md) |
| Campaigns / Ad Ops Control Plane | 0 | 1 | 3 | 1 | [`campaigns-ad-ops-control-plane.md`](campaigns-ad-ops-control-plane.md) |
| Catalog, Inventory, Audience & Distribution | 0 | 2 | 2 | 1 | [`catalog-inventory-audience-and-distribution.md`](catalog-inventory-audience-and-distribution.md) |
| Competitive Intelligence: Keywords, SEO Compare & LP Experiments | 0 | 1 | 2 | 2 | [`competitive-intelligence-keywords-seo-compare-and-lp-experim.md`](competitive-intelligence-keywords-seo-compare-and-lp-experim.md) |
| Core Platform Infrastructure | 0 | 1 | 2 | 2 | [`core-platform-infrastructure.md`](core-platform-infrastructure.md) |
| Creative Studio — Image Generation & Revenue Attribution | 0 | 2 | 1 | 2 | [`creative-studio-image-generation-and-revenue-attribution.md`](creative-studio-image-generation-and-revenue-attribution.md) |
| Design System Primitives | 0 | 1 | 3 | 1 | [`design-system-primitives.md`](design-system-primitives.md) |
| Diagnostic, Growth & Twin-Voice AI Tools (gate-tracked) | 0 | 1 | 3 | 1 | [`diagnostic-growth-and-twin-voice-ai-tools-gate-tracked.md`](diagnostic-growth-and-twin-voice-ai-tools-gate-tracked.md) |
| Finance: LTV, Profit, Spend & Client Reporting | 0 | 2 | 3 | 0 | [`finance-ltv-profit-spend-and-client-reporting.md`](finance-ltv-profit-spend-and-client-reporting.md) |
| LLM Provider Wrapper, Telemetry & Quality Scoring | 0 | 2 | 2 | 1 | [`llm-provider-wrapper-telemetry-and-quality-scoring.md`](llm-provider-wrapper-telemetry-and-quality-scoring.md) |
| Local SEO & Map Pack | 0 | 1 | 3 | 1 | [`local-seo-and-map-pack.md`](local-seo-and-map-pack.md) |
| Local SEO, Map Pack, Leads & Reviews | 0 | 3 | 2 | 0 | [`local-seo-map-pack-leads-and-reviews.md`](local-seo-map-pack-leads-and-reviews.md) |
| Local SEO, social, reviews, reporting & catalog modules | 0 | 1 | 3 | 1 | [`local-seo-social-reviews-reporting-and-catalog-modules.md`](local-seo-social-reviews-reporting-and-catalog-modules.md) |
| Marketing Landing Pages | 0 | 2 | 2 | 1 | [`marketing-landing-pages.md`](marketing-landing-pages.md) |
| Metrics & Analytics Engine | 0 | 3 | 1 | 1 | [`metrics-and-analytics-engine.md`](metrics-and-analytics-engine.md) |
| Organic Visibility, Content Distribution & Brand Voice | 0 | 2 | 3 | 0 | [`organic-visibility-content-distribution-and-brand-voice.md`](organic-visibility-content-distribution-and-brand-voice.md) |
| Performance Dashboard & Reporting | 0 | 2 | 3 | 0 | [`performance-dashboard-and-reporting.md`](performance-dashboard-and-reporting.md) |
| PPC/Ads Creative Tools, Winning-Pattern Mining & Profitability Targets | 0 | 2 | 2 | 1 | [`ppc-ads-creative-tools-winning-pattern-mining-and-profitabil.md`](ppc-ads-creative-tools-winning-pattern-mining-and-profitabil.md) |
| Product Catalog: Model, Feed Import & Ad-Copy Generation | 0 | 1 | 2 | 2 | [`product-catalog-model-feed-import-and-ad-copy-generation.md`](product-catalog-model-feed-import-and-ad-copy-generation.md) |
| Project & tenant workspace: CRUD, data connections, distribution & social publishing | 0 | 2 | 2 | 1 | [`project-and-tenant-workspace-crud-data-connections-distribut.md`](project-and-tenant-workspace-crud-data-connections-distribut.md) |
| Project Lifecycle, Onboarding & Overview | 0 | 2 | 2 | 1 | [`project-lifecycle-onboarding-and-overview.md`](project-lifecycle-onboarding-and-overview.md) |
| Project shell, settings & onboarding | 0 | 1 | 2 | 2 | [`project-shell-settings-and-onboarding.md`](project-shell-settings-and-onboarding.md) |
| Projects, Project State & Project Data Spine | 0 | 1 | 1 | 3 | [`projects-project-state-and-project-data-spine.md`](projects-project-state-and-project-data-spine.md) |
| Public marketing & demo pages | 0 | 2 | 2 | 1 | [`public-marketing-and-demo-pages.md`](public-marketing-and-demo-pages.md) |
| Site Chrome, Auth & Demo Shell | 0 | 2 | 2 | 1 | [`site-chrome-auth-and-demo-shell.md`](site-chrome-auth-and-demo-shell.md) |
| Social Command Center & Speed-to-Lead Response | 0 | 3 | 1 | 1 | [`social-command-center-and-speed-to-lead-response.md`](social-command-center-and-speed-to-lead-response.md) |
| Social Media Planning | 0 | 2 | 3 | 0 | [`social-media-planning.md`](social-media-planning.md) |

---

## Suggested fix-wave split

Organized so each wave shares one mental model and, wherever possible, closes a whole cross-cutting cluster at once. Recommended order runs security + drift-Criticals first, then the high-leverage shared-helper consolidations, then per-area cleanup.

**Wave 1 — Security & auth drift (Criticals A + cluster 2, 3, 9)** — Cron timing-safe auth; twin server-side autonomy gate; single `currentUserId()` + `requireOwnedProject()`; provider-ordering single source.  _(~8 findings incl. 2 Criticals)_

**Wave 2 — "Wrong number / wrong honesty" Criticals (Critical group B)** — Overhead count-vs-color; inventory guardrail; live-data definition; onboarding Ads check; insights locale label; readable-ink formula.  _(6 Criticals + their sibling dups)_

**Wave 3 — Reinvented-primitive Criticals (Critical group C)** — SEO weight persistence → `usePersistedForm`; produktová-kreativa → `loadProductsFor()`; gate attribution for `chat.ts`.  _(3 Criticals (+ gate-aware, do carefully))_

**Wave 4 — Ratio/finance math single source (cluster 1, 7)** — Kill the swapped-arg `roas`; route all ratio callers through `metrics/ratios.ts`; consolidate profit/POAS formula.  _(~14 findings)_

**Wave 5 — Shared utility consolidation (clusters 4, 5, 8, 15)** — CSV escape/download; PRNG/FNV; escapeHtml; clamp/cap/envInt/str.  _(~20 findings)_

**Wave 6 — UI shared-component extraction (clusters 10, 13, 14 + tone maps)** — copyTextWithFallback; SampleDataNote slot in ModulePage; useAsyncAction; PILL_TONES tone maps; copied-flag+timer hook.  _(~22 findings)_

**Wave 7 — AI-layer duplication (clusters 11, 12 + AI tool dups)** — Paid-endpoint abuse-guard sequence; ProjectType allow-lists; slugify/diacritic-fold; normalize/validate shape across analysis/monthly-recap/campaign-eval. Gate-aware.  _(~18 findings)_

**Waves 8+ — Dead-code sweep + per-area structure + Low cleanup** — The 36 dead-code exports/fields/branches, the 29 structure/oversized-file findings, and the 52 Low cleanup nits, taken area by area.  _(~110 findings)_

---

## How this scan was run

- **Scanner**: `code_refactor` agent prompt (`src/lib/prompts/registry/agents/code-refactor.ts`), 5 findings/context.
- **Scope**: all 628 `.ts`/`.tsx` under `src/` (86,908 LOC), full-stack.
- **Context map**: rebuilt from scratch this run (6 parallel surveyors partitioned the tree; each verified exact file coverage), persisted to Vibeman as 54 contexts / 11 groups. Old 20-context map backed up.
- **Method**: 54 `general-purpose` subagents (Sonnet), waves of 8, each handed a self-contained spec carrying the project constraints (LLM tool-gate, dual-store dispatcher, tsc-invisible client/server boundary, Czech i18n). Each read its owned files + grepped repo-wide to prove every claim.
- **Verification**: findings counted two ways — sum of per-report `> Total:` headers (270) and count of `- **Severity**:` bullets (270). Match. All 54 reports well-formed (declared total == parsed blocks for every file).
- **Baseline** (branch `vibeman/code-refactor-2026-07-09`, off master `96358a3`): `tsc` 0 errors · `next build` ✓ · 657/657 unit tests · lint 0 errors (2 pre-existing warnings).
- **Known Vibeman bug found**: `validateFilePathArray` in `src/lib/pathSecurity.ts` rejects Next.js catch-all route paths (`[...nextauth]`) as "directory traversal" because it substring-matches `..` — no catch-all route can be stored in a context. Worked around; flagged to report.