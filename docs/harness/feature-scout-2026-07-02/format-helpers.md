# Feature Scout — Czech Formatting Helpers (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/lib/format.ts

## 1. Sweep the ad-hoc `toFixed` decimal-point leaks in Czech text through the formatters
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/images/attribution-types.ts:107`
- **Opportunity**: A dozen display sites bypass format.ts with raw `toFixed()`, injecting period decimals into otherwise-Czech comma-decimal copy: `ROAS ${best.roas.toFixed(1)}` in a Czech hint (attribution-types.ts:107), `(req.controlCvr * 100).toFixed(1)} %` in a Czech AI prompt (ai/tools/lp-variant-ideas.ts:48), payback `toFixed(1)} měs.` (ai/tools/cohort-diagnosis.ts:66), `Průměr ${avg.toFixed(1)} slov` (content/seo-score.ts:225), the Sparkline aria-label `změna +12.5 %` with an ASCII plus (charts/Sparkline.tsx:117), plus table cells in InventorySeasonModule.tsx:316, LtvModule.tsx:310/478 and a hand-rolled `toFixed(2)}×` multiple (CompareSeoTable.tsx:568). Two files even hand-fake the Czech comma with `.replace(".", ",")` (LocalModule.tsx:69, LocalReviews.tsx:52 — duplicated `star` helper) and lead-quality/compute.ts:251 re-implements `fmtCZK` as `czkText`.
- **Why valuable**: "16,5 %" next to "2.5 %" on the same screen (and inside the same AI prompt) reads as a rendering bug and undercuts the file's whole promise that "every page renders numbers identically"; several leaks also flow into prompt text the model quotes back.
- **Build sketch**: Mechanical substitution using existing helpers: `fmtMultiple` for the ROAS/weight multiples, `fmtPct(x, 1)` for the CVR/PNO percents (divide the ×100 sites back to fractions), `fmtDecimal(x, 1)` for payback/velocity/rating/words-per-sentence, `fmtSignedPct(pct / 100, …)` for the Sparkline aria string, and `fmtCZK` for `czkText`. Deliberately EXCLUDE `api/campaigns/analyze/route.ts:122` (same leak, but a HASHED gate file — defer or bundle into a future gate run) and leave SVG path-coordinate `toFixed` (TrendChart, ScoreTimeline, sparkline geometry) and machine CSV cells alone. Touches `"use client"` modules → the wave must run a full `next build`.

## 2. Make the bilingual text builders format numbers in the active locale, not hard-pinned cs
- **Impact**: 7/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/insights/aggregate.ts:56`
- **Opportunity**: `insights/aggregate.ts` branches every sentence on `locale === "en"` yet builds the numbers with the cs-bound default exports — an English recommendation renders "ROAS 5,6×", "1 234 567 Kč" and "16,5 %" inside English prose (aggregate.ts:56–58, 152, 176). Same shape in `metrics/meta.ts`: labels are bilingual (`locale === "en" ? m.labelEn : m.label`, meta.ts:33) but every metric's `format: fmtCZK` / `fmtPct` (meta.ts:69, 108, 134) is pinned to cs-CZ/CZK, so the whole KPI registry ignores the locale switcher the app already ships.
- **Why valuable**: The en locale (F4) is the product's scaling pitch and `LOCALES.en` exists precisely for this; today switching to en localizes words but not numbers on the highest-visibility surfaces (KPI cards, recommendations). Distinct from the known "marketing bodies are cs-only" follow-up — these strings are already bilingual, only their numbers aren't.
- **Build sketch**: In `aggregate.ts`, replace the default imports with one `const f = createFormatters(locale)` at the top of each `*Recs(locale)` builder (the `locale` param is already threaded). In `meta.ts`, change metric `format`/`formatCompact` to take `(v, f: Formatters)` — or export a `metricsFor(locale)` factory memoised per locale — and have client call sites pass the instance they already get from `useFormatters()` (`KpiCard`, dashboard). Keep the cs default path byte-identical; add a small `test-unit/format-locale.test.mjs` asserting en output uses "$"/period decimals.

