# Feature + Moonshot Scan — Czech Formatting Helpers

> Context: ctx_1781547850596_qy28ckw
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

Grounding: `src/lib/format.ts` exports a single hard-coded `LOCALE = "cs-CZ"` and `currency: "CZK"` consumed in **199 occurrences across 19 files** — both the visual layer (`DeltaBadge.tsx`, `KpiCard.tsx`, `ChannelTable.tsx`, `CampaignTable.tsx`, `GoalPacing.tsx`, `TrendChart.tsx`, dashboard/campaign clients) AND the AI-prompt layer (`snapshot.ts` `snapshotToPromptText`, `campaigns/report-input.ts` `metricsLine`/`buildCampaignPrompt`/`buildOverallPrompt`). The app shell is also pinned to one locale: `app/layout.tsx` `lang="cs"`. So `format.ts` is the single chokepoint through which both pixels and prompts speak Czech — which is exactly why a locale layer here makes the whole product multi-market.

---

## 1. Locale-parameterised formatting core (the multi-market chokepoint)
- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: feature
- **Effort**: L (>3d)
- **File**: `src/lib/format.ts` (whole module) → consumers in 19 files
- **Scenario**: The case study is a Czech-only artefact. A recruiter or client outside CZ sees "1 234 567 Kč" and "16,5 %" and cannot evaluate the work; the product's addressable market is one country. Every number — on screen and inside every Gemini/Claude prompt — flows through this one file, so the locale is changeable in exactly one place.
- **Opportunity**: Turn `format.ts` from a module of constants into a factory: `createFormatters(locale: SupportedLocale): Formatters` where `SupportedLocale` carries `{ intlLocale: "cs-CZ"|"en-US"|"de-DE", currency: "CZK"|"EUR"|"USD" }`. Keep the current named exports as a default `cs` instance (`export const { fmtCZK, fmtPct, ... } = createFormatters(CS)`) so the 199 call-sites compile unchanged, then expose a `useFormatters()` hook / server `getFormatters(locale)` for locale-aware rendering. The genitive-month logic in `fmtRange`/`rangeParts` and the cascading `fmtRelative` already generalise across Intl locales for free.
- **Impact**: One ~1-day refactor unlocks English, German, EUR/USD across the entire dashboard, campaign console, article, and AI prompts simultaneously — converting a single-market portfolio piece into a "ships to any market" demonstration, which is itself the strongest thing a marketing-analytics product can show a buyer.
- **Implementation sketch**: (1) Add `src/lib/locale.ts` with `SupportedLocale` + a `LOCALES` registry. (2) Wrap the body of `format.ts` in `createFormatters(cfg)`, replacing literal `LOCALE`/`"CZK"` with `cfg.intlLocale`/`cfg.currency`. (3) Re-export the `cs` instance's members to preserve every existing import. (4) Thread the chosen locale into `snapshot.ts`/`report-input.ts` so prompts render in the target language. (5) Make `app/layout.tsx` `lang` follow the active locale.

