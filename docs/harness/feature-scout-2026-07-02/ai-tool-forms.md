# Feature Scout — AI Tool Forms (Ads, Brief, Analysis) (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/components/ai/AdGenerator.tsx, src/components/ai/ContentBriefGenerator.tsx, src/components/ai/PerformanceAnalyst.tsx, src/lib/ad-strength.ts

## 1. Make generated ad assets editable in place, with live Ad Strength and preview recompute
- **Impact**: 8/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/ai/AdGenerator.tsx:566`
- **Opportunity**: Every generated headline/description/callout renders as a read-only `TextRow`. When an asset is over-limit (red row) or just weak, the user's only path is copy → edit elsewhere → lose the strength meter, the RSA preview, the CSV export and the A/B save — the tool's whole feedback loop dies at the exact moment the user wants to act on it.
- **Why valuable**: Turns a one-shot generator into a workbench: fix the one over-limit headline, watch the "V rámci limitů znaků" factor flip to pass and the score climb past the 64 cap — the most convincing live demo of the Ad Strength system the app already has.
- **Build sketch**: Keep an `edited: AdResult` state initialized from `data.result` when a run completes (reset key on new generation, plus a "Vrátit vygenerované" undo). Swap `TextRow` for an editable variant (inline `<input>`/`<textarea>` reusing `CharCount` + the over-limit row tinting from `primitives.tsx`). `computeAdStrength` (src/lib/ad-strength.ts) is pure and already memoized on `[r, locale]` — just memoize on `edited` instead; point `RsaPreview`, `copyAllText`, `exportAdsCsv` and `saveVariant` at `edited` so every downstream artifact reflects the fixes. No server or gate file touched.

## 2. Export a Google Ads Editor–ready CSV (Headline 1–15 / Description 1–4 columns)
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: integration
- **File**: `src/components/ai/AdGenerator.tsx:350`
- **Opportunity**: `exportAdsCsv` emits a generic Type/Text/CharCount listing — fine for a spreadsheet, but not importable anywhere. Google Ads Editor (and the Ads UI bulk upload) expects one row per ad with `Campaign; Ad group; Headline 1..15; Description 1..4; Path 1` columns; today the user must hand-transpose the listing into that shape.
- **Why valuable**: "Download → import into Google Ads Editor → launch" is the shortest possible story from AI output to a live campaign, and it lands squarely on the tool's selling point (launch-ready assets). Agencies do this transposition manually today.
- **Build sketch**: Add a second export next to the existing button ("CSV pro Ads Editor"): build one wide row — campaign/ad-group seeded from `form.product`, headlines spread into `Headline 1..15`, descriptions into `Description 1..4`, `Path 1` from the existing `slugify` — via the same `toCsv`/`downloadText` seam (`src/lib/export.ts`), plus a second keywords sheet (`Keyword; Match type`). Pure client, one new pure row-builder that's trivially unit-testable in `test-unit/`.

## 3. Cache one analysis per period and label results with the period they cover
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/ai/PerformanceAnalyst.tsx:72`
- **Opportunity**: `useAiTool` persists exactly one result per mode (`resultKey("analysis")`, useAiTool.ts:24), so running 30d after 90d silently overwrites the 90d analysis, and a restored result renders with no indication of which period it covers — the picker can say "30 dní" while the text below analyzes 12 months. Period is the tool's only input, yet results aren't keyed by it.
- **Why valuable**: Analysts naturally flip between horizons ("how does the quarter compare to the year?"); per-period slots make switching instant and free (no re-generation, no lost result) and remove the misleading period/result mismatch.
- **Build sketch**: Extend `useAiTool(mode)` with an optional variant suffix — `useAiTool<AnalysisResult>("analysis", period)` → storage key `systedo.ai.result.analysis.90d` (default suffix "" keeps every other tool byte-compatible; the restore effect already re-runs on key change). In PerformanceAnalyst, render an `analysisPeriodLabel(...)` pill next to `ResultMeta` sourced from the stored slot, and pass `period` into the hook so selecting a period restores its cached analysis. `useAiTool.ts` is client-side, not gate-hashed.

## 4. Let the RSA preview rotate through headline/description combinations
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/ai/AdGenerator.tsx:251`
- **Opportunity**: The preview hard-slices the first 3 headlines + first 2 descriptions, so the user only ever sees one of the hundreds of combinations Google actually serves — the badge even says "Ukázková kombinace", but there's no way to see a second one. The whole point of an RSA (and of generating 8+ headlines) is rotation.
- **Why valuable**: One click ("Další kombinace") makes the rotation concept tangible — the user sees how their short and long headlines compose, which pairs read awkwardly, and why the length-variety factor in the strength meter matters.
- **Build sketch**: Keep a combination index in `RsaPreview` state and derive the shown assets from a deterministic sampler (e.g. stride/rotation over the filtered arrays), advancing `(i + 1) % nCombos` on click — no `Math.random()` in render (react-hooks/purity landmine). Optionally list which headline numbers are in the current combo so it ties back to the numbered rows below. Purely presentational; no data or API change.

## 5. Give the Sklik platform its own Seznam-style ad preview
- **Impact**: 5/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/ai/AdGenerator.tsx:254`
- **Opportunity**: The form has a first-class Google/Sklik platform toggle, but switching to Sklik only swaps the preview's caption (`isGoogle` picks `rsaPreviewLabelGoogle` vs `rsaPreviewLabel`) — the rendered card stays a Google SERP mock (Sponzorováno line, Google-style favicon circle and link colors). The Sklik half of the "Google Ads i Sklik" promise is label-deep.
- **Why valuable**: Czech agencies run Sklik alongside Google Ads; a recognizable Seznam.cz-styled result (its "Reklama" tag and link treatment) makes the platform toggle feel real for the exact audience this cs-CZ demo targets and rounds out the tool's differentiator.
- **Build sketch**: Branch inside `RsaPreview` on `platform`: a `SklikVariant` block styled after a Seznam.cz search result (green/labelled "Reklama" pill instead of "Sponzorováno · Mionelo", Seznam link color, 2 headlines joined per Sklik's kombinovaná reklama) with the badge copy noting it's a stylized approximation, same as the Google mock. Reuses the existing `title`/`desc`/`slugify` derivations; a couple of new `T.cs`/`T.en` keys. No limits/contract change, no gate file.
