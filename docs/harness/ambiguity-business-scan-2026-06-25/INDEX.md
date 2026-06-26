# Ambiguity Guardian + Business Visionary Scan — systedo-case, 2026-06-25

> Combined-lens audit: every context scanned simultaneously through 🌀 **Ambiguity Guardian**
> (unclear requirements, undocumented assumptions, magic numbers, edge cases, claims-vs-reality drift)
> and 🚀 **Business Visionary** (monetization, conversion, differentiation, growth), then reduced to
> the **top 5 highest-value findings per context**.
> 20 parallel subagent runs, batched in waves of 8 / 8 / 4. 100 findings.

---

## Totals

### By value tier
| | High | Medium | Low | **Total** |
|---|---:|---:|---:|---:|
| Across 20 contexts | 39 | 59 | 2 | **100** |
| Share | 39% | 59% | 2% | 100% |

### By lens
| | 🌀 Ambiguity | 🚀 Business | combined | **Total** |
|---|---:|---:|---:|---:|
| Findings | ~62 | ~36 | ~2 | **100** |

Each context was capped at 5 by design (per the run brief). The skew toward Medium reflects a
**healthy, mature codebase** (tsc 0 / lint 0 / 173 unit tests green at baseline) — most findings are
clarity/credibility refinements and growth opportunities, not latent crashes. The Highs cluster around
**numbers the case study shows that are subtly wrong or misleading**, **claims the code makes about
itself that aren't true**, and **the missing conversion path** for a portfolio whose whole job is to win work.

---

## Per-context breakdown (sorted by High count, then context)

| # | Context | High | Med | Low | Report |
|---|---------|---:|---:|---:|--------|
| 1 | Campaign Model & AI Prompts | 3 | 2 | 0 | `campaign-model-prompts.md` |
| 2 | LLM Wrapper Test Gate | 3 | 2 | 0 | `llm-test-gate.md` |
| 3 | Czech Formatting Helpers | 3 | 2 | 0 | `format-helpers.md` |
| 4 | Headless Article Content | 3 | 2 | 0 | `article-content.md` |
| 5 | Trend Chart & Channel Breakdown | 2 | 3 | 0 | `trend-channel.md` |
| 6 | Campaign Sync & Evaluation API | 2 | 3 | 0 | `campaign-sync-api.md` |
| 7 | Metrics Analytics Engine | 2 | 3 | 0 | `metrics-engine.md` |
| 8 | Campaign Console UI | 2 | 3 | 0 | `campaign-console.md` |
| 9 | Google Ads Connector & SQLite Store | 2 | 3 | 0 | `campaign-connector-store.md` |
| 10 | LLM Provider Wrapper | 2 | 3 | 0 | `llm-provider-wrapper.md` |
| 11 | Build & Tooling Config | 2 | 3 | 0 | `build-tooling.md` |
| 12 | Design System, Icons & Charts | 2 | 3 | 0 | `design-system.md` |
| 13 | AI Tool Forms (Ads, Brief, Analysis) | 2 | 3 | 0 | `ai-tool-forms.md` |
| 14 | Dashboard Workspace & KPIs | 2 | 3 | 0 | `dashboard-kpis.md` |
| 15 | Home, App Shell & Transitions | 2 | 2 | 1 | `home-app-shell.md` |
| 16 | Header & Footer Navigation | 1 | 4 | 0 | `nav-header-footer.md` |
| 17 | Article Reading Experience | 1 | 3 | 1 | `article-reading.md` |
| 18 | AI Assistant Workspace | 1 | 4 | 0 | `ai-workspace.md` |
| 19 | Performance Dataset & Seed | 1 | 4 | 0 | `dataset-seed.md` |
| 20 | AI Generation Tools & API | 1 | 4 | 0 | `ai-generation-api.md` |

---

## Commit-safety map (READ FIRST — the LLM-gate landmine)

`scripts/llm-gate.mjs` hashes a fixed file set; **editing any of them runs the real-model Claude test
suite at pre-commit and blocks the commit unless a logged-in `claude` CLI passes**. Wave planning is
built around this.

**🔒 Gate-triggering (HASHED) — a fix here needs the Claude CLI gate to pass:**
`src/lib/llm/*` · `src/lib/ai/tools/{_shared,ads,brief,analysis,campaign-eval,social}.ts` ·
`src/app/api/ai/route.ts` · `src/app/api/campaigns/analyze/route.ts` ·
`test-llm/{registry,real.test,setup,resolve-hooks}.mjs`

