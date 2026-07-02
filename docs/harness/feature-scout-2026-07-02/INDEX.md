# Feature Scout Scan — systedo-case, 2026-07-02

> Feature-discovery pass over all 20 mapped contexts (5 ideas per context, top-5-by-value).
> 20 parallel Feature-Scout subagents, dispatched in waves of ≤8. Read-only scan.

## Totals

| Metric | Value |
|---|---|
| Contexts scanned | 20 |
| Ideas | 100 (5 per context) |
| Impact distribution | **9**: 0 · **8**: 16 · **7**: 36 · **6**: 39 · **5**: 8 · **4**: 1 |
| Flags | **[GATE]**: 4 · **[CLIENT]**: 64 · **unflagged**: 32 |

Flag legend: **[GATE]** = touches LLM-gate hashed files → ~340 s real-Claude pre-commit run. **[CLIENT]** = touches `"use client"` components → the wave must finish with a full `next build`. Two additional reports mention [GATE] only to declare it out of scope (build-tooling #1, campaign-connector-store #2) — they are NOT gate-triggering as scoped.

## Per-context breakdown

Sorted by top-idea value (impact desc, then effort asc, risk asc).

| # | Context | Report | Top idea (one line) | Top I/E/R | GATE count |
|---|---|---|---|---|---|
| 1 | ai-workspace | [ai-workspace.md](ai-workspace.md) | #1 Brief → ads handoff completes the research→content→performance loop | 8/3/2 | 0 |
| 2 | article-reading | [article-reading.md](article-reading.md) | #1 Collapsible mobile TOC above the article body | 8/3/2 | 0 |
| 3 | campaign-connector-store | [campaign-connector-store.md](campaign-connector-store.md) | #1 Label degraded live syncs as sample data instead of "živá data" | 8/3/2 | 0 |
| 4 | campaign-sync-api | [campaign-sync-api.md](campaign-sync-api.md) | #1 Flag stale AI reports when data changed since the evaluation | 8/3/2 | 0 |
| 5 | metrics-engine | [metrics-engine.md](metrics-engine.md) | #1 Year-over-year comparison baseline in `evaluatePeriod` | 8/3/2 | 0 |
| 6 | ai-generation-api | [ai-generation-api.md](ai-generation-api.md) | #2 "Refine with instructions" re-run for the non-hashed tools | 8/4/3 | 0 |
| 7 | ai-tool-forms | [ai-tool-forms.md](ai-tool-forms.md) | #1 Editable generated ad assets with live Ad Strength recompute | 8/4/3 | 0 |
| 8 | campaign-console | [campaign-console.md](campaign-console.md) | #1 One-click "evaluate all flagged" batch queue in the triage banner | 8/4/3 | 0 |
| 9 | campaign-model-prompts | [campaign-model-prompts.md](campaign-model-prompts.md) | #1 Ground AI eval prompts in the sync-over-sync diff | 8/4/3 | 1 |
| 10 | dataset-seed | [dataset-seed.md](dataset-seed.md) | #1 Deterministic story events so anomalies/impact/AI blocks light up | 8/4/3 | 0 |
| 11 | design-system | [design-system.md](design-system.md) | #1 Extend Sparkline so the 4 hand-rolled module clones can adopt it | 8/5/3 | 0 |
| 12 | llm-test-gate | [llm-test-gate.md](llm-test-gate.md) | #1 Per-tool incremental gate — re-prove only the tools whose code changed | 8/5/3 | 1 |
| 13 | llm-provider-wrapper | [llm-provider-wrapper.md](llm-provider-wrapper.md) | #1 Per-tool model-tier routing (fast vs quality) | 8/5/4 | 2 |
| 14 | article-content | [article-content.md](article-content.md) | #1 Article-specific Open Graph share card | 7/2/1 | 0 |
| 15 | dashboard-kpis | [dashboard-kpis.md](dashboard-kpis.md) | #1 Required daily run-rate to close the monthly goal gap | 7/2/1 | 0 |
| 16 | home-app-shell | [home-app-shell.md](home-app-shell.md) | #1 Branded, locale-aware 404 page | 7/2/1 | 0 |
| 17 | trend-channel | [trend-channel.md](trend-channel.md) | #1 PNO goal reference line on the trend chart | 7/2/1 | 0 |
| 18 | build-tooling | [build-tooling.md](build-tooling.md) | #1 `server-only` poisoning of Node-bound server modules | 7/3/2 | 0 |
| 19 | format-helpers | [format-helpers.md](format-helpers.md) | #1 Sweep the ad-hoc `toFixed` decimal-point leaks through the formatters | 7/3/2 | 0 |
| 20 | nav-header-footer | [nav-header-footer.md](nav-header-footer.md) | #3 Cmd/Ctrl+K quick-nav palette driven by the typed nav model | 7/5/3 | 0 |

## Top value picks — quick wins

Every idea with Impact ≥ 7 AND Effort ≤ 4 AND Risk ≤ 3 AND no [GATE] flag — 40 ideas. Sorted by impact desc, then effort asc.

**Impact 8**

- **ai-workspace #1 — Brief → ads handoff** — "Vytvořit inzeráty z briefu" maps brief fields into the ad generator via the existing seed+nonce pattern. 8/3/2, [CLIENT], `src/components/ai/AiAssistant.tsx:75`
- **article-reading #1 — Mobile table of contents** — `lg:hidden` collapsible `<details>` TOC fed by the already-computed `toc` array. 8/3/2, [CLIENT], `src/app/clanek/page.tsx:185`
- **campaign-connector-store #1 — Truth-in-labeling for degraded live sync** — persist `degraded`/`degradedReason`, set `source: "sample"` when the live fetch fell back. 8/3/2, [CLIENT], `src/lib/campaigns/connector.ts:57`
- **campaign-sync-api #1 — Stale-report flags in GET state** — compare stored `input_hash` vs current `hashEvalInputs`; badge "data changed since this evaluation". 8/3/2, [CLIENT], `src/app/api/campaigns/route.ts:41`
- **metrics-engine #1 — YoY baseline in evaluatePeriod** — optional `"yoy"` compare slicing the same window 365 days back; PeriodResult shape unchanged. 8/3/2, [CLIENT], `src/lib/metrics/series.ts:92`
- **ai-generation-api #2 — Refine-with-instructions re-run** — free-text `refine` note appended to prompts of non-hashed tools; also busts the 15-min input-hash cache. 8/4/3, [CLIENT], `src/lib/ai-types.ts:352`
- **ai-tool-forms #1 — Editable ad assets in place** — inline-edit generated assets with live Ad Strength / RSA preview / CSV / A/B-save recompute. 8/4/3, [CLIENT], `src/components/ai/AdGenerator.tsx:566`
- **campaign-connector-store #2 — Sync daily budgets + flag budget-capped winners** — add `campaign_budget.amount_micros` to the GAQL, compute pacing, flag "omezeno rozpočtem". 8/4/3, [CLIENT], `src/lib/google/ads.ts:268`
- **campaign-console #1 — Evaluate-all-flagged batch queue** — banner CTA runs the existing `analyze()` sequentially over the triage-flagged set. 8/4/3, [CLIENT], `src/components/campaigns/TriageBanner.tsx:87`
- **dataset-seed #1 — Deterministic story events in the seed** — Black Friday spike / outage / cost-runaway multipliers + an `events` calendar so the anomaly engine and AI blocks finally fire. 8/4/3, no flags, `scripts/generate-data.mjs:60-93`

**Impact 7, effort ≤ 2**

- **article-content #1 — Article OG share card** — segment-level `opengraph-image.tsx` from `article.meta` instead of the generic portfolio card. 7/2/1, no flags, `src/app/clanek/page.tsx:55`
- **campaign-console #2 — Filtered-segment totals footer** — `<tfoot>` via the existing pure `aggregate()`; re-derived ROAS/PNO, no drift. 7/2/1, [CLIENT], `src/components/campaigns/CampaignTable.tsx:683`
- **dashboard-kpis #1 — Required daily run-rate tile** — `(goal − mtd) / daysRemaining` as a fourth Stat tile on the pacing card. 7/2/1, [CLIENT], `src/components/dashboard/GoalPacing.tsx:222`
- **home-app-shell #1 — Branded locale-aware 404** — `not-found.tsx` with recovery links from `localizedNavItems`. 7/2/1, no flags, `src/app/layout.tsx:64`
- **llm-test-gate #2 — Key-free `--check` mode + CI freshness** — CI verifies the committed gate cache matches the committed LLM code; `git add` the cache in-hook. 7/2/1, no flags, `scripts/llm-gate.mjs:126`
- **trend-channel #1 — PNO goal reference line** — dashed target line + „Cíl" label when the trend chart shows PNO. 7/2/1, [CLIENT], `src/components/dashboard/TrendChart.tsx:252`
- **trend-channel #2 — Surface `partial`/`truncated` flags** — tooltip note + hollow marker for partial buckets; "zkráceno" hint. 7/2/1, [CLIENT], `src/components/dashboard/TrendChart.tsx:409`
- **ai-workspace #2 — `?tool=` deep-link for the active tab** — shareable/bookmarkable tool links; refresh keeps your place. 7/2/2, [CLIENT], `src/components/ai/AiAssistant.tsx:65`
- **dashboard-kpis #2 — Period-scope the alerts feed** — filter anomalies + Kč impact to the selected window; add the scope label. 7/2/2, [CLIENT], `src/components/dashboard/DashboardClient.tsx:205`
- **metrics-engine #2 — Required-pace prescription in monthlyPacing** — "you need ≈ X Kč/day (+N % vs recent)" derived fields. 7/2/2, [CLIENT], `src/lib/metrics/pacing.ts:75`

**Impact 7, effort 3**

- **ai-generation-api #1 — Per-tool generation history** — bounded last-5 result list + restore strip shared by all 12 tools. 7/3/2, [CLIENT], `src/components/ai/useAiTool.ts:24`
- **ai-tool-forms #2 — Google Ads Editor-ready CSV** — one wide row (Headline 1–15 / Description 1–4) importable straight into Ads Editor. 7/3/2, [CLIENT], `src/components/ai/AdGenerator.tsx:350`
- **article-reading #2 — Article Markdown export** — pure `articleToMarkdown` + "Copy for AI" button / `.md` route. 7/3/2, [CLIENT], `src/lib/article.ts:158`
- **build-tooling #1 — `server-only` poisoning** — enforce the server boundary in non-hashed Node-bound modules; kills the recurring tsc-invisible build break. 7/3/2, no flags, `package.json:31`
- **campaign-connector-store #4 — Sample data drift over time** — week-bucketed seed so re-syncs change and the change-diff/alerting demo comes alive. 7/3/2, no flags, `src/lib/campaigns/sample.ts:121`
- **campaign-model-prompts #2 — Alert on craters & spend spikes** — pass the change diff into `triage()` at both alert call sites. 7/3/2, no flags, `src/lib/campaigns/alerts.ts:80`
- **campaign-sync-api #2 — Unify manual + cron sync pipelines** — one `runTenantSync` helper; fixes the cron series-wipe bug as a side effect. 7/3/2, no flags, `src/app/api/campaigns/route.ts:139`
- **dashboard-kpis #3 — Goal attainment track record** — 6-month hit/miss strip under the pacing gauge from the 24-month history. 7/3/2, [CLIENT], `src/components/dashboard/GoalPacing.tsx:218`
- **design-system #3 — Branded og:image from tokens** — `next/og` card with the faceted "A" mark; first-impression fix for every share. 7/3/2, no flags, `src/app/layout.tsx:31`
- **format-helpers #1 — Sweep `toFixed` decimal-point leaks** — mechanical substitution to `fmtPct`/`fmtDecimal`/`fmtMultiple` at ~12 display sites (hashed analyze route excluded). 7/3/2, [CLIENT], `src/lib/images/attribution-types.ts:107`
- **home-app-shell #2 — Global error boundaries** — branded `error.tsx` + `global-error.tsx` with retry instead of the white crash screen. 7/3/2, [CLIENT], `src/app/layout.tsx:79`
- **llm-provider-wrapper #2 — Pre-flight AI health endpoint** — gate-free `/api/ai/health` + "demo mode ahead" pre-warning in panels. 7/3/2, [CLIENT], `src/lib/llm/claude.ts:44`
- **campaign-model-prompts #3 — Zero-return spenders as budget-move donors** — admit `no_conversions` campaigns as pause-first moves. 7/3/3, [CLIENT], `src/lib/campaigns/budget-moves.ts:41`

**Impact 7, effort 4**

- **build-tooling #5 — `npm run doctor` env preflight** — surface × status table mapping env vars to enabled product surfaces. 7/4/1, no flags, `.env.example:6-108`
- **article-content #2 — `table` block type** — semantic comparison tables for the buying guide + generated channel breakdowns. 7/4/2, no flags, `src/lib/article.ts:66`
- **design-system #2 — Button/CtaLink primitive** — end the 42×-copy-pasted CTA class string; showcase section included. 7/4/2, [CLIENT], `src/components/ui.tsx:39`
- **trend-channel #3 — Alert click → focus chart point** — clicking a feed alert switches metric, pins the crosshair at that date. 7/4/2, [CLIENT], `src/components/dashboard/DashboardClient.tsx:441`
- **build-tooling #4 — Key-free Playwright CI smoke lane** — the existing 5-spec suite finally runs somewhere automated. 7/4/3, no flags, `playwright.config.ts:26-31`
- **campaign-connector-store #5 — Sync all connected accounts** — cron fan-out over `listConnectedAccounts`, not just the active one. 7/4/3, no flags, `src/lib/campaigns/connection.ts:55`
- **format-helpers #2 — Locale-aware numbers in bilingual builders** — `createFormatters(locale)` in insights/meta so EN prose stops rendering "1 234 567 Kč". 7/4/3, [CLIENT], `src/lib/insights/aggregate.ts:56`

## Triage themes

All 100 ideas clustered into 12 themes by shared mental model.

| Theme | Count | Example ideas | Why it's a wave |
|---|---|---|---|
| 1. AI tool workbench UX — iterate, keep work, honest status/latency | 11 | ai-generation-api #1 #2 #3 #4, ai-tool-forms #1 #3 #4 #5, ai-workspace #3, llm-provider-wrapper #2 #4 | All land in the shared `useAiTool`/`primitives.tsx` seam + tool panels; one mental model: one-shot demo → iterative workbench. All [CLIENT], zero gate exposure. |
| 2. Cross-tool handoffs & one-click batch ops | 7 | ai-generation-api #5, ai-workspace #1, campaign-console #1 #4, campaign-sync-api #3, campaign-connector-store #5, trend-channel #3 | Every idea wires two existing features together (brief→ads, keywords→article, alert→chart, triage→batch-evaluate) — "N clicks → 1" with no new server logic. |
| 3. Data credibility — trust signals & demo realism | 11 | campaign-connector-store #1 #4, campaign-sync-api #1, trend-channel #2, dashboard-kpis #2 #4, article-content #3, dataset-seed #1 #2 #4 #5 | Two halves of one promise ("čísla vždy sedí"): label what the number really covers (stale/degraded/partial), and make the seeded demo data actually exercise the built machinery. |
| 4. Dashboard analytics depth — baselines, pacing, trends | 9 | metrics-engine #1 #2 #3 #4 #5, dashboard-kpis #1 #3, dataset-seed #3, trend-channel #1 | Pure-metrics-layer extensions surfaced as one more tile/line each. Contains two dup-pairs to build once: metrics-engine #1 ≈ dataset-seed #3 (YoY) and metrics-engine #2 ≈ dashboard-kpis #1 (required run-rate). |
| 5. Campaign console depth — funnel, budgets, history | 9 | campaign-connector-store #2 #3, campaign-console #2 #3 #5, campaign-model-prompts #3 #4 #5, campaign-sync-api #5 | Same page, same data model: expose already-computed metrics (funnel, triage reasons), add budget/series/history dimensions the store can carry. |
| 6. Alerting & proactive ops | 4 | campaign-model-prompts #2, campaign-sync-api #2 #4, llm-provider-wrapper #5 | Server-only wiring of existing alert/activity/digest machinery to events it currently misses (craters, score drops, manual syncs, AI spend). No [CLIENT], no [GATE]. |
| 7. Export, portability & content model | 6 | ai-tool-forms #2, article-content #2 #4, article-reading #2, format-helpers #4, trend-channel #4 | "Take this deliverable with you": CSV/Markdown surfaces built on existing pure serializers (`toCsv`/`downloadText`, block model). Dup-pair: article-reading #2 ≈ article-content #4 (one shared Markdown serializer). |
| 8. SEO, share cards & app-shell completeness | 8 | article-content #1 #5, design-system #3, home-app-shell #1 #2 #3 #4 #5 | The missing Next.js file conventions (og-image, not-found, error, robots, loading, manifest, sitemap lastModified) — each a small standalone file, near-zero regression surface. |
| 9. Design-system & helper adoption sweeps | 9 | design-system #1 #2 #5, format-helpers #1 #2 #3 #5, dashboard-kpis #5, nav-header-footer #2 | Promote the best existing primitive (Sparkline, Button, DeltaBadge, formatters) and mechanically retire its hand-rolled clones; includes the bilingual-gap fixes (locale-pinned numbers/labels). |
| 10. Reader journey, navigation & keyboard a11y | 11 | article-reading #1 #3 #4 #5, ai-workspace #2 #5, nav-header-footer #1 #3 #4 #5, trend-channel #5 | Getting around and resuming: TOC, deep links, resume chips, pager progress, ⌘K palette, keyboard chart/tablist. Mostly small client islands on server pages. |
| 11. Dev-tooling & quality gates | 11 | build-tooling #1 #2 #3 #4 #5, llm-test-gate #1 #2 #3 #4, ai-workspace #4, design-system #4 | Guards and one-command workflows: server-only boundary, seed drift, check:ci, e2e smoke, doctor, incremental gate, gate freshness, contrast guard, keyless e2e fixtures. Zero product-code risk. |
| 12. Gate-locked LLM batch | 4 | campaign-model-prompts #1, llm-provider-wrapper #1 #3, llm-test-gate #5 | The only ideas touching HASHED_FILES. Must be batched into one commit set so the ~340 s real-Claude gate runs once, not four times. |

## Suggested wave split

Nine waves, 58 of 100 ideas; each wave shares one mental model. Ordered by value density, with two pragmatic placements: the dev-tooling wave runs early (build-tooling #1 protects every later [CLIENT] wave; llm-test-gate #2 hardens the gate before Wave 9 pays for it), and the [GATE] wave runs last.

| Wave | Theme / ideas | Σ effort | Build/gate needs |
|---|---|---|---|
| **W1 — Data-trust & staleness signals** | campaign-connector-store #1, campaign-sync-api #1, trend-channel #2, dashboard-kpis #2 #4, article-content #3 (6 ideas) | 13 | [CLIENT] → full `next build`; no gate |
| **W2 — Dashboard analytics depth** | metrics-engine #1 + dataset-seed #3 (one YoY build), metrics-engine #2 + dashboard-kpis #1 (one run-rate build), dashboard-kpis #3, trend-channel #1, metrics-engine #3 (7 refs ≈ 5 builds) | 22 nominal (~15 after dup-merge) | [CLIENT] → full `next build` |
| **W3 — Shell & SEO completeness** | home-app-shell #1 #2 #3 #4 #5, design-system #3, nav-header-footer #1 (7 ideas) | 14 | [CLIENT] (error.tsx) → full `next build` |
| **W4 — Dev-tooling & gate hygiene** | build-tooling #1 #2 #3 #4 #5, llm-test-gate #1 #2 #3 (8 ideas) | 23 | no flags; verify build-tooling #1 with one full `next build`; no gate (all edits are to non-hashed scripts/config) |
| **W5 — Article & content surfaces** | article-reading #1, article-reading #2 + article-content #4 (one shared Markdown serializer), article-content #1 #2 #5 (6 refs ≈ 5 builds) | 17 nominal (~15) | [CLIENT] → full `next build` |
| **W6 — AI workbench iteration** | ai-generation-api #1 #2 #3, ai-tool-forms #1 #3, ai-workspace #3 (6 ideas) | 19 | [CLIENT] → full `next build`; all scoped to non-hashed files (ai-generation-api #2 explicitly defers the ads/brief/analysis hashed-tool extension to W9-or-later) |
| **W7 — Make the proactive machinery fire (demo realism + alert wiring)** | dataset-seed #1 #2, campaign-connector-store #4 #5, campaign-model-prompts #2, campaign-sync-api #2 #4, llm-provider-wrapper #5 (8 ideas) | 26 | unflagged/server-only — no `next build` strictly required (run one anyway as courtesy); re-run `npm run seed` + `seed:check`; no gate |
| **W8 — Cross-tool handoffs & batch ops** | ai-workspace #1 #2, ai-generation-api #5, campaign-console #1 #4, trend-channel #3 (6 ideas) | 23 | [CLIENT] → full `next build`; no gate (reuses existing endpoints only) |
| **W9 — Gate-locked LLM batch (dedicated, LAST)** | campaign-model-prompts #1, llm-provider-wrapper #1 #3, llm-test-gate #5 (4 ideas — ALL [GATE] ideas in the scan) | 18 | [GATE]: bundle every hashed-file edit into ONE commit (llm-provider-wrapper #1 and #3 share the `GenerateArgs`/provider plumbing; campaign-model-prompts #1's wiring rides along; llm-test-gate #5's `LLM_CAPTURE` flag seeds the sample corpus during the same proving run) → exactly one ~340 s real-Claude gate run |

**Leftovers (42 ideas, not in any wave).** Highest-value leftover cluster — a ready-made Wave 10: campaign console depth (campaign-connector-store #2 #3, campaign-console #2 #3 #5, campaign-model-prompts #3 #4 #5, campaign-sync-api #3 #5). The rest: design-system/helper sweeps (design-system #1 #2 #4 #5, format-helpers #1 #2 #3 #4 #5, dashboard-kpis #5, nav-header-footer #2), reader/keyboard tail (article-reading #3 #4 #5, ai-workspace #5, nav-header-footer #3 #4 #5, trend-channel #4 #5), AI status/latency (ai-generation-api #4, llm-provider-wrapper #2 #4 — natural W6 extension), ad-form polish (ai-tool-forms #2 #4 #5), demo-data remainder (dataset-seed #4 #5), testing/tooling remainder (ai-workspace #4, llm-test-gate #4). All are Impact ≤ 8 with no expiry; none is [GATE].

## How this scan was run

- **Agent**: Feature-Scout prompt from the Vibeman scanner registry, run 2026-07-02 as 20 parallel read-only subagents (dispatched in waves of ≤8), one per mapped context of `systedo-case`.
- **Output contract**: 5 ideas per context, top-5-by-value, each with Impact/Effort/Risk (N/10), Flags ([GATE]/[CLIENT]), Category, File anchor, Opportunity, Why valuable, Build sketch.
- **Counts verified**: 100 = 100 = 100 (per-report header sums / `## N.` headings / `**Impact**` bullets), 20 reports × 5 ideas.
- **Coverage**: ~250 source files read across the 20 scanners (context files listed in each report header, plus cross-references followed for flag verification — e.g. `scripts/llm-gate.mjs` HASHED_FILES membership was checked per idea).
- **Prior-scan dedup enforced** against `docs/harness/harness-learnings.md`, `docs/harness/ambiguity-business-scan-2026-06-25/`, and `docs/harness/feature-scout-2026-06-18/`: several reports explicitly note verified-fixed prior findings (campaign-connector-store, metrics-engine) and deliberately do NOT re-propose known deferred items (report/snapshot retention, config-driven demo engine, editable goals, dashboard narrative export, in-app telemetry dashboard, "prove Gemini in CI").
- **Gate model honored**: [GATE] = edits to the explicit HASHED_FILES list in `scripts/llm-gate.mjs` (≈340 s real-Claude pre-commit); [CLIENT] = edits to `"use client"` files, requiring a full `next build` per wave (harness learning: client/server build breaks are tsc-invisible).