## 2. Locale/currency switcher in the UI (prove the multi-market layer)
- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/components/site/Nav.tsx` (+ a new `LocaleToggle.tsx` alongside `ThemeToggle.tsx`)
- **Scenario**: There is already a working `ThemeToggle.tsx` in the site chrome — the pattern for a persisted global toggle exists. Once #1 makes formatting locale-parameterised, a visitor still has no way to *see* it; the capability is invisible.
- **Opportunity**: Ship a `cs / en` (and optionally `€ / Kč`) switcher mirroring `ThemeToggle` (cookie + `<html lang>` swap), re-rendering the dashboard/campaign numbers through the locale-aware formatters from #1. Convert hard-coded currency display amounts via a single FX constant so "1 234 567 Kč" becomes "€48,920" — purely presentational, no data migration.
- **Impact**: Makes the moonshot tangible in 5 seconds for any reviewer: flip a toggle, watch every KPI card, table, delta badge and chart relabel instantly. This is the headline "wow" moment that sells the underlying architecture.
- **Implementation sketch**: Copy `ThemeToggle.tsx` → `LocaleToggle.tsx`, persist `locale` cookie, add a `LocaleProvider` context returning the `createFormatters` instance; consume it in `DashboardClient.tsx`/`CampaignsClient.tsx` where `fmt*` is imported. Add an FX map (`CZK→EUR/USD`) in `locale.ts`.

## 3. Unit-aware compact formatting (per-mille, bytes-style scaling, explicit units)
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: S (<1d)
- **File**: `src/lib/format.ts` (`fmtCompact`, `fmtCZKCompact`, `fmtPct`, `fmtMultiple`)
- **Scenario**: Marketing analytics constantly shows rates that read awkwardly as plain percent — CTR/CR of 1,8 % is fine, but conversion deltas, "per 1000 impressions" (CPM), and sub-percent figures (`fmtPct(c.cr, 2)` already uses 2 digits for this reason in `report-input.ts`) would be clearer with explicit units. Compact output ("12,4 tis.") also drops the unit entirely.
- **Opportunity**: Add `fmtPerMille` (‰ for fine-grained rates), `fmtUnit(n, unit)` wrapping `Intl.NumberFormat` `style:"unit"`, and a `fmtCompactUnit` that appends an explicit unit token to compact output (e.g. "12,4 tis. proklik."). Extend `CompactA11y` so the aria `label` always carries the unit word in full.
- **Impact**: Tighter, less ambiguous tables and chart axes; richer prompt blocks (the model sees "CPM" vs a bare number). Low-risk, builds directly on the existing Intl wrappers and the established compact/a11y pairing.
- **Implementation sketch**: Add `fmtUnit`/`fmtPerMille`/`fmtCompactUnit` next to `fmtCompact`; reuse the `CompactA11y` interface; adopt in `ChannelTable.tsx` and the CPM/CTR lines of `report-input.ts` `metricsLine`.

## 4. Numeric value-range & confidence-interval formatter
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: S (<1d)
- **File**: `src/lib/format.ts` (sibling to `fmtRange` which already collapses *date* ranges)
- **Scenario**: `fmtRange` elegantly collapses date ranges sharing month/year, but there is no equivalent for *numeric* ranges. Forecasts, goal-pacing bands (`GoalPacing.tsx`), and AI estimates ("obrat 1,2–1,6 mil. Kč") currently have to concatenate two `fmtCZK` calls manually, duplicating the dash/spacing/minus-sign conventions this module exists to centralise.
- **Opportunity**: Add `fmtCZKRange(from, to)`, `fmtPctRange(from, to)`, `fmtIntRange(from, to)` that share the unit/symbol once ("1,2–1,6 mil. Kč", "14–18 %"), mirroring how `fmtRange` shares the month name. Add `fmtPlusMinus(center, margin)` for "16,5 % ± 1,2 pb" pacing bands.
- **Impact**: Consistent forecast/band rendering everywhere, prevents drift in dash/minus conventions, and gives the AI prompts a clean way to express uncertainty ranges instead of inventing punctuation.
- **Implementation sketch**: Implement using the existing `Intl.NumberFormat` instances; for currency use `formatToParts` to emit the symbol once (same `formatToParts` technique already used in `rangeParts`). Adopt in `GoalPacing.tsx` and forecast lines of `snapshot.ts`.

## 5. Locale-consistency contract test + AI-prompt locale guarantee
- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `src/lib/format.ts` + `src/lib/snapshot.ts` (`snapshotToPromptText`) + `src/lib/campaigns/report-input.ts`
- **Scenario**: The module's whole premise — "every page and every AI prompt renders numbers identically" — is asserted in the file header comment but nothing enforces it. As locales multiply (#1), the genuine risk is a prompt going out with mixed conventions (Czech NBSP thin-space "1 234" vs English "1,234"), which silently corrupts the model's numeric reasoning and any number it echoes back to the user. There is no test directory guarding this.
- **Opportunity**: A "format contract" suite that (a) snapshots golden output for every `fmt*` across each `SupportedLocale`, (b) asserts `snapshotToPromptText`/`buildOverallPrompt` contain **zero** raw `toLocaleString`/`Math.round` numbers — i.e. every number in a prompt came through a `fmt*` helper — and (c) verifies the prompt's number locale matches the requested output language. The moonshot: this becomes a *self-verifying localisation guarantee* — the codebase can claim "the AI always speaks the user's number language" because CI proves it.
- **Impact**: Turns a fragile comment into an enforced invariant, makes the multi-locale expansion (#1/#2) safe to ship, and is itself a credibility signal in a portfolio piece ("formatting is contract-tested across locales, including inside LLM prompts").
- **Implementation sketch**: Add Vitest specs (the project already standardises on Vitest) under `src/lib/__tests__/format.spec.ts` with per-locale golden tables; add a prompt-lint test that regexes `snapshot.ts`/`report-input.ts` output for digit groups not produced by `fmt*`; wire into the existing test script.
