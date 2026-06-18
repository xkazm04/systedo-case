# Feature Scout Fix Wave 4 — "Bring the remaining modules up"

> 5 commits, 5 findings closed across 5 modules.
> Baseline preserved & strengthened: tsc 0 → 0 · `next build` pass → pass ·
> unit tests **43 → 72** (+29, all green) · eslint 0.
> Branch: `vibeman/feature-scout-wave1` (continues from Waves 1–3). The user's
> pre-existing uncommitted work was left untouched.

## Theme

The earlier waves concentrated on the modules with the loudest findings. Wave 4
gives the **previously-untouched modules** their highest-value *safe* (non-LLM)
improvement, plus one clean depth item — so every analytics module in the app has
now been improved. All pure compute + UI, each new pure helper covered by tests.

## Commits

| # | Commit | Module | Finding | Files |
|---|---|---|---|---|
| 1 | `6142f54` | lead-quality | lead-quality.md #2 | `lib/lead-quality/compute.ts`, `sample.ts`, `LeadQualityModule.tsx`, `test-unit/lead-quality-funnel.test.mjs` (new) |
| 2 | `dd7f5da` | audience | audience.md #1 | `lib/audience/compute.ts`, `sample.ts`, `AudienceModule.tsx`, `publikum/page.tsx`, `test-unit/audience-source-attribution.test.mjs` (new) |
| 3 | `93e6ce1` | inventory-season | inventory-season.md #4 | `lib/inventory/compute.ts`, `lib/insights/aggregate.ts`, `InventorySeasonModule.tsx`, `sklad-sezonnost/page.tsx`, `test-unit/inventory-stockout.test.mjs` (new) |
| 4 | `52eb88e` | content | content.md #3 | `lib/content/seo-score.ts` (new), `components/ai/ContentBriefGenerator.tsx`, `test-unit/seo-score.test.mjs` (new) |
| 5 | `714cc23` | ltv | ltv.md #1 | `lib/ltv/compute.ts`, `LtvModule.tsx`, `test-unit/ltv-survival.test.mjs` (new) |

## What was fixed

1. **Lead-quality — funnel by source.** Three flat counts became a Lead→SQL→Opportunity→Won funnel with per-step conversion% / drop-off and average velocity, plus a campaign drill-down. Optional fields degrade gracefully. +7 tests.
2. **Audience — subscriber-source attribution.** The anonymous funnel gained a `SubscriberSource` dimension + a pure `sourceAttribution()` rollup (share, blended cost-per-sub, lowest-retention flag) and a "Zdroje odběratelů" card that cross-links to Distribuce. +7 tests.
3. **Inventory-season — projected stockout + early alerts.** Added `projectStockout()` (stockout date from a server-derived reference date — no `Date.now()` in render), an "at-risk soon" tier (<14 days), a "Vyprodáno za" column, and an additive early-warning rec in the eshop Overview. +4 tests.
4. **Content — pixel-accurate SERP preview + scorecard.** The character-count mock became a pixel-width-truncated preview (desktop/mobile toggle) with a readability / keyword-coverage / E-E-A-T scorecard — pure client scoring over the existing brief, no change to the AI tool. +7 tests.
5. **LTV — per-cohort retention curve.** The `survivalCurve` already computed but discarded is now a per-row inline SVG sparkline (observed solid, extrapolated tail dashed for honesty). Server-rendered. +6 tests.

## Verification (before → after)

| Gate | Wave-3 end | Wave-4 end |
|---|---|---|
| `tsc --noEmit` | 0 | **0** |
| `next build` | pass | **pass** |
| `npm run test:unit` | 43/43 | **72/72** (+29) |
| `eslint` (changed) | 0 | **0** |

## Patterns established (catalogue, continued)

15. **Deterministic "now" for projections.** Stockout/age projections derive their reference date server-side (e.g. the dataset's last day) and pass it into pure helpers — never `Date.now()` during a client render (React-Compiler purity rule) and reproducible in tests.
16. **Optional-field model deepening with graceful degrade.** New depth (lead funnel stages, subscriber sources, channel CACs) is added as *optional* fields with a documented fallback to the prior behavior, so the feature ships without a migration or a regression — and a test asserts the legacy-shape path.
17. **Expose, don't recompute.** LTV's retention curve was already computed inside `survivalCurve`; the fix surfaced it on `CohortMetrics` rather than recomputing — cheaper and keeps one source of truth.
18. **Hand-rolled SVG over a chart lib.** Per the app's "vlastní SVG grafy" convention, sparklines/curves are plain `<svg><polyline>` built from a pure points serializer (testable), keeping the cell server-renderable with zero client JS.

## Coverage status

Every analytics module now improved across the four waves: local, content-engine,
compare-seo, catalog, distribution, speed-lead, lp-experiments, ltv, profit,
lead-quality, audience, inventory-season, **content**. Still untouched: **keywords**
(its top items — intent clustering, SERP gap — are LLM- or competitor-data-bound)
and **project-settings** (Theme G admin: team/roles, audit log, archive).

## What remains (next waves, per INDEX)

- **AI-assist wave** (needs a verified Claude CLI for the `llm-gate`): distribution #1, speed-lead #1, local #2, content-engine #2, content #1 (brief→draft), lead-quality #4, lp #3, ltv #4, compare-seo #5, keywords #1.
- **More depth (safe):** profit #2 (SKU margins) / #3 (trend) / #5 (overhead), ltv #3 (horizon slider), compare-seo #2/#4 (competitor + rank-tracking), inventory #1/#2/#3/#5, audience #2/#3/#4/#5, lead-quality #5, keywords #3/#4.
- **Real integrations** (Theme E) · **Settings/admin** (Theme G — project-settings #1–#5).