## 3. Add signed-currency helpers (`fmtSignedCZK` / `fmtSignedCZKCompact`) and adopt them at the six hand-signed money sites
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/dashboard/DashboardClient.tsx:435`
- **Opportunity**: The library has `fmtSignedPct` and `fmtSignedInt` but no signed money, so every money-delta site improvises: `{impact.net < 0 ? "−" : "+"}{fmt.fmtCZKCompact(Math.abs(impact.net))}` (DashboardClient.tsx:435–436), ASCII `+{fmt.fmtCZK(m.estValueGain)}` (BudgetMoves.tsx:173, report/[token]/page.tsx:158), `odhad +${fmtCZK(m.estValueGain)}` (campaigns/report-input.ts:147), `(+${fmtCZK(m.estValueGain)} hodnoty)` (api/cron/digest/route.ts:70), and `fmtCZKCompact(impact.net)` which lets a negative through with Intl's ASCII hyphen instead of the library's true minus (campaigns/anomaly-alerts.ts:105, 128).
- **Why valuable**: Money deltas ("+38 000 Kč", "−85 tis. Kč") are the most persuasive numbers in the product (budget moves, alert impact, client digest emails); today their sign glyphs and negative handling differ per surface, and a hand-prefixed `+` renders "+−…" if a gain ever goes negative (the reversal path in control-plane-types.ts:96 negates `estValueGain`).
- **Build sketch**: Mirror the existing `fmtSignedInt` pattern inside `createFormatters` (round-then-sign, true minus U+2212, empty sign for zero): `fmtSignedCZK` over `fmtCZK(Math.abs(n))` and `fmtSignedCZKCompact` over `fmtCZKCompact`, plus an optional `fmtSignedCZKCompactA11y` pair mirroring `fmtCZKCompactA11y`. Re-export from the default cs instance, then replace the six call sites. Add cases to the (new) format unit test.

## 4. Emit locale-parseable numeric cells in the Czech-Excel CSV exports
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/lib/export.ts:13`
- **Opportunity**: `toCsv` deliberately uses semicolons + CRLF + BOM "the separator Czech Excel expects" (export.ts:11–14), but the numeric cells fed into it are period-decimal strings — `r.pno.toFixed(4)`, `r.roas.toFixed(2)` (DashboardClient.tsx:264–274), `Number(c.roas.toFixed(2))` (CampaignTable.tsx:403–404), `csvCell(Number(r.ltvCac.toFixed(2)))` (ltv/compute.ts:326). Czech Excel (decimal comma) imports "0.8500" as text or a date, so ratio columns can't be summed, sorted or charted — the export half-works.
- **Why valuable**: CSV export exists precisely so an agency analyst can pivot the data in Excel; non-numeric ratio columns silently break that workflow for exactly the cs-CZ audience the delimiter choice targets.
- **Build sketch**: Add a `csvNum(n, digits)` helper next to `toCsv` in the existing export seam that renders via the active locale's `fmtDecimal` (comma decimals; `csvField` already quotes cells containing `;` or `,` is not the delimiter — semicolon-delimited, so bare "0,85" needs no quoting but keep `csvField` last). Swap the `toFixed` cells at the three consumers; leave integer cells untouched. Verify a sample export opens as numbers in cs Excel/LibreOffice; full `next build` since two consumers are client components.

## 5. Grow the date/time surface: `fmtDuration`, `fmtTime`, `fmtWeekdayShort` in the factory
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/app/modules/SpeedLeadModule.tsx:199`
- **Opportunity**: Three time-shaped formats are missing from `Formatters`, so consumers roll their own with locale bugs: SpeedLeadModule's private `fmtDuration` hardcodes `"cs-CZ"` (line 203 — wrong under the en locale) plus an `mmss` helper; `primitives.tsx:197` renders LLM latency as `(meta.tookMs / 1000).toFixed(1)` seconds (period decimal); WeekPlanner re-derives the BCP-47 tag itself (`locale === "en" ? "en-US" : "cs-CZ"`, WeekPlanner.tsx:80 — duplicating `LOCALES`) for weekday labels (line 87) and calls `toLocaleTimeString` for scheduled-post times (line 318).
- **Why valuable**: Durations and clock times appear in client-facing surfaces (lead response speed, social scheduling, AI latency badges) and are the one date family `createFormatters` doesn't own — each new module keeps re-inventing them, and the en locale silently gets Czech output.
- **Build sketch**: Add to `createFormatters`: `fmtDuration(totalSec)` (lift SpeedLeadModule's `s`/`min` logic, route the decimal through `fmtDecimal`), `fmtTime(iso)` (memoised `Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit" })` over the existing `parseDate`), and `fmtWeekdayShort(iso)` (`{ weekday: "short", day: "numeric", month: "numeric" }`). Extend the `Formatters` interface + default cs re-exports, then delete the three local implementations (WeekPlanner/primitives already have `useFormatters()` in scope). Client components touched → full `next build`.
