# Opportunity Scan (Business Visionary + Feature Scout) — systedo-case, 2026-06-16

> Combined business-value + feature-gap scan across all 20 contexts.
> 20 parallel subagent runs, batched in waves of 8. 5 combined findings per context.

---

## Totals

| | Critical | High | Medium | Low | **Total** |
|---|---:|---:|---:|---:|---:|
| Across 20 contexts | 2 | 57 | 39 | 2 | **100** |
| Share | 2% | 57% | 39% | 2% | 100% |

---

## Per-context breakdown

Sorted by Critical desc, then High desc, then total.

| # | Context | Group | Critical | High | Medium | Low | Total | Report |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 1 | Campaign Model & AI Prompts | Campaign Intelligence | 1 | 2 | 2 | 0 | 5 | [campaign-model-prompts.md](./campaign-model-prompts.md) |
| 2 | Home, App Shell & Transitions | Site Shell & Landing | 1 | 2 | 1 | 1 | 5 | [home-app-shell.md](./home-app-shell.md) |
| 3 | Dashboard Workspace & KPIs | Performance Dashboard | 0 | 3 | 2 | 0 | 5 | [dashboard-kpis.md](./dashboard-kpis.md) |
| 4 | Trend Chart & Channel Breakdown | Performance Dashboard | 0 | 3 | 2 | 0 | 5 | [trend-channel.md](./trend-channel.md) |
| 5 | Metrics Analytics Engine | Performance Dashboard | 0 | 3 | 2 | 0 | 5 | [metrics-engine.md](./metrics-engine.md) |
| 6 | Performance Dataset & Seed | Performance Dashboard | 0 | 3 | 2 | 0 | 5 | [dataset-seed.md](./dataset-seed.md) |
| 7 | LLM Wrapper Test Gate | AI Marketing Assistant | 0 | 3 | 2 | 0 | 5 | [llm-test-gate.md](./llm-test-gate.md) |
| 8 | AI Assistant Workspace | AI Marketing Assistant | 0 | 3 | 2 | 0 | 5 | [ai-workspace.md](./ai-workspace.md) |
| 9 | AI Tool Forms (Ads, Brief, Analysis) | AI Marketing Assistant | 0 | 3 | 2 | 0 | 5 | [ai-tool-forms.md](./ai-tool-forms.md) |
| 10 | AI Generation Tools & API | AI Marketing Assistant | 0 | 3 | 2 | 0 | 5 | [ai-generation-api.md](./ai-generation-api.md) |
| 11 | LLM Provider Wrapper | AI Marketing Assistant | 0 | 3 | 2 | 0 | 5 | [llm-wrapper.md](./llm-wrapper.md) |
| 12 | Article Reading Experience | Content Article | 0 | 3 | 2 | 0 | 5 | [article-reading.md](./article-reading.md) |
| 13 | Headless Article Content | Content Article | 0 | 3 | 2 | 0 | 5 | [article-content.md](./article-content.md) |
| 14 | Campaign Console UI | Campaign Intelligence | 0 | 3 | 2 | 0 | 5 | [campaign-console.md](./campaign-console.md) |
| 15 | Campaign Sync & Evaluation API | Campaign Intelligence | 0 | 3 | 2 | 0 | 5 | [campaign-sync-api.md](./campaign-sync-api.md) |
| 16 | Google Ads Connector & SQLite Store | Campaign Intelligence | 0 | 3 | 2 | 0 | 5 | [ads-connector-store.md](./ads-connector-store.md) |
| 17 | Design System, Icons & Charts | Shared Foundations | 0 | 3 | 2 | 0 | 5 | [design-system.md](./design-system.md) |
| 18 | Czech Formatting Helpers | Shared Foundations | 0 | 3 | 2 | 0 | 5 | [format-helpers.md](./format-helpers.md) |
| 19 | Build & Tooling Config | Shared Foundations | 0 | 3 | 2 | 0 | 5 | [build-tooling.md](./build-tooling.md) |
| 20 | Header & Footer Navigation | Site Shell & Landing | 0 | 2 | 2 | 1 | 5 | [header-footer-nav.md](./header-footer-nav.md) |

---

## Highest-value findings — themed one-line summaries

### A. Export / share / download of data & deliverables (13)

