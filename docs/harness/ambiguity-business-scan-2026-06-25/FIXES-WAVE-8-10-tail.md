# Ambiguity+Business — Medium/Low tail (Waves 8–10)

> Continuation after the user asked to work the Medium/Low tail. Front-loaded the
> commit-safe **Highs** that had been deferred, then the high-value Mediums.
> Baseline preserved throughout: tsc 0 · unit 173/173 · LLM gate green · 0 regressions.

## Wave 8 — remaining commit-safe Highs (5)
| Commit | Finding | File |
|--------|---------|------|
| `b92f169` | campaign-sync #2 — transient series fetch blanked the trend chart | `api/campaigns/route.ts` |
| `139081e` | connector #2 — live Ads errors degrade to sample, not a 500 | `campaigns/connector.ts` |
| `2c1c1fb` | format #3 — fmtPct 0–1 ratio contract (100× footgun) | `lib/format.ts` |
| `a80c22a` | metrics #1 — expose period truncation + partial-month flags | `metrics/series.ts` |
| `65a73f8` | dashboard #1 — hide goal-probability % until the forecast is reliable | `pacing.ts`, `GoalPacing.tsx` |

## Wave 9 — robustness Mediums (5 findings, 4 commits)
| Commit | Finding(s) | File |
|--------|-----------|------|
| `7c01c2e` | ai-workspace #3 **+** #5 — abort superseded runs; versioned cached result | `ai/useAiTool.ts` |
| `1eda1e2` | connector #4 — one sanitized tenant-key builder (no drift, no path injection) | `campaigns/connector.ts` |
| `fd83d85` | article-content #5 — require figure width/height (JSON-LD + CLS) | `lib/article.ts` |
| `02f256b` | campaign-console #5 — persist table filters like sort | `campaigns/CampaignTable.tsx` |

## Wave 10 — clarity / repo polish (5 findings, 4 commits)
| Commit | Finding | File |
|--------|---------|------|
| `441cdca` | build-tooling #4 — pin Node version (engines + .nvmrc) | `package.json`, `.nvmrc` |
| `337b95b` | build-tooling #5 — README timeout drift + React-Compiler claim | `README.md` |
| `627fa1d` | build-tooling #3 — document GEMINI_MODEL in .env.example | `.env.example` |
| `e5ff673` | dataset-seed #2 **+** #4 — realistic monthly goal; single seed const; segment comments | `generate-data.mjs`, `performance.json` |

## Cumulative (all tracks)
**49 findings closed, 0 regressions.** tsc 0 · unit 173/173 · `next build` ✓ · LLM gate proven.
Branch `vibeman/ambiguity-business-fixes-2026-06-25` (unmerged), 49 commits.

## Remaining (≈19, all Medium/Low — UI polish + a few clarity)
- **UI polish (Medium):** ai-workspace #2 (copy-prompt button), design-system #3/#4/#5 (dark-token dedup, typography in the showcase, click-to-copy swatch), ai-generation-api #2/#5 (glass-box panel, typed AiError), article-content #4 / article-reading #2 (link/permalink UTM), article-reading #4 (empty-TOC guard), trend-channel #4 (tooltip comparison date), dashboard-kpis #3/#4 (named magic numbers, pacing scope chip).
- **Clarity (Medium):** nav #4 (sitemap SSOT), nav #5 (TaskPager dict consolidation), metrics #3 (significance: sample vs population variance — a behavior change, needs care), metrics #4 (surface PNO-vs-goal status).
- **Low (won't-fix-grade):** home-app-shell #5 (page-fade also wraps `/app`), article-reading #5 (touch-only permalinks).
- **Deferred earlier (unchanged):** product decisions (contact CTA, lead capture, landing language) and bigger builds (multi-article CMS, demo engine, retention/pruning, dashboard narrative export) — see FIXES-WAVE-7-gate-locked.md.

## Wave 11 — clean UI/clarity polish (6 findings, 5 commits)
> User opted for clean polish only — skip the variance behavior-change and the 2 won't-fix Lows.

| Commit | Finding | File |
|--------|---------|------|
| `bc2e43c` | ai-workspace #2 — copy button on the prompt-transparency panel | `ai/primitives.tsx` |
| `ac54c58` | trend-channel #4 — label the comparison date in the tooltip | `dashboard/TrendChart.tsx` |
| `403d705` | article-reading #4 — hide the TOC sidebar when no headings | `app/clanek/page.tsx` |
| `d7b8906` | dashboard-kpis #3 **+** #4 — name the gauge/threshold magic numbers; "this month" scope chip | `DashboardClient.tsx`, `DeltaBadge.tsx`, `GoalPacing.tsx` |
| `8077d76` | nav-header-footer #4 — single source for footer/sitemap meta pages | `lib/nav.ts`, `site/Footer.tsx` |

## Final cumulative: 55 findings closed, 55 commits, 0 regressions
tsc 0 · unit 173/173 · `next build` ✓ · LLM gate proven. Branch `vibeman/ambiguity-business-fixes-2026-06-25` (unmerged).

## Remaining (≈12, all more-involved than a one-line touch — deferred with reason)
- **Needs a server→client boundary or a model+renderer change:** design-system #5 (click-to-copy swatch — page is a Server Component), article-content #4 / article-reading #2 (link/permalink UTM — extend the Inline/CTA model + renderer), ai-generation-api #2 (glass-box usage/cost panel).
- **Bigger refactor / behavior change:** nav #5 (TaskPager → app message system), metrics #3 (sample vs population variance — changes the significance badges), design-system #3 (dedup the duplicated dark-token block — CSS regression risk without a visual baseline), design-system #4 (generate the type scale from tokens).
- **Type-only / low immediate value:** ai-generation-api #5 (typed `AiError` union — useful only once wired into the hashed route).
- **Won't-fix-grade Lows (per user):** home-app-shell #5 (page-fade over `/app`), article-reading #5 (touch-only permalinks).
- **Product decisions / bigger builds:** unchanged — see FIXES-WAVE-7-gate-locked.md.
</content>
