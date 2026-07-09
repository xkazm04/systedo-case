# LTV, Spend & Cross-Module Insights

> Context #42 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 2, Medium: 2, Low: 0)
> Files read: 8

## 1. `insights/aggregate.ts` shadows the real locale-aware `moduleLabel` with a Czech-only lookalike

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/lib/insights/aggregate.ts:31`
- **Scenario**: `src/lib/projects/modules.ts:508` already exports the canonical `moduleLabel(m: ModuleDef, locale: SupportedLocale): string`, used by `ModulePage.tsx`, `CreateProjectForm.tsx`, `DemoShell.tsx`, `SectionRailNav.tsx` and `ActivityModule.tsx` to render the correct-locale module name. `insights/aggregate.ts:31` defines its own same-named `const moduleLabel = (key: string) => MODULES.find((m) => m.key === key)?.label ?? key;` — a different signature that always returns `m.label` (Czech), never `m.labelEn`. Every other string in this file (title/detail across `eshopRecs`, `appRecs`, `leadgenRecs`, `contentRecs`) is explicitly branched on the `locale` parameter that `collectRecommendations(project, locale)` threads through, but the `moduleLabel` field baked into every `Recommendation` via `rec()` (line 41) ignores it. `ProjectOverview.tsx:169` renders `r.moduleLabel` raw, right next to the correctly-translated `r.title`/`r.detail`.
- **Root cause**: a local convenience helper was named identically to an existing shared utility instead of importing it, and nobody threaded `locale` through when it was added.
- **Impact**: on `locale === "en"` (a real, reachable `SupportedLocale`), every recommendation card in the Overview command center shows an English headline/body with a Czech module-name pill (e.g. "Zisk" instead of "Profit", "Sklad & sezónnost" instead of "Inventory & seasonality") — a visible, live mixed-language bug, not a hypothetical one.
- **Fix sketch**: delete the local `moduleLabel` const at line 31; import `moduleLabel` from `@/lib/projects/modules` instead. Add a `locale: SupportedLocale` parameter to `rec()` (lines 33-42) and pass it at every one of its ~15 call sites (each call site already has `locale` in scope); inside `rec()`, resolve the label via `moduleLabel(MODULES.find((m) => m.key === module)!, locale) ?? module`.

## 2. Dead survival-sparkline geometry cluster in `ltv/compute.ts`

- **Severity**: High
- **Category**: dead-code
- **File**: `src/lib/ltv/compute.ts:211-261`
- **Scenario**: `SparklinePoint`, `SurvivalSparkline`, `survivalSparkline()`, `sparklinePoints()` and the private `round2()` helper are fully implemented and exported, but a repo-wide grep for `survivalSparkline(`, `sparklinePoints(`, `SparklinePoint` and `SurvivalSparkline` across `src/` returns matches only inside this file's own definitions — no component, page, or test imports any of them. `LtvModule.tsx` and `LtvDiagnosisPanel.tsx` (the two consumers of `ltv/compute.ts`) only pull in `cohortTrend`; nothing renders a sparkline today.
- **Root cause**: geometry was built ahead of a sparkline UI that was never wired up (or was wired up and later removed without removing the geometry).
- **Impact**: ~50 lines of exported surface area (2 interfaces, 2 functions, 1 helper) that must be read, type-checked, and reasoned about on every future edit to this file for no run-time benefit; it also invites a second person to "finish the feature" against dead code instead of building it fresh with current requirements.
- **Fix sketch**: delete lines 211-261 (`SparklinePoint`, `SurvivalSparkline`, `survivalSparkline`, `sparklinePoints`, `round2`) from `src/lib/ltv/compute.ts`. If a sparkline is still wanted, reintroduce it alongside its first real caller.

## 3. `csvCell` is independently reimplemented three times with drifted escaping rules

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/ltv/compute.ts:306-311`
- **Scenario**: `src/lib/ltv/compute.ts:308` defines `csvCell(value: string | number)` with `/[",\n\r]/`. `src/lib/activity/compute.ts:37` defines its own `csvCell(value: string)` with `/[",\n]/` — missing `\r` — even though both are RFC-4180 escapers for the same kind of CSV export. A third variant, `csvField` in `src/lib/export.ts:8` (`/[",\n;]/`, quotes on semicolon too since `toCsv` uses `;` as the cs-CZ delimiter), is the one general-purpose CSV builder the codebase already has — and `ltv/compute.ts` already imports `csvNum` from that same file, but not its escaping, so `buildCohortCsv` (line 318) hand-rolls comma-joins + CRLF instead of calling `toCsv`.
- **Root cause**: each module needed "a CSV cell" and wrote its own instead of importing the one already sitting in `src/lib/export.ts`.
- **Impact**: the three copies have quietly diverged (`activity/compute.ts`'s version will corrupt a CSV cell that contains a bare `\r`, since it never escapes it) and any future fix to CSV escaping (e.g. a new char that needs quoting) has to be found and applied in three places instead of one.
- **Fix sketch**: promote `export.ts`'s private `csvField` to an exported `csvCell(value: string | number)` (folding in the `\r` handling from `ltv/compute.ts`'s version). Delete the local `csvCell` from `ltv/compute.ts` and from `activity/compute.ts`; both import the shared one. `buildCohortCsv` keeps its own comma+CRLF join (it deliberately does not use the `;`-delimited `toCsv`), just swaps its escaper for the shared `csvCell`.

## 4. `LTV_CHANNEL_COLORS` hand-duplicates the channel colors already in `performance.json`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/ltv/sample.ts:35-44`
- **Scenario**: `src/data/performance.json` already carries a `color` field per channel entry (`"Google Ads (Search + PMax)": "#1f8f88"`, `"Sklik (Seznam)": "#15324b"`, `"Meta (FB / IG)": "#fb7141"`), loaded via `src/lib/data.ts` / typed in `src/lib/types.ts`. `ltv/sample.ts:37-42` hand-copies the same three channel names to the same three hex values into a second `LTV_CHANNEL_COLORS` constant, with a comment that admits it: "mirroring the metrics channel palette (src/data/performance.json) so the LTV channel dots match the rest of the app." `LtvModule.tsx:185-186` reads this second copy to color the LTV cohort-channel dots.
- **Root cause**: `ltv/sample.ts` is framework-free sample data and doesn't want to import the dataset loader, so the colors were copy-pasted instead of derived.
- **Impact**: the two color tables can silently drift — change a channel's color in `performance.json` (the source everywhere else reads from) and the LTV module's dots keep the old color until someone remembers this second copy exists.
- **Fix sketch**: derive a `channel -> color` map from the `src/data/performance.json` channels array once (e.g. a small exported helper in `src/lib/data.ts`) and have `ltv/sample.ts` import and re-export it instead of the literal `LTV_CHANNEL_COLORS` object; keep `FALLBACK_CHANNEL_COLOR` as the only local literal.

## 5. `channelRecs`'s quick-win predicate is copy-pasted from `OrganicChannels.tsx`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/insights/aggregate.ts:226-244`
- **Scenario**: the "best zero-ad-spend channel" pick — `plan.find((c) => c.effort === "low" && c.fit >= 70) ?? plan[0]` — at `insights/aggregate.ts:231` is byte-for-byte the same predicate as `channels.find((c) => c.effort === "low" && c.fit >= 70) ?? null` in `src/components/app/modules/OrganicChannels.tsx:166`. Both consume `channelPlanForProject(project)` / the same channel-plan shape from the organic-channels module and independently decide what counts as a "quick win" (effort `"low"`, fit `>= 70`).
- **Root cause**: the Overview command-center recommendation and the Organic Channels module's own "featured" pick were built separately against the same data shape instead of sharing a selector.
- **Impact**: low today (both copies agree), but the `70` fit threshold and `"low"` effort gate are a product decision, not incidental logic — a future tuning of "what counts as a quick win" only fixed in one of the two call sites will make the Overview recommendation and the module's own highlighted channel disagree.
- **Fix sketch**: add an exported `pickQuickWinChannel(plan: ChannelPlanEntry[])` to the organic-channels module (its natural home, since it owns the channel-plan shape and is already imported by both consumers) and have `insights/aggregate.ts:231` and `OrganicChannels.tsx:166` both call it instead of repeating the predicate.