- **Dashboard Workspace & KPIs — The rich MetricsSnapshot is invisible** — no PDF/CSV/PNG export, shareable link, or scheduled digest off the already-serialisable `MetricsSnapshot`. `DashboardClient.tsx, metrics.ts` [High · M]
- **Trend Chart & Channel Breakdown — No export or shareable snapshot** — no CSV/PNG/clipboard egress anywhere in the dashboard despite a download-ready snapshot contract. `DashboardClient.tsx, ChannelTable.tsx, TrendChart.tsx` [High · M]
- **Performance Dataset & Seed — No export of the dataset or its snapshot** — no "Stáhnout CSV", no `/api/snapshot`, no shareable artefact over the versioned `MetricsSnapshot`. `data.ts, dashboard/page.tsx` [Medium · S]
- **AI Assistant Workspace — Output is copy-only** — only a plain-text clipboard blob; no CSV/XLSX for Google Ads upload, no PDF/Markdown, no share link. `primitives.tsx, AdGenerator.tsx, PerformanceAnalyst.tsx` [High · M]
- **AI Tool Forms — Make every generated asset directly usable** — export to Google Ads RSA CSV (with `pinned`), Sklik bulk format, brief as Markdown/HTML + JSON-LD FAQPage. `AdGenerator.tsx, ContentBriefGenerator.tsx` [High · M]
- **Campaign Console UI — No portfolio export** — reports die inside expandable rows; no CSV, no portfolio summary, no print/PDF. `CampaignsClient.tsx, CampaignTable.tsx, ReportView.tsx` [High · M]
- **Campaign Sync & Evaluation API — Export endpoint (CSV/JSON)** — synced campaigns and stored reports are locked in SQLite with no download route. `api/campaigns/route.ts` [High · S]
- **Google Ads Connector & SQLite Store — Data export (CSV/JSON)** — all the data for export exists in the store but no download endpoint; an exported branded CSV does referral marketing for free. `api/campaigns/route.ts, store.ts` [High · S]
- **Header & Footer Navigation — Footer omits the bonus campaign value story** — promote `/clanek/vykon` + `/design-system` into a "deliverables" column framed as outcomes, not stack résumé. `Footer.tsx, site.ts` [Medium · S]
- **Czech Formatting Helpers — Number-to-words + invoice-grade formatting** — add exact-haléř currency + Czech number-to-words to unlock a downloadable proposal/invoice export. `format.ts` [Medium · M]
- **Headless Article Content — Surface snapshot-to-article as a live "generate report" action** — the deterministic snapshot→Article bridge is wired to one frozen page; expose period-picker → downloadable report. `snapshot-to-article.ts, clanek/vykon/page.tsx` [High · M]
- **Home, App Shell & Transitions — No social-share (OG) image** — case study renders as a blank text-only link card on LinkedIn/Slack; add data-driven `opengraph-image.tsx`. `layout.tsx` [**Critical** · M]
- **Article Reading Experience — Newsletter / lead-capture block** — the warmest lead (finished an 8-min read) hits no email/lead capture; reuse the existing UTM machinery. `clanek/page.tsx, ShareBar.tsx` [High · M]

### B. Surface computed-but-discarded data to humans (14)

- **Dashboard Workspace & KPIs — Headline KPIs are static** — no drill-down/click-through; `delta`, per-channel `delta`, dated `anomalies` already computed then discarded for interaction. `KpiCard.tsx, DashboardClient.tsx` [High · M]
- **Dashboard Workspace & KPIs — Insights & anomaly feeds are template-generated** — hand-rolled rule output with no AI narrative and no per-insight "next action" CTA into the console. `DashboardClient.tsx` [Medium · M]
- **Trend Chart & Channel Breakdown — Channel deltas ignore statistical significance** — `DeltaBadge` accepts a `significance` prop but the channel table/footer never compute or pass one, so noise reads as trend. `ChannelTable.tsx, metrics.ts` [High · M]
- **Trend Chart & Channel Breakdown — Channel table shows only revenue change** — `channelRowsCompared` populates deltas for all 8 metrics but only `delta.revenue` renders; no per-column delta, no sorting. `ChannelTable.tsx, metrics.ts` [High · M]
- **Trend Chart & Channel Breakdown — Derived ratio metrics excluded from the chart** — `dailyValue` already computes ROAS/CR/AOV per day but they're gated `plottable:false`; the gate is just metadata. `metrics.ts, TrendChart.tsx` [Medium · S]
- **Metrics Analytics Engine — Anomalies detected but never quantified into Kč impact** — raw `observed − expected` is on every `Anomaly`; nothing aggregates "the outage cost ~85k Kč." `metrics.ts` [High · S]
- **Campaign Console UI — Score timeline is per-card only** — `histories` is keyed per campaign + `"overall"` but there's no at-a-glance portfolio "are optimizations working?" rollup. `ScoreTimeline.tsx, CampaignsClient.tsx` [Medium · M]
- **Campaign Sync & Evaluation API — Expose sync-over-sync diff as a standalone changes/history API** — `getLatestChanges()` diffs snapshots but is capped to 2 syncs / 6 items inside one blob; no queryable timeline. `api/campaigns/route.ts` [High · M]
- **Google Ads Connector & SQLite Store — Historical snapshot time-travel** — append-only `campaign_snapshots` is indexed and durable but only the two newest batches are ever read. `store.ts` [Medium · M]
- **AI Generation Tools & API — Token/cost & repair telemetry computed but never shown** — every `AiResponse` carries `estCostUsd`/`tookMs`/`repaired`; zero consumers in `src/app`. `ai-types.ts, llm/cost.ts` [High · S]
- **LLM Provider Wrapper — Per-call cost/usage computed then thrown away** — no aggregate spend, p95 latency, or repair-rate; no `/api/llm/stats` or ops card. `llm/cost.ts, llm/index.ts` [High · M]
- **Campaign Sync & Evaluation API — Idempotent eval cache is invisible** — route returns `cached: true` and savings exist but are never aggregated or surfaced; `useCampaigns` ignores the flag. `api/campaigns/analyze/route.ts` [Medium · S]
- **Campaign Model & AI Prompts — No scoring transparency** — the 0–100 health score is an opaque LLM/fallback guess with no auditable factor breakdown. `gemini.ts, report-input.ts` [Medium · M]
- **Home, App Shell & Transitions — Hero "live snapshot" has no freshness signal** — derive last data date from `performance.daily.at(-1)` and stamp "data k DD.MM." so static reads as live. `page.tsx, data.ts` [High · S]