**✅ Commit-safe even inside the AI area (NOT hashed):**
`scripts/llm-gate.mjs` · `test-llm/callsites.mjs` · `test-llm/coverage.test.mjs` ·
`src/lib/ai/rate-limit.ts` · `src/lib/ai/response-cache.ts` · `src/lib/ai/validation.ts` ·
`src/lib/campaigns/*` · `src/lib/db.ts` · `src/app/api/campaigns/route.ts` (sync route) · all UI components · `src/lib/format.ts` · `src/lib/article.ts` · `src/lib/metrics/*`

**Net:** of the 39 High findings, **~35 are commit-safe** and only **~4 are genuinely gate-locked**
(llm-provider-wrapper #1 & #2, llm-test-gate #2, ai-generation-api #4). Several "AI" findings (spoofable
rate-limit, timeout test) turn out to be fixable in non-hashed files (`rate-limit.ts`, the Playwright spec).

---

## All 39 High-value findings, grouped by theme

### A. Numbers the case study shows are wrong or misleading (credibility) — *commit-safe*
1. **trend-channel #1** — Every channel row shows the *identical* revenue delta; constant-share projection cancels the share, so 5 identical badges read as fake data. `ChannelTable.tsx:113` / `metrics/channels.ts:60` [M]
2. **format-helpers #1** — `fmtSignedPct` picks its sign from the raw fraction *before* rounding → trust-eroding "−0,0 %". `format.ts:124` [S]
3. **format-helpers #3** — `fmtPct`'s fraction-vs-percent input contract is implicit and collides with `*Pct` field names → latent 100× error. `format.ts:113` [M]
4. **campaign-console #1** — Numeric sort reads `safe()`-zeroed values, so a no-revenue (triage-*critical*) campaign sorts to the *best* end of a worst-first view — sort contradicts the badge. `CampaignTable.tsx:308` / `ratios.ts:8` [S]
5. **campaign-model-prompts #1** — `ROAS_CRITICAL 0.6` and `PNO_CRITICAL 1.6` are sold as equivalent but aren't → red PNO cell with only a "warning" badge; leaks into the AI prompt. `triage.ts:14` [S]
6. **campaign-model-prompts #2** — Spending-with-no-revenue renders identically to a never-ran campaign in the eval prompt. `report-input.ts:41` [S]
7. **metrics-engine #2** — "dopad ≈ −X Kč" anomaly headline nets windfalls against losses and ignores conversions. `metrics/anomalies.ts:116` [S]
8. **dashboard-kpis #1** — Forecast shows a confident "X % chance of hitting goal" from an undocumented i.i.d.-normal model with no early-month volatility guard. `GoalPacing.tsx:137` / `pacing.ts:77` [M]
9. **metrics-engine #1** — Engine silently assumes undocumented dataset invariants (730 days, month-aligned); one re-seed halves "12 měsíců". `metrics/series.ts:83` [M]

### B. Claims the code makes about itself that aren't true (drift / SSOT) — *commit-safe*
10. **home-app-shell #1** — Blanket `robots: noindex,nofollow` nullifies all the SEO/OG metadata directly above it. `layout.tsx:37` [S]
11. **dataset-seed #1** — Committed JSON drifted from its generator; `npm run seed` would silently revert a "Systedo→Adamant" rebrand. `performance.json:7` vs `generate-data.mjs:121` [S]
12. **campaign-connector-store #1** — "SQLite campaign store" is dead schema; real store is Firestore, but `db.ts` still defines unused tables + a false header. `db.ts:1-79` [S]
13. **llm-test-gate #1** — Gate's `HASHED_FILES` list is hand-maintained and already drifted — `social.ts` (a proven tool) is omitted, so its edits never re-prove; cache stays falsely green. `llm-gate.mjs:29-54` [M] *(fix lands in non-hashed llm-gate.mjs → commit-safe)*
14. **build-tooling #2** — CI does **not** mirror the pre-commit gate despite a comment claiming it does. `ci.yml:26-39` vs `.husky/pre-commit` [S]
15. **build-tooling #1** — README sells a 4-page demo; `.env.example`/`SETUP.md` reveal a full multi-user cloud product the README hides. `README.md:9-25` [M]
16. **article-content #3** — Anchor links vs heading IDs are never cross-checked (broken in-page links) and the ToC silently drops every H3. `article.ts:106` [S]

