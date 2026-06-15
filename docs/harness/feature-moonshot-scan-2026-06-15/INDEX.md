# Feature Scout 🔍 + Moonshot Architect 🌙 Scan — systedo-case, 2026-06-15

> Opportunity scan of the whole app: every context analysed through two lenses at once —
> Feature Scout (grounded near-term extensions) + Moonshot Architect (10x transformative bets).
> 20 parallel subagent runs, batched in 3 waves of ≤8. Combined target: 5 findings per context.

These are **opportunities**, not bugs. "Severity" = value tier, not breakage:
Critical = transformative / near-essential · High = clearly worth building · Medium = solid nice-to-have.

---

## Totals

| | Critical | High | Medium | Low | **Total** |
|---|---:|---:|---:|---:|---:|
| Across 20 contexts | 21 | 54 | 25 | 0 | **100** |
| Share | 21% | 54% | 25% | 0% | 100% |

Lens split: **62 Feature Scout · 38 Moonshot Architect**.
Effort (where stated): ~12 S (<1d) · ~45 M (1–3d) · ~28 L (>3d) — most criticals are L moonshots.

Notable: nearly every Critical is a **moonshot** (transformative). The only two Feature-Scout
criticals are *time-series campaign snapshots* and *recommended budget moves* — both
infrastructure the other ideas lean on.

---

## Per-context breakdown

(Sorted by criticals desc, then highs desc.)

| # | Context | Group | C | H | M | Report |
|---|---|---|--:|--:|--:|---|
| 1 | Campaign Console UI | Campaign Intelligence | 2 | 2 | 1 | `campaign-console-ui.md` |
| 2 | Google Ads Connector & SQLite Store | Campaign Intelligence | 2 | 2 | 1 | `campaign-connector-store.md` |
| 3 | Trend Chart & Channel Breakdown | Performance Dashboard | 1 | 3 | 1 | `trend-chart-channels.md` |
| 4 | Metrics Analytics Engine | Performance Dashboard | 1 | 3 | 1 | `metrics-engine.md` |
| 5 | Performance Dataset & Seed | Performance Dashboard | 1 | 3 | 1 | `performance-dataset.md` |
| 6 | LLM Wrapper Test Gate | AI Marketing Assistant | 1 | 3 | 1 | `llm-test-gate.md` |
| 7 | AI Assistant Workspace | AI Marketing Assistant | 1 | 3 | 1 | `ai-workspace.md` |
| 8 | AI Tool Forms (Ads, Brief, Analysis) | AI Marketing Assistant | 1 | 3 | 1 | `ai-tool-forms.md` |
| 9 | AI Generation Tools & API | AI Marketing Assistant | 1 | 3 | 1 | `ai-generation-api.md` |
| 10 | Article Reading Experience | Content Article | 1 | 3 | 1 | `article-reading.md` |
| 11 | Headless Article Content | Content Article | 1 | 3 | 1 | `article-content.md` |
| 12 | Campaign Sync & Evaluation API | Campaign Intelligence | 1 | 3 | 1 | `campaign-sync-api.md` |
| 13 | Campaign Model & AI Prompts | Campaign Intelligence | 1 | 3 | 1 | `campaign-model-prompts.md` |
| 14 | Design System, Icons & Charts | Shared Foundations | 1 | 3 | 1 | `design-system.md` |
| 15 | Build & Tooling Config | Shared Foundations | 1 | 3 | 1 | `build-tooling.md` |
| 16 | Header & Footer Navigation | Site Shell & Landing | 1 | 2 | 2 | `header-footer-nav.md` |
| 17 | Dashboard Workspace & KPIs | Performance Dashboard | 1 | 2 | 2 | `dashboard-kpis.md` |
| 18 | LLM Provider Wrapper | AI Marketing Assistant | 1 | 2 | 2 | `llm-provider-wrapper.md` |
| 19 | Czech Formatting Helpers | Shared Foundations | 1 | 2 | 2 | `format-helpers.md` |
| 20 | Home, App Shell & Transitions | Site Shell & Landing | 0 | 3 | 2 | `home-app-shell.md` |