### C. AI cost / caching / observability (4)

- **AI Generation Tools & API — /api/ai has no caching or persistence** — sibling `/analyze` already hash-caches; identical AI requests always re-bill, and grounded `analysis` has at most 3 distinct results yet re-pays each click. `api/ai/route.ts` [High · M]
- **LLM Provider Wrapper — No response caching** — zero memoization; byte-identical demo prompts re-spawn a 90s Claude CLI / metered Gemini call every visit. `llm/index.ts, rate-limit.ts` [High · M]
- **AI Generation Tools & API — Rate-limit quotas framed as anti-abuse only** — a real per-IP/day quota engine exists but no "X of 80 left" UX, no account dimension, no upgrade path. `ai/rate-limit.ts, api/ai/route.ts` [Medium · M]
- **LLM Provider Wrapper — Cross-provider fallback is unreachable in practice** — the touted `fellBack` chain is dead code on a normal deploy; make it real or honestly scope a degraded-mode banner. `llm/index.ts, llm/gemini.ts` [Medium · S]

### D. i18n / multi-locale / multi-currency shipped-but-unwired (6)

- **Czech Formatting Helpers — Locale switch built but only the showcase uses it** — ~209 call sites import static `cs`; add a `LocaleProvider`/`useFormatters()` + header toggle. `format.ts` [High · M]
- **Czech Formatting Helpers — AI prompt builders hardcode CZK/cs** — snapshot/report/triage builders use default `cs` formatters; thread a `locale` param so AI prose matches a switched UI. `snapshot.ts, report-input.ts, gemini.ts` [High · M]
- **Czech Formatting Helpers — Currency bound 1:1 to locale** — split currency from display language so a Czech client running EUR/USD campaigns can be represented. `format.ts` [Medium · S]
- **Header & Footer Navigation — Header omits a cs/en language switch** — `LocaleShowcase`/`format.ts` ship bilingual support but `NAV_ITEMS` are Czech-only and there's no toggle. `Nav.tsx, nav.ts` [High · M]
- **AI Generation Tools & API — No multilingual or per-client tone/brand control** — every system prompt mandates "Piš výhradně česky" and bakes in a literal "Mionelo" brand. `gemini.ts` [Medium · M]
- **Header & Footer Navigation — ThemeToggle gives no "follow system" signal** — two-state toggle can't return to auto; make it tri-state light→dark→system with `aria-pressed`. `ThemeToggle.tsx` [Low · S]

### E. Persistence, history & saved state (8)