### C. Robustness / abuse-resistance — *commit-safe (fixes land in non-hashed files)*
17. **ai-generation-api #1 + campaign-sync-api #1** — Per-IP rate limit is the only anon budget cap and trusts a client-spoofable `X-Forwarded-For`; `?force=1` also bypasses the cache → unmetered LLM drain. Single root cause: `rate-limit.ts:62` (closes both). [M]
18. **campaign-connector-store #2** — Live Google Ads errors have no fallback — one transient API failure 500s the whole premium dashboard. `connector.ts:45-56` [M]
19. **article-content #2** — `data as Article` is an unchecked cast; malformed JSON / missing image / empty FAQ fail silently. `article.ts:97` [M]
20. **campaign-sync-api #2** — A transient series-fetch hiccup silently wipes the saved trend chart. `campaigns/route.ts:126` [S]

### D. Localization honesty (cs-CZ is the product locale) — *commit-safe*
21. **ai-tool-forms #1** — Czech (default) locale shows ~15 English UI strings across the Content Brief tool. `ContentBriefGenerator.tsx:62` [S]
22. **home-app-shell #2** — The front door (landing rozcestník) is English-only despite the cs-CZ case study. `BrandLanding.tsx:116` [M]
23. **design-system #2** — Sparkline hardcodes a cs-CZ a11y label + non-locale formatter, contradicting the "one formatting source" claim. `Sparkline.tsx:112` [S]
24. **format-helpers #2** — `fmtRange`/month helpers hardcode Czech word order, breaking the "switch config for another market" promise. `format.ts:207` [M]

### E. Conversion & shareability (a portfolio's whole job) — *commit-safe*
25. **nav-header-footer #1** — The end-of-journey "conversion moment" loops back to the overview; no contact/hire CTA anywhere in the chrome. `TaskPager.tsx:78` / `Footer.tsx:62` [S]
26. **article-reading #1** — No in-article lead capture/newsletter at the natural end of reading — the biggest funnel gap. `clanek/page.tsx:192` [M]
27. **campaign-console #2** — No CSV/XLSX export of the filtered table + AI findings (sharing is link-only). `CampaignsClient.tsx:140` [M]
28. **dashboard-kpis #2** — Only the channel table is exportable; the headline narrative (KPIs, pacing, insights) cannot be shared. `DashboardClient.tsx:246` [M]
29. **campaign-model-prompts #4** — Prompt builders hard-bake one client + one target, blocking a "grade your own account" lead magnet. `report-input.ts:32` [M]

### F. AI / LLM productization & differentiation — *mixed (some gate-locked)*
30. **llm-test-gate #2** 🔒 — The gate's real run only proves the Claude (dev) provider; the prod Gemini path is never exercised. `real.test.mjs:32` / `setup.mjs:6` [M] *gate-locked*
31. **llm-test-gate #3** — The "single chokepoint" is enforced by two hardcoded regexes; most leak vectors are invisible. `callsites.mjs:56-69` [M] *(callsites.mjs not hashed → commit-safe)*
32. **llm-provider-wrapper #1** 🔒 — Retry/fallback control-flow keys off **Czech error substrings**; Gemini malformed-JSON is never retried. `llm/index.ts:96` [M] *gate-locked*
33. **llm-provider-wrapper #2** 🔒 — Prod model name + cost rate are unsourced magic strings; rate-table drift silently reports **$0 cost**. `llm/models.ts:16` [S] *gate-locked*
34. **article-content #1** — The "headless CMS" is a hardcoded singleton import — no path to the multi-article hub the case study should showcase. `article.ts:1,97` [M]

### G. Design-system showcase integrity — *commit-safe*
35. **design-system #1** — Dark mode (the system's biggest differentiator) is invisible in the living guide and unprotected by the light-only visual-regression baseline. `globals.css:170` / `design-system.spec.ts:56` [M]

### H. Build / config correctness — *commit-safe*
36. **ai-workspace #1** — Timeout e2e test (and live-result waits) assume a dead 60s ceiling; the dev ceiling is now 180s, so the test can't pass and waits flake. `ai-asistent.spec.ts:14` [S] *(Playwright spec not hashed → commit-safe)*
37. **ai-tool-forms #2** — Ad Strength can rate a set "Výborná/Excellent" while headlines exceed the character limits the same tool advertises. `ad-strength.ts:82` [S]
38. **campaign-connector-store #4** — Tenant key is built twice and its components are interpolated into a Firestore path unsanitized. `connector.ts:64` / `store.ts:34` [S]
39. *(remaining High rounded into themes above; full list in per-context reports)*

