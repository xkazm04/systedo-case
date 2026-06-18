# Feature Scout Fix Wave 3 — "Connect the funnel & close loops"

> 5 commits, 5 findings closed across 5 modules.
> Baseline preserved & strengthened: tsc 0 → 0 · `next build` pass → pass ·
> unit tests **21 → 43** (+22, all green) · eslint 0.
> Branch: `vibeman/feature-scout-wave1` (continues from Waves 1–2). The user's
> pre-existing uncommitted work was left untouched.

## Theme

Wave 1 wired up missing component-level actions; Wave 2 made the numbers
trustworthy; Wave 3 makes each module's output **flow somewhere** — to another
module via the canonical `NextSteps`, to Google Ads as an export, or as
self-attributing links. Several modules dead-ended (no `NextSteps` at all); this
turns the 15 islands into a connected workflow. All pure code/UI — no LLM tool,
so the `llm-gate` stayed on its cached pass.

## Commits

| # | Commit | Module | Finding | Files |
|---|---|---|---|---|
| 1 | `a870032` | distribution | distribution.md #2 | `DistributionModule.tsx`, `lib/distribution/generate.ts`, `lib/distribution/utm.ts` (new), `test-unit/distribution-utm.test.mjs` (new) |
| 2 | `a8989a8` | catalog | catalog.md #3 | `CatalogModule.tsx`, `lib/catalog/export.ts` (new), `test-unit/catalog-export.test.mjs` (new) |
| 3 | `168ebb2` | lp-experiments | lp-experiments.md #5 | `LpExperimentsModule.tsx`, `lib/lp-exp/sample.ts` |
| 4 | `2e39862` | speed-lead | speed-lead.md #5 | `SpeedLeadModule.tsx`, `lib/speed-lead/analytics.ts` (new), `test-unit/speed-lead-analytics.test.mjs` (new) |
| 5 | `c728608` | ltv | ltv.md #5 | `LtvModule.tsx`, `lib/ltv/compute.ts`, `LtvReportButton.tsx` (new), `test-unit/ltv-trend.test.mjs` (new) |

## What was fixed

1. **Distribution — close the attribution loop.** Variants embedded the bare article URL (un-attributable). New pure `utm.ts` stamps each variant link with `utm_source=<channel>` / `utm_medium=distribution` / `utm_campaign=<slug>`; the module surfaces the resolved link per variant, and the attribution table's `utm_source` column now visibly corresponds to the variants. +8 tests.
2. **Catalog — ship the asset group out.** The group was display-only. New pure `export.ts` builds a Google Ads Editor CSV (RFC-4180 escaped) + plain-text dump; header gains „Kopírovat vše" and „Exportovat CSV" (client Blob), operating on the AI or deterministic group. +4 tests.
3. **LP experiments — ship the winner.** A significant winner dead-ended. Resolved winners now surface the winning variant URL and a NextSteps strip into obsah / srovnani-seo / kampane (gated on the trust-gate verdict from Wave 2).
4. **Speed-lead — measure & route.** Added a response-time analytics band (median, % within SLA, per-channel avg via a pure helper) by capturing real response time on "Odeslat", plus a NextSteps strip to kvalita-leadu / kampane. +4 tests.
5. **LTV — trend, route & export.** Added a newest-vs-oldest cohort trend (pure `cohortTrend` + a trend pill / signed-delta line), a CSV export (client child, UTF-8 BOM for Czech), and a NextSteps link to kampane. +6 tests.

## Verification (before → after)

| Gate | Wave-2 end | Wave-3 end |
|---|---|---|
| `tsc --noEmit` | 0 | **0** |
| `next build` | pass | **pass** |
| `npm run test:unit` | 21/21 | **43/43** (+22) |
| `eslint` (changed) | 0 | **0** |

## Patterns established (catalogue, continued)

11. **Make output flow — pick the real downstream.** Honor the module registry's per-type availability when wiring `NextSteps` (e.g. `zisk` is eshop-only, so the LTV `app`-type module links `kampane`, not `zisk`). A wrong target would 404.
12. **Client-only for the side-effect, server for the data.** Export/download lives in a tiny co-located `"use client"` child (`LtvReportButton`) that receives server-computed rows — keeps the page server-rendered while enabling a Blob download.
13. **Pure builder + escaper, then test it.** CSV/UTM builders are pure functions with a unit test asserting escaping and edge cases (existing query strings, commas/quotes), so the I/O format is locked.
14. **Capture the timestamp at the action, not from frozen sample data.** Speed-lead's analytics record response time when "Odeslat" fires (state map keyed by lead id), turning a static inbox into a measured channel without a backend.

## What remains (next waves, per INDEX)

- **AI-assist wave** (needs a verified Claude CLI for the `llm-gate`): distribution #1, speed-lead #1, local #2, content-engine #2, lp #3, ltv #4, compare-seo #5.
- **Deeper analytics:** profit #2 (SKU margins), profit #3 (trend), ltv #1 (retention curve) / #3 (horizon slider), keywords #2 (SERP gap), compare-seo #2/#4 (competitor + rank-tracking), inventory/lead-quality analytics.
- **Real integrations** (Theme E — feed import, CRM webhook, connector hub) · **Alerts/trends** (Theme F) · **Settings/admin** (Theme G — team/roles, audit log, archive).