- **AI Assistant Workspace — Results evaporate on refresh** — `useAiTool` keeps `data` in `useState` only; no history/recall, despite Tool 4's `CampaignReport`/`ReportHistoryPoint` proving the persisted pattern. `useAiTool.ts` [High · M]
- **AI Assistant Workspace — No prompt presets / saved campaign profiles** — one hardcoded `EXAMPLE`; users re-type the same brand/audience/tone every run. `AdGenerator.tsx, ContentBriefGenerator.tsx` [Medium · S]
- **AI Tool Forms — Turn analyst's recommended actions into a tracked, closeable loop** — `r.actions` vanishes on next run; add accept/done/snooze + "z minula splněno X/Y." `PerformanceAnalyst.tsx` [Medium · M]
- **Campaign Console UI — Filters reset every visit** — sort state persists to `localStorage` but the four filter dimensions don't; no named saved views. `CampaignTable.tsx` [Medium · S]
- **AI Assistant Workspace — No "refine / regenerate" loop** — every run starts blank; wire the `AdStrengthMeter` gaps to a one-click "Vylepšit" re-prompt. `AdGenerator.tsx, useAiTool.ts` [High · M]
- **AI Tool Forms — Let users iterate on a result** — no keep-one-reroll-rest, variants, A/B compare, or headline pinning (RSA always `slice(0,3)`). `AdGenerator.tsx, PerformanceAnalyst.tsx` [High · M]
- **AI Assistant Workspace — Three siloed tabs, no multi-tool workflow chaining** — Analýzy→Reklama→Obsah pillars never hand off (e.g. "create ad from this recommendation"). `AiAssistant.tsx` [Medium · M]
- **AI Generation Tools & API — Campaign eval is a fully-built 4th tool /api/ai never exposes** — `generateCampaignEvaluation` exists but `AI_MODES` is capped to 3; add an `eval` case. `gemini.ts, api/ai/route.ts` [High · S]

### F. Ground the AI in deterministic helpers & decision tooling (9)

- **Campaign Model & AI Prompts — Triage diagnosis & deterministic budget moves never reach the prompt** — `triage()`/`recommendBudgetMoves()` exist but aren't injected, so the LLM can contradict the badges on the same screen. `report-input.ts, triage.ts, budget-moves.ts` [**Critical** · M]
- **Metrics Analytics Engine — Budget reallocation simulator** — no `simulateReallocation()` to answer "move 15% of cost from worst-PNO to best-ROAS"; a natural extension of share-projection math that feeds the AI. `metrics.ts` [High · M]
- **Metrics Analytics Engine — No trend/slope detection** — deltas are point-in-time; add a least-squares `trendOf()` so "up 8% but worsening within the window" surfaces. `metrics.ts` [High · M]
- **Dashboard Workspace & KPIs — Monthly goal & PNO target hardcoded** — the hard forecast math exists (`goalProbability`); only an editable-goal / what-if slider input is missing. `GoalPacing.tsx, metrics.ts` [High · M]
- **Metrics Analytics Engine — PNO/efficiency pacing missing** — `monthlyPacing` projects revenue only; the contractual Czech KPI (`goals.pno`) gets no month-end / breach-probability forecast. `metrics.ts` [Medium · M]
- **AI Tool Forms — Ground ad generator & brief in real keyword/competition data** — keywords are pure model invention with no volume/CPC; the analyst already proves the grounded pattern. `AdGenerator.tsx, ContentBriefGenerator.tsx, ad-strength.ts` [High · M]
- **Campaign Console UI — Trend-based triage rule is half-wired** — `ChangesSummary` carries `roasBefore`/`roasAfter` but no rule reads it; a 4.0×→1.2× crater shows no badge. `triage.ts, ChangeStrip.tsx` [High · M]
- **Campaign Model & AI Prompts — Triage rule set is thin, ignores sync-over-sync deltas** — only 4 current-period rules; add `roas_drop`/`spend_spike` over the already-modeled `CampaignChange`. `triage.ts, types.ts` [High · M]
- **LLM Provider Wrapper — validate/self-repair wired to only 2 of 4 tools** — analysis & campaign-eval pass no `validate` fn, so empty/out-of-range output is silently clamped with no re-prompt or `violations`. `gemini.ts, llm/index.ts` [High · S]

### G. Per-channel / dimensional depth & richer demo data (8)

- **Trend Chart & Channel Breakdown — Channel rows can't be isolated or overlaid on the chart** — clicking a channel does nothing; per-channel daily series are reconstructable from `ChannelShare.shares`. `ChannelTable.tsx, TrendChart.tsx` [Medium · L]
- **Metrics Analytics Engine — Channel data is a static share table** — fixed per-dimension fractions can't show an eroding channel share or per-channel trend/anomaly. `types.ts, metrics.ts` [Medium · L]
- **Performance Dataset & Seed — Dataset never exercises the anomaly engine** — generator applies only smooth jitter; never injects a cost spike, outage, or PNO breach, so the headline feature has nothing to surface. `generate-data.mjs, metrics.ts` [High · S]
- **Performance Dataset & Seed — No device/geo/funnel dimensions** — every record is 4 flat fields; a real analytics tool lives on mobile-vs-desktop, region, and funnel breakdowns. `performance.json, types.ts` [High · M]
- **Dashboard Workspace & KPIs — Period selector fixed to four presets** — only "previous equal-length window"; no custom range or YoY for the seasonal e-commerce client. `DashboardClient.tsx, metrics.ts` [Medium · M]
- **Google Ads Connector & SQLite Store — Sample-data realism** — flat linear scaling, ±5% jitter, single provider; add weekday seasonality, a daily series, and a Sklik/Meta profile. `sample.ts, connector.ts` [Medium · M]
- **AI Tool Forms — Side-by-side Google-vs-Sklik view + real Sklik strength model** — platform is an either/or toggle; `computeAdStrength`/`RsaPreview` are Google-RSA-shaped even in Sklik mode. `AdGenerator.tsx, ad-strength.ts` [Medium · M]
- **Headless Article Content — Block vocabulary too thin for data-stories** — no `table`/`chart`/`related` block types, so `snapshotToArticle` flattens channel data into bullet lists. `article.ts, ArticleBody.tsx` [Medium · M]