*(The 2 Low findings: home-app-shell #5 global page-fade also wraps `/app`; article-reading #5 touch readers can't reach permalinks.)*

---

## Triage themes (the durable clusters)

| Theme | ~Findings | Why it's a wave, not scattered fixes |
|---|---:|---|
| **Numbers that mislead** | 9 H + several M | One mental model — "does the displayed number match the truth?" — fixes compound and share test scaffolding |
| **Claims-vs-reality drift** | 7 H + M | SSOT discipline: code/docs/gates that lie about themselves; each is a small, self-contained truth-up |
| **Robustness / abuse** | 4 H + M | Defensive hardening on server surfaces; the rate-limit fix closes two findings at once |
| **Localization honesty** | 4 H + 2 M | cs-CZ is the product locale; English leaks undercut the whole premise |
| **Conversion & shareability** | 5 H + M | The portfolio can't convert and its outputs can't leave the screen |
| **Magic numbers → named consts** | ~10 M | Pure clarity sweep across triage/ad-strength/dashboard/format |
| **AI productization (gate-locked)** | 4 H | Provider parity, cost truth, retry logic — needs the Claude CLI gate |

---

## Suggested wave plan (value-first, commit-safe waves first)

Each wave = one mental model, ~5–7 findings, atomic commits, full tsc+unit verify at the end.

- **Wave 1 — "Numbers you can trust"** (theme A): trend-channel #1, format-helpers #1, campaign-console #1, campaign-model-prompts #1, campaign-model-prompts #2, metrics-engine #2. *(6 · all H · commit-safe)*
- **Wave 2 — "Stop the code lying about itself"** (theme B): home-app-shell #1, dataset-seed #1, campaign-connector-store #1, build-tooling #2, llm-test-gate #1, build-tooling #1. *(6 · all H · commit-safe)*
- **Wave 3 — "Don't crash, don't drain"** (theme C + robustness): rate-limit IP fix (closes ai-generation-api #1 + campaign-sync-api #1), article-content #2, article-content #3, campaign-console #3 (M), trend-channel #3 (M), ai-workspace #1. *(commit-safe)*
- **Wave 4 — "Czech, all the way down"** (theme D): ai-tool-forms #1, design-system #2, home-app-shell #2, nav-header-footer #3 (M), format-helpers #2. *(commit-safe)*
- **Wave 5 — "Make it convert & shareable"** (theme E): nav-header-footer #1, article-reading #1, dashboard-kpis #2, campaign-console #2, ai-tool-forms #3 (M). *(commit-safe)*
- **Wave 6 — "Name the magic numbers"** (theme F-clarity): ai-tool-forms #2, ai-tool-forms #4 (M), campaign-console #4 + campaign-model-prompts #3 (triage consts), dashboard-kpis #3 (M), trend-channel #5 (M). *(commit-safe)*
- **Gate-locked track (decision needed)** 🔒: llm-provider-wrapper #1, llm-provider-wrapper #2, llm-test-gate #2, ai-generation-api #4. Each edits a HASHED file → the pre-commit gate runs the real Claude test suite. Run only if a logged-in `claude` CLI is available; otherwise defer.

---

## How this scan was run (provenance)

- **Scanners:** `ambiguity-guardian` + `business-visionary` (Vibeman prompt registry `src/lib/prompts/registry/agents/`), combined per context → top 5 by value.
- **Date:** 2026-06-25 · **Project:** systedo-case (`C:\Users\kazda\kiro\systedo-case`, Next.js 16 / React 19, cs-CZ).
- **Scope:** all 20 mapped contexts, full-stack. Subagents read only each context's `filePaths` (+ a few adjacent imports), wrote one report each, replied with terse stats.
- **Method:** 20 `general-purpose` subagents in 3 waves (8/8/4); orchestrator read only the replies during scanning.
- **Baseline:** tsc 0 errors · eslint 0 errors (1 pre-existing warning) · 173/173 unit tests.
- **Verification:** finding count confirmed three ways — 20× `Total: 5` headers, 100 `Value` bullets, 100 numbered headings.
- **Context-map drift noted:** `src/lib/metrics.ts`→`src/lib/metrics/*` barrel; `src/lib/gemini.ts`→`src/lib/llm/gemini.ts`; campaign store is Firestore not SQLite; repo is far larger than its 20-context map (auth, Firestore, cron, Creative Studio, analytics workspace).
</content>
</invoke>