---

## All 21 critical findings — one-line summary (grouped by theme)

### Anomaly detection & alerting backbone
1. **Trend Chart — Anomaly + goal-breach overlay** — pure `detectAnomalies(daily, goals)` reusing `weekdayWeights`, drawn as chart markers; the seed of a monitoring product. `TrendChart.tsx`

### Steering / closed-loop optimization
2. **Dashboard — "Co kdyby?" budget-reallocation simulator** — sliders redistribute spend across channels and project new KPIs from response curves; descriptive → prescriptive. `DashboardClient.tsx`
3. **Campaign Console — Recommended budget moves** *(feature-scout)* — deterministic panel pairing overspenders with over-performers via existing `triage()` weights, with estimated ROAS lift. `CampaignsClient.tsx`
4. **Campaign Console — Autonomous optimization agent** — observe→decide→simulate→recommend/act loop emitting human-gated, typed campaign mutations through the connector seam. `useCampaigns.ts`
5. **Campaign Model — Closed-loop recommend→simulate→measure** is folded into the configurable rules moonshot (see #11 below); listed under Triage Intelligence.
6. **AI Tool Forms — Closed-loop "generate → publish → measure"** — persist generated ad sets, attach to a `Campaign` id, feed back through `campaigns/store.ts`; three AI toys become one creative-optimization loop with memory. `AdGenerator.tsx`
7. **AI Workspace — Cross-tool "Pokračovat v…" chaining** — carry one tool's structured output into the next (analysis → brief → ads); an agentic marketing pipeline. `AiAssistant.tsx`

### Persistence & time-series history
8. **Connector/Store — Time-series metric snapshots in SQLite** *(feature-scout)* — `upsertCampaigns` does a destructive `DELETE FROM campaigns`; add append-only `campaign_snapshots` for real spend/ROAS-over-time. `campaigns/store.ts`

### AI content & narration engine
9. **Article Reading — AI Content Engine from dashboard data** — generate valid `Article` JSON from `performance.json`, rendered through the untouched `ArticleBody`/JSON-LD pipeline. `clanek/page.tsx`
10. **Article Content — Topic → complete Article JSON** — a `generateArticle()` tool emitting the entire typed `Article` shape (blocks + figures + FAQ + JSON-LD), reusing `generateStructured`. `lib/article.ts`

### API security & resilience
11. **AI Generation API — Rate limiting + abuse guard** ⚠️ *real risk* — the single public `/api/ai` POST shells out to a **paid** Claude/Gemini provider unauthenticated with no throttle; a looping visitor drains budget or 502s the demo. `api/ai/route.ts`

### Multi-market / locale
12. **Format Helpers — Locale-parameterised formatting core** — `createFormatters(locale)` factory at the single chokepoint all 199 render sites + every AI prompt flow through; ~1 day unlocks EN/DE/EUR/USD product-wide. `lib/format.ts`

### Data contract & engine
13. **Metrics Engine — Versioned `MetricsSnapshot` contract** — one canonical engine output (totals, deltas+significance, buckets, channels, anomalies, pacing, insights) that dashboard, AI snapshot, and any API route consume; reconciles by construction. `lib/metrics.ts`

### Live data & connector fidelity
14. **Performance Dataset — Pluggable `PerformanceSource` seam** — swap the static JSON import for a live GA4/Google-Ads source; "try it on your own account" turns a one-client piece into a mini-product. `scripts/generate-data.mjs` / `lib/data.ts`
15. **Connector/Store — Pluggable connector framework** — promote `getConnector()` into a registry (`google-ads`/`sklik`/`meta`) on the clean `AdsConnector` interface. `campaigns/connector.ts`
16. **Campaign Sync — Multi-account ingestion service** — generalize the `id=1`-pinned single-tenant store into an `accounts` table + per-account credentials; agency-grade. `api/campaigns/route.ts`

### Reusable package extraction (moonshots)
17. **LLM Provider Wrapper — Extract `structured-llm` SDK** — promote the clean single-entry, two-provider, deterministic-fallback wrapper into a standalone zero-dep package. `lib/llm/index.ts`
18. **LLM Test Gate — Extract reusable "LLM Quality Gate" package** — config-drive the hard-coded constants into an installable provider-agnostic quality gate; the flagship engineering artifact. `scripts/llm-gate.mjs`
19. **Design System — Extract adoptable token package** — make `design-tokens.ts` the canonical multi-target exporter; package the zero-dep primitives/icons/Sparkline + auto-doc page. `lib/design-tokens.ts`
20. **Build & Tooling — "AI Case-Study Starter" template** — decouple the novel pipeline (hash-cached LLM gate, coverage registry, dev-Claude/prod-Gemini switch, visual baseline, CI quad) from demo content as a `degit` template. `package.json`

### Content IA & SEO discoverability
21. **Header/Footer Nav — Self-documenting `/mapa` IA page + JSON-LD `SiteNavigation`** — generate a site-map page + `sitemap.ts` + structured nav all from the single `NAV_ITEMS` model; the "systems thinking" the study sells. `lib/nav.ts`

---

## Triage themes

15 themes detected by clustering categories + title/scenario similarity across the 100 findings.

| Theme | Approx count | Why it's a wave, not scattered fixes |
|---|---:|---|
| A. Anomaly detection & alerting backbone | 6 | `detectAnomalies(daily, goals)` is independently proposed by 5 contexts — one pure primitive, many consumers |
| B. Steering / closed-loop optimization | 6 | Descriptive → prescriptive: budget moves, what-if sim, recommend→simulate, autonomous agent — share a projection model |
| C. Persistence & time-series history | 7 | `campaign_snapshots` proposed 3×; AI-output persistence asymmetry; diff-based sync — one schema unlocks all |
| D. AI content & narration engine | 8 | Reuse `generateStructured` + typed `Article`/snapshot model to narrate data — explain-trend, Proč?, TL;DR, data→article |
| E. Multi-market / locale (i18n) | 5 | One `format.ts` chokepoint → factory; switcher; contract test; AI-prompt locale guarantee |
| F. API security & resilience | 5 | Rate limit (real risk), server-side validation, auth, fallback/retry, cost accounting — privileged-surface hardening |
| G. Streaming structured output | 3 | `generateStructuredStream` once at the wrapper, consumed by API + workspace |
| H. Content IA & SEO discoverability | 8 | `/mapa`+JSON-LD, OG-image/sitemap, related-articles listing (dead `/clanek?kategorie=` link), scrollspy, shareable URL state |
| I. Quality pipeline as portfolio artifact | 9 | CI badges, full-gate CI, Lighthouse/a11y budgets, dep scanning, gate report artifact, budget assertions, CI mode |
| J. Reusable package extraction (moonshots) | 6 | structured-llm SDK, LLM Quality Gate, token package, case-study starter, rules-engine, connector framework |
| K. Campaign triage intelligence | 6 | Configurable thresholds, trend-aware rules, few-shot grounding, saved views, bulk eval, drift watch |
| L. Design-system depth | 4 | Usage docs/do-don't, chart family, a11y/reduced-motion, token contract test |
| M. Dashboard interaction depth | 7 | Per-channel deltas, significance, brush-to-pin range, delta columns, confidence bands, PNG/CSV export |
| N. Richer synthetic data | 5 | Per-channel daily series, event/anomaly injection, scenario engine, insights layer |
| O. Live data & connector fidelity | 6 | Live GAQL adapter, `PerformanceSource` seam, multi-account/MCC, connector registry, scheduled/webhook sync |

---

## Suggested next-phase split (wave plan)

Each wave is one sessionable mental model (5–7 findings) that compounds. Ordered so foundations
land first. Waves 1–7 are in-session-implementable; the big package-extraction moonshots (Theme J)
are flagged as standalone multi-day goals, not waves.

| Wave | Theme(s) | Findings | Why this order |
|---|---|--:|---|
| **1. Analytics core** ⭐ | A + parts of M/C | 5–6 | Pure `detectAnomalies` + per-metric significance + a `MetricsSnapshot` contract in `metrics.ts`, surfaced as chart markers. Pure functions, low risk, 5 contexts converge here. **Recommended first.** |
| **2. Steering layer** | B | 5 | Deterministic `recommendBudgetMoves` + `simulateBudgetShift` on dashboard & console — the diagnosis→prescription bridge. Builds on Wave 1's snapshot. |
| **3. Persistence & history** | C + parts of O | 5–6 | `campaign_snapshots` table + non-destructive diff sync + AI-output persistence. Infra several later waves depend on. |
| **4. AI content & narration** | D | 5 | explain-this-trend, per-card "Proč?", TL;DR, snapshot→article — all reuse `generateStructured` + existing render pipeline. |
| **5. API hardening** ⚠️ | F + G | 5 | Rate limit (real risk) + server-side validation + auth on sync + fallback/retry + cost accounting. Contains the one genuine security gap. |
| **6. Multi-market locale** | E | 4–5 | `createFormatters(locale)` factory + UI switcher + locale contract test. Self-contained ~1-day chokepoint refactor. |
| **7. Pipeline & SEO polish** | H + I | 6 | CI badges + full-gate CI + Lighthouse budgets + `/mapa`+JSON-LD + OG-image/sitemap + related-articles listing (fixes the dead `/clanek?kategorie=` link). |

**Standalone goals (not waves)** — Theme J package extractions (`structured-llm`, LLM Quality Gate,
token package, AI case-study starter, rules-engine, connector framework) are each multi-day efforts
that turn this portfolio piece into reusable platform artifacts. Recommend running them as separate
Pipeline-A goals once the in-session waves are done.

---

## Side findings worth flagging (surfaced while grounding ideas)

These aren't opportunities — they're small real issues the scan tripped over:

- **Drift contradiction** — `Footer.tsx:59` claims "JSON persistence (bez DB)" while `nav.ts:46`
  says campaign data is saved "do SQLite". In a case study whose thesis is *no drift*, this is a
  visible self-contradiction. (1-line fix; good Wave-7 cleanup.)
- **Dead breadcrumb link** — `categoryHubPath()` (`nav.ts`) emits `/clanek?kategorie=…` with no
  listing page behind it. (Resolved by the related-articles listing in Wave 7.)
- **Unenforced limits** — the ad prompts assert Google Ads character limits the server never
  validates; `validateResult` self-repair (Wave 5) closes this.
- **Security** — `/api/ai` and the campaign sync/analyze routes are unauthenticated and spawn
  paid LLM calls (Wave 5, Critical).

---

## How this scan was run

- **Scanners**: `feature-scout` (`agent_feature_scout`) + `moonshot-architect` (`agent_moonshot_architect`),
  applied together per context (combined 5 findings each).
- **Date**: 2026-06-15. **Scope**: all 20 contexts, full-stack (no Rust backend; pure Next.js app).
- **Method**: 20 isolated `general-purpose` subagents, batched 8/8/4. Each read its context's files
  read-only, grounded every idea in real functions, and wrote one report. Orchestrator read only the
  terse replies during scanning.
- **File reads**: ~150 across all subagents (range 4–12 per context).
- **Verification**: counts reconciled two ways — `> Total:` header sum = 100, `**Severity**:` bullet
  count = 100. ✓
- **Project state at scan**: dirty working tree (~35 modified + many untracked files — an in-progress
  dev snapshot); branch `master`; baseline 0 TS errors / 0 lint errors.