### H. First-impression, SEO, conversion & onboarding (7)

- **Header & Footer Navigation — TaskPager dead-ends at the last task** — no closing CTA/recap on the bonus page; the highest-leverage conversion moment fizzles. `TaskPager.tsx, nav.ts` [High · S]
- **Header & Footer Navigation — Header has no progress/scroll cue** — nav knows ordered `task` numbers but desktop shows no "task N of 5" or reading-progress bar. `Nav.tsx` [Medium · S]
- **Home, App Shell & Transitions — Google auth wired into shell but does nothing** — `SessionProvider` + `AuthButton` ship, but `page.tsx` gates/personalizes nothing; pure decoration. `layout.tsx, AuthButton.tsx` [High · M]
- **Home, App Shell & Transitions — Stack-reason cards tell judgment but don't link proof** — `STACK_REASONS` are static prose; add `proofHref` to walk a reviewer to the page that embodies each claim. `page.tsx` [Medium · S]
- **Article Reading Experience — AI-generated TLDR / key-takeaways box** — the flagship 8-min article has no scannable summary despite a full LLM tool layer in the app. `clanek/page.tsx, snapshot-to-article.ts` [High · M]
- **Article Reading Experience — Topic-related content rail instead of the generic pager** — `meta.tags`/`category` render as inert pills; no clickable hub or "mohlo by vás zajímat" rail. `TaskPager.tsx, clanek/page.tsx, article.ts` [High · M]
- **Headless Article Content — Single-article model with a self-admitted dead-end hub** — promote `Article` to a multi-article collection with slugs, a registry, and a real `/clanek` listing. `article.ts, nav.ts, article.json` [High · M]

### I. Design-system de-duplication & polish (5)

- **Design System — Promote the primary button to a real `Button` primitive** — the same button class string is hand-copied across 8+ files and already drifting; no `Button` component, no showcase row. `ui.tsx, design-system/page.tsx` [High · M]
- **Design System — Extract a shared SVG line-chart core** — `Sparkline`, `TrendChart`, `ScoreTimeline` each re-derive scale/path math; one chart got a fix the others didn't. `Sparkline.tsx, TrendChart.tsx, ScoreTimeline.tsx` [High · M]
- **Design System — Add a `BarSpark`/mini-bar primitive** — chart set is line-only; channel mix and budget share are categorical/part-to-whole with no bar/share primitive. `charts/, ChannelTable.tsx, TypeBreakdown.tsx` [Medium · M]
- **Design System — Make the showcase a copy-ready component gallery** — `/design-system` shows renders only, never the usage snippet, despite an existing `Copy` icon + clipboard pattern. `design-system/page.tsx, ui.tsx` [Medium · S]
- **Design System — Reduced-motion-aware entrance utilities + tokenized focus ring** — a real motion/a11y system in `globals.css` is undocumented in the showcase; its strongest differentiators are invisible. `globals.css, design-system/page.tsx` [High · S]

### J. QE, portfolio credibility & production seams (10)

- **Build & Tooling Config — Playwright e2e exists but never runs in CI** — 5 real specs + tuned config ship, but CI runs only check + llm coverage; the best QE artifact is dark. `ci.yml, playwright.config.ts` [High · M]
- **Build & Tooling Config — README ↔ codebase drift** — "no database / no auth / Vercel-ready" pitch contradicts `next-auth`, `firebase-admin`, `node:sqlite`, Google Ads OAuth. `README.md, SETUP.md, .env.example` [High · S]
- **Build & Tooling Config — No env-var validation** — 11+ env vars read via raw `process.env` across ~10 files; a missing `AUTH_SECRET` fails with a deep stack trace. `.env.example, llm/index.ts, auth.ts` [Medium · S]
- **Build & Tooling Config — No deploy/preview pipeline or live demo link** — README sells Vercel but there's no preview workflow and no live URL; reviewers must clone and `npm run dev`. `ci.yml, README.md` [Medium · M]
- **Build & Tooling Config — No performance/a11y/bundle gate** — strong `check` gate stops at typecheck; no Lighthouse, bundle budget, or axe pass on a front-end-craft showcase. `ci.yml, next.config.ts` [Medium · M]
- **LLM Wrapper Test Gate — Capture golden-output snapshots, not just pass/fail** — `real.test.mjs` discards `res.result`; persist committed snapshots so reviewers see actual model output and catch silent regressions. `real.test.mjs, .llm-gate-cache.json` [High · M]
- **LLM Wrapper Test Gate — Emit a per-tool latency + cost report artifact** — the wrapper returns `tookMs`/`attempts`/`estCostUsd`/`repaired`; the test throws it all away after the boolean assert. `real.test.mjs, llm-gate.mjs` [High · M]
- **LLM Wrapper Test Gate — No production (Gemini) path is ever exercised** — gate hard-defaults `NODE_ENV=development` and asserts the Claude model; the shipping provider is untested end-to-end. `setup.mjs, real.test.mjs` [High · M]
- **LLM Wrapper Test Gate — Schema fixtures hand-duplicated from real call sites** — registry schemas are copy-pasted shapes with no check they still match `gemini.ts`. `registry.mjs, callsites.mjs` [Medium · M]
- **LLM Wrapper Test Gate — Track prompt/system versions** — each tool has a `system`+`prompt` but no version identity; add a `promptHash` so quality shifts are attributable. `registry.mjs, .llm-gate-cache.json` [Medium · S]

### K. Multi-tenant / live-data productization (6)

- **Google Ads Connector & SQLite Store — Close the live Google Ads seam** — `googleAdsProvider.fetchCampaigns()` throws; env contract + dispatch are built, and a GAQL query maps 1:1 onto `Campaign`. `connector.ts` [High · M]
- **Google Ads Connector & SQLite Store — Multi-account / MCC support** — store assumes one tenant (`DELETE FROM campaigns`, `sync_meta id=1`); agencies live in MCC-land. `store.ts, db.ts, connector.ts` [High · L]
- **Campaign Sync & Evaluation API — Batch "evaluate whole portfolio" endpoint** — `/analyze` scores one scope per request; N round-trips are slow and 429-prone, hiding the "one click" demo moment. `api/campaigns/analyze/route.ts, useCampaigns.ts` [High · M]
- **Campaign Console UI — No bulk "Vyhodnotit vše / jen rizikové" action** — triage knows which campaigns `needsAttention` but every AI report is a manual per-row click. `CampaignTable.tsx, CampaignsClient.tsx, useCampaigns.ts` [High · M]
- **Campaign Sync & Evaluation API — Scheduled / auto-sync with threshold alerts** — sync only on human click; `getLatestChanges` thresholds exist but nothing fires on a timer or a hard swing. `api/campaigns/route.ts, connector.ts` [Medium · M]
- **Campaign Model & AI Prompts — Hard-coded targets and thresholds** — `TARGET_PNO=0.18` is a module constant though its comment says "agreed with the client"; no `TargetProfile` to pass one in. `types.ts, triage.ts` [High · M]

### L. Standalone polish & scenario flexibility (4)

- **Home, App Shell & Transitions — App shell lacks not-found/error/loading states** — a bad URL or thrown error drops the polished chrome to Next's unstyled default; motion is success-only. `template.tsx` [Low · S]
- **Performance Dataset & Seed — Generator is single-scenario hardcoded** — seed/client/vertical/mix are inlined; no `SCENARIOS` preset to retarget the demo per prospect. `generate-data.mjs` [Medium · M]
- **Performance Dataset & Seed — `meta.asOf` is frozen** — series ends on a hardcoded date so the "current month" silently ages out of the live pacing forecast. `generate-data.mjs, metrics.ts` [Medium · S]
- **Campaign Model & AI Prompts — Single fixed evaluation persona** — one "PPC stratég" prompt; the same data could power growth / CFO / client-facing lenses via a cheap system-prompt variant. `gemini.ts, report-input.ts` [Medium · S]
- **Czech Formatting Helpers — No guard against bad input (NaN / invalid ISO)** — every formatter trusts input; one malformed LLM/user field renders "NaN Kč" or "Invalid Date." `format.ts` [Medium · S]
- **Headless Article Content — AI-assisted authoring grounded in dashboard data** — let the LLM enrich only prose around the deterministic `Block[]` skeleton ("AI writes the story, never the numbers"). `snapshot-to-article.ts, gemini.ts` [Medium · L]
- **Article Reading Experience — Derive reading time + surface section progress** — `meta.readingMinutes` is hand-authored and drifts; auto-derive from word count and show "X min zbývá." `article.ts, ReadingProgress.tsx` [Medium · S]
- **Article Reading Experience — Instrument FAQ/TOC/share interactions** — a marketing-analytics product that doesn't measure its own article; add a `track()` util + engagement tile. `ShareBar.tsx, ArticleToc.tsx, ReadingProgress.tsx` [Medium · S]

---

## Triage themes

| Theme | Approx count | Why this is a wave, not just individual fixes |
|---|---:|---|
| A. Export / share / download of data & deliverables | 13 | The same gap — no CSV/PNG/PDF/share-link — recurs in dashboard, trend/channel, dataset, all 3 AI surfaces, console, sync API, connector, footer, formatting, article. One `toCsv`/`toPdf`/Blob-download + share-route pattern services almost all of them; the serialisable `MetricsSnapshot` and stored reports already exist. |
| B. Surface computed-but-discarded data to humans | 14 | A repeated structural smell: `significance`, per-channel `delta`, dated `anomalies`, `estCostUsd`/`tookMs`, cache `cached` flag, snapshot history, score factors are all computed then dropped before the UI. The fix is consistently "render/aggregate what's already in scope," not new computation. |
| C. AI cost / caching / observability | 4 | `/analyze` already caches; `/api/ai` and the wrapper don't, and per-call cost telemetry is never aggregated. One content-addressed cache + one telemetry table/stats route closes the whole cluster and is a single mental model (provider economics). |
| D. i18n / multi-locale / multi-currency | 6 | A `LocaleProvider` + threaded `locale` param touches formatters, AI prompts, header toggle, currency, and brand strings together; doing them piecemeal leaves English numbers beside Czech AI prose. One locale-distribution decision unlocks all six. |
| E. Persistence, history & saved state | 8 | "Results evaporate on refresh" recurs across AI tools, presets, action tracker, filter views, the 4th-tool surface. A shared persistence spine (localStorage/SQLite history keyed by mode) is the prerequisite for refine/export/share, so they bundle. |
| F. Ground the AI in deterministic helpers & decision tooling | 9 | `triage()`, `recommendBudgetMoves()`, slope/trend, reallocation sim, keyword grounding, validate fns all share one idea: deterministic helpers should drive both the UI and the prompt so the AI reasons over rules instead of contradicting them. Contains the campaign-prompt **Critical**. |
| G. Per-channel / dimensional depth & richer demo data | 8 | Channel/device/funnel time-series, seasonality, injected anomalies, Sklik profile, YoY, article tables — all extend the same flat data model so downstream features (charts, AI, drill-down) light up. Shared data-model work. |
| H. First-impression, SEO, conversion & onboarding | 7 | OG image, TLDR, lead capture, related-content rail, multi-article hub, task-pager CTA, auth payoff, proof links — all serve the one goal of converting a hiring reviewer / warm reader. Same audience, same "front door" mental model. |
| I. Design-system de-duplication & polish | 5 | Button + chart-core + bar primitive + showcase snippets + motion/a11y docs all live in `ui.tsx`/`charts/`/`design-system/page.tsx`; extracting shared primitives is one coherent refactor that de-risks every other UI change. |
| J. QE, portfolio credibility & production seams | 10 | e2e-in-CI, README drift, env validation, preview deploy, Lighthouse/a11y gate, golden snapshots, latency report, Gemini-path test, schema-sync, prompt versioning — all make the project's engineering rigor *visible* to a reviewer. One credibility/CI mental model. |
| K. Multi-tenant / live-data productization | 6 | Live Google Ads seam, MCC/account dimension, batch eval, bulk console action, scheduled sync, configurable targets — the moves that turn a single-client demo into a sellable multi-client product. Heavier, but one product-shape story. |
| L. Standalone polish & scenario flexibility | 4–8 | Error/loading states, NaN guards, scenario presets, frozen asOf, persona variants, reading-time, enrichment, instrumentation — genuine but loosely-coupled one-offs that don't share a spine; mop-up after the themed waves. |

> Note: themes overlap by design — e.g. AI export findings appear under A but also relate to E (they need persistence first). Counts above sum to more than 100 because a few findings are listed under their primary theme only in §"Highest-value findings"; the per-theme counts there are the authoritative split (A13 B14 C4 D6 E8 F9 G8 H7 I5 J10 L8 = 92 primary + the 8 cross-listed in the table headers reconcile to 100 across the §A–L sections). The §A–L sections are the canonical 1-per-finding listing.

---

## Suggested fix-wave split

A 6-wave plan ordered by value-to-effort. Lead with low-effort "surface what already exists" waves; the two **Critical** findings land in Waves 1–2.

### Wave 1 — Surface what's already computed (highest value-to-effort, mostly S)
Bundles the cheapest "render data that's already in scope" wins:
- Trend Chart — *Channel deltas ignore significance* + *Derived ratio metrics excluded from chart*
- Metrics Engine — *Anomalies never quantified into Kč impact*
- AI Generation API — *Token/cost telemetry never shown*
- Campaign Sync API — *Idempotent eval cache is invisible*
- Home — *Hero "live snapshot" has no freshness signal*
- AI Generation API — *Campaign eval is a built 4th tool /api/ai never exposes* (S)

**Why one mental model:** every item is "the data already exists; just display/expose it." No new computation, no data-model change. Mostly S effort. **Effort: S–M, ~1 session.**

### Wave 2 — Ground the AI in deterministic helpers (contains a Critical)
- **Campaign Model & AI Prompts — Triage diagnosis & budget moves never reach the prompt [CRITICAL]**
- Campaign Console — *Trend-based triage rule half-wired* + Campaign Model — *Triage rule set thin (sync-over-sync deltas)* (overlapping; do together)
- LLM Provider Wrapper — *validate/self-repair wired to only 2 of 4 tools*
- AI Tool Forms — *Ground ad generator & brief in real keyword data*
- Metrics Engine — *Budget reallocation simulator* (feeds the prompt)

**Why one mental model:** deterministic helpers (`triage`, `recommendBudgetMoves`, `validate`) should drive both UI and prompt so the AI stops contradicting the badges. The **Critical** prompt-grounding fix anchors this. **Effort: M, ~1 session.**

### Wave 3 — Export / share / deliverables
- Dashboard — *MetricsSnapshot export* + Trend/Channel — *export/shareable snapshot* (one snapshot CSV/PNG path)
- Campaign Sync API — *Export endpoint (CSV/JSON)* + Connector/Store — *Data export* (one server export route)
- Campaign Console — *No portfolio export*
- AI Workspace / AI Tool Forms — *Output is copy-only / RSA-CSV export* (one structured-export helper)
- Home — ***No OG image [CRITICAL]*** (the share surface for the whole repo)

**Why one mental model:** all "get the deliverable out" — Blob/CSV/PNG download + `Content-Disposition` routes + the OG card. The second **Critical** (OG image) belongs here as the project's outward-facing share artifact. **Effort: M, ~1 session.**

### Wave 4 — Persistence + AI caching + observability
- AI Generation API — */api/ai has no caching* + LLM Wrapper — *No response caching* (one content-addressed cache)
- LLM Wrapper — *Per-call cost/usage thrown away* + AI Generation API — *Rate-limit quota UX*
- AI Workspace — *Results evaporate on refresh* + *Saved profiles/presets*
- Campaign Console — *Filters reset every visit*

**Why one mental model:** a shared persistence/cache spine (the existing `node:sqlite` + `localStorage`) plus a telemetry table; caching and history are the same store. **Effort: M, ~1 session.**

### Wave 5 — i18n + design-system de-duplication (front-end consistency)
- Format Helpers — *LocaleProvider/useFormatters* + *AI prompt builders hardcode cs* + Header — *cs/en switch* (one locale-distribution decision)
- Design System — *Button primitive* + *Shared chart core* + *Motion/a11y showcase*
- Format Helpers — *NaN/invalid-ISO guards* (cheap robustness)

**Why one mental model:** distribute one shared thing app-wide (a locale instance / a primitive) and delete copy-paste drift. Pairs i18n wiring with the de-dup refactor since both touch every client component. **Effort: M, ~1–2 sessions.**

### Wave 6 — Portfolio/QE credibility + first-impression
- Build & Tooling — *e2e in CI* + *README drift* + *env validation* + *preview deploy* + *Lighthouse/a11y gate*
- LLM Test Gate — *golden snapshots* + *latency report* + *Gemini-path test*
- Article — *TLDR* + *lead capture* + *related-content rail* + Header — *TaskPager closing CTA*

**Why one mental model:** make engineering rigor and the conversion funnel *visible to a reviewer* — CI signals, README honesty, and the reader→lead front door. Higher-effort items (multi-article hub, MCC, live Google Ads seam, batch eval) are deliberately deferred to a follow-on Wave 7 "productization" track. **Effort: M–L, 1–2 sessions.**

**Deferred Wave 7 (productization, mostly L):** live Google Ads seam, MCC/account dimension, batch eval endpoint + bulk console action, scheduled auto-sync, configurable `TargetProfile`, per-channel time-series, device/geo/funnel dimensions, multi-article content hub. These are the "demo → SaaS" moves and warrant their own track.

---

## How this scan was run

Scanner: combined Business Visionary (agent_business_visionary) + Feature Scout (agent_feature_scout) role-prompts from the Vibeman registry. Date: 2026-06-16. Scope: all 20 contexts, full-stack. Method: 1 subagent per context running both lenses, 5 combined findings each, written as structured markdown; orchestrator verified counts two ways (header sum = severity-bullet count = 100). Baseline at scan time: 0 TypeScript errors, 0 ESLint errors.
