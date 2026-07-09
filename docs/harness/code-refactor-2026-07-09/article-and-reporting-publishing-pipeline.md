# Article & Reporting Publishing Pipeline

> Context #47 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 3, Low: 1)
> Files read: 15

## 1. `ddmm`, `METRIC_LABEL` and the "top-5 anomalies by |z|" selector are copy-pasted verbatim between the snapshot builder and its Article bridge

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/snapshot-to-article.ts:13-25`
- **Scenario**: `snapshot-to-article.ts` defines its own `METRIC_LABEL` (lines 13-19), `ddmm` date formatter (lines 21-25), and inside `snapshotToArticle` (line 181) its own `[...snapshot.anomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5)` "top 5 by magnitude" selector. All three are byte-for-byte identical to code already sitting one file away in `src/lib/snapshot.ts`: `ddmm` (lines 116-119), `METRIC_LABEL` (lines 232-238), and the same `.sort(...).slice(0, 5)` expression (line 199) inside `snapshotToPromptText`. Both files consume the same `Anomaly`/`MetricKey` types from `./metrics` and `./types`, so this isn't backend-dispatcher parity (constraint #2) — it's the same pure formatting logic hand-copied into two sibling files in the same context.
- **Root cause**: `snapshot-to-article.ts` (the deterministic snapshot→Article bridge) was written after `snapshot.ts` (the AI-prompt snapshot builder) and needed the same "format a dated anomaly in Czech" building blocks, so the author copied the three helpers instead of importing them.
- **Impact**: Any future change — adding a metric to `MetricKey` that needs a label, fixing the date format, or changing the "top N" cutoff for anomaly call-outs — must be applied in both files or the AI-prompt grounding (`snapshotToPromptText`) and the published report article (`snapshotToArticle`, which ships to `/clanek/vykon` and every `/m/{slug}` microsite) silently drift apart: the report a client reads and the numbers the AI reasons about would describe a different set of "significant events."
- **Fix sketch**: Move `ddmm` and `METRIC_LABEL` into `snapshot.ts` as the single exported source (it's the lower-level module; `snapshot-to-article.ts` already imports from `./metrics`, so importing `{ ddmm, METRIC_LABEL }` from `./snapshot` is a same-package addition, not a new dependency edge) and delete the local copies in `snapshot-to-article.ts`. Optionally also factor the `.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z)).slice(0,5)` expression into an exported `topAnomalies(anomalies: Anomaly[], n = 5)` helper in `snapshot.ts` and call it from both `snapshotToPromptText` and `snapshotToArticle`.

## 2. `microsite.ts` hand-copies the canonical period-label table instead of resolving it from `PERIODS`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/microsite.ts:61-69`
- **Scenario**: `microsite.ts` defines `const PERIOD_LABEL: Record<number, string> = { 30: "30 dní", 90: "90 dní", 365: "12 měsíců" }` and a local `periodLabel(days)` lookup, used at line 148 to label a microsite's trailing window. The exact same three label strings already exist as the canonical source of truth in `src/lib/metrics/series.ts:21-26` (`export const PERIODS: PeriodDef[] = [{ key: "30d", label: "30 dní", days: 30, ... }, { key: "90d", label: "90 dní", days: 90, ... }, { key: "12m", label: "12 měsíců", days: 365, ... }]`), re-exported through `@/lib/metrics` and already consumed by `periodLabel(p: PeriodDef, locale?)` (series.ts:30-32) across the dashboard (`PeriodHeader.tsx`, `ChannelsSection.tsx`, `AlertsPanel.tsx`).
- **Root cause**: `MicrositeConfig.periodDays` stores a raw day count (30/90/365) rather than a `PeriodDef["key"]` ("30d"/"90d"/"12m"), so `microsite.ts` can't directly index the shared `PERIODS` array by key and reinvented a day-keyed table instead.
- **Impact**: If the canonical label ever changes (e.g. "30 dní" → "posledních 30 dní", or a new period like 180 days is added to `PERIODS`), every microsite page keeps showing the stale, hand-copied text — the two labels have no structural link, only a coincidental one.
- **Fix sketch**: In `microsite.ts`, replace `PERIOD_LABEL`/`periodLabel(days)` with a lookup against the imported `PERIODS` array: `PERIODS.find((p) => p.days === days)?.label ?? \`${days} dní\``. This keeps the fallback for the unlisted case but removes the duplicated literals.

## 3. The AI draft panel's Markdown FAQ section re-implements `faqToMarkdown` instead of calling the sibling export it already imports from

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/article-markdown.ts:103-108`
- **Scenario**: `faqToMarkdown(faq, labels)` (this file) is the shared FAQ→Markdown formatter used by `articleToMarkdown` and by `src/lib/ai/pipeline.ts`'s `draftToMarkdownDoc`. But `src/components/ai/ArticleDraftPanel.tsx:118-121` inlines the identical loop by hand inside its local `draftToMarkdown` function: `if (faq.length > 0) { lines.push(\`## ${labels.faqHeading}\`, ""); for (const f of faq) lines.push(\`**${f.q}**\`, "", inlineToMarkdown(f.a), ""); }` — line-for-line the same output `faqToMarkdown` produces. The same file already imports `blockToMarkdown` and `inlineToMarkdown` from `@/lib/article-markdown` two lines above (line 11), so `faqToMarkdown` was one import away.
- **Root cause**: `draftToMarkdown` assembles Markdown from `composed` blocks (the draft's blocks plus hero/fill images inserted via `composeBlocks`, which has no equivalent in the exported `draftToMarkdownDoc`/`draftBodyMarkdown` from `pipeline.ts`), so the whole function couldn't just be replaced by the pipeline export — but the FAQ tail, which only depends on `draft.faq` (unaffected by image insertion), was copied anyway rather than delegated.
- **Impact**: Low probability but real: a future formatting change to FAQ Markdown (escaping, heading level, spacing) made in `faqToMarkdown` won't reach the AI draft panel's `.md` export, so the exported draft and the published article's `/clanek/markdown` output quietly diverge in a feature whose whole premise is "same serializer everywhere."
- **Fix sketch**: In `ArticleDraftPanel.tsx`, add `faqToMarkdown` to the existing `@/lib/article-markdown` import and replace lines 118-121 with `const faqMd = faqToMarkdown(faq, labels); if (faqMd) lines.push(faqMd, "");` (mirroring how `articleToMarkdown` itself calls it). Leave the block-serialization loop (lines 114-117) untouched — that part legitimately can't delegate to `draftBodyMarkdown` since it walks `composed`, not `draft.blocks`.

## 4. `microsite.ts` mixes Firestore registry CRUD with the pure snapshot→Article view builder, unlike the equivalent report path

- **Severity**: Medium
- **Category**: structure
- **File**: `src/lib/microsite.ts:135-157`
- **Scenario**: `buildMicrositeView` (lines 135-157) is a pure, deterministic function — `scaledDataset(seedScale(slug)) → buildMetricsSnapshot → snapshotToArticle` — with no Firestore dependency, sitting in the same file as `registry()`, `getMicrosite`, `getMicrositeForTenant`, `listEnabledSlugs`, `enableMicrosite` and `disableMicrosite` (lines 57-133), all of which read/write `firestore.collection("microsites")`. Compare `src/app/clanek/vykon/report-article.ts`, which does the structurally identical `buildMetricsSnapshot → snapshotToArticle` composition for the `/clanek/vykon` report as its own four-line, dependency-free module — there is already a house convention for keeping this composition standalone; `microsite.ts` doesn't follow it.
- **Root cause**: the microsite feature was built by extending the pre-existing Firestore registry file rather than factoring the view-building step into its own module, since both pieces needed to live somewhere and the registry file was already there.
- **Impact**: `buildMicrositeView` can't be unit-tested (or reused by a future preview/export route) without a Firestore mock; the file also grows on two unrelated axes (registry fields, view-building logic), which is exactly the "does three jobs" shape this scan flags. No behavior risk today — this is pure reorganization.
- **Fix sketch**: Extract `buildMicrositeView` (plus `PERIOD_LABEL`/`periodLabel`, see Finding 2) into a new `src/lib/microsite-view.ts` with no Firestore import; keep `microsite.ts` as the Firestore-only registry (`MicrositeConfig`, `DEMO_MICROSITE`, `registry()`, `getMicrosite*`, `enableMicrosite`, `disableMicrosite`, `listEnabledSlugs`). Update the two importers (`src/app/m/[slug]/page.tsx`, which already imports both `getMicrosite` and `buildMicrositeView` from the same module today) to import from both files.

## 5. The OG share-card's brand palette is hand-copied from the design-token source into two unrelated renderer files

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/article-og.tsx:38-134`
- **Scenario**: `articleOgImage` hardcodes the brand gradient (`linear-gradient(135deg, #081521 0%, #0d1f31 58%, #0b1b2b 100%)`, line 38) and accent literals `#14b8b1` (line 52), `#6ee3da` (lines 61, 124), `#92a3b3` (lines 88, 107, 112), `rgba(110,227,218,0.18)` (line 101) and `rgba(20,184,177,0.08)` (line 120). This file's own JSDoc says it "clones the root opengraph-image's brand language — the same gradient, teal accent and eyebrow-dot," and indeed `src/app/opengraph-image.tsx` repeats the identical gradient (line 32) and the identical `#14b8b1`/`#6ee3da`/`#92a3b3`/`rgba(110,227,218,0.18)`/`rgba(20,184,177,0.08)` literals (lines 40, 47/59/60, 62, 77, 78). Per `src/lib/design-tokens.ts:20`, `#14b8b1` is itself just the parsed value of the single `--color-brand-500` token declared once in `globals.css`'s `@theme` block — so this hex is independently re-typed in three places today.
- **Root cause**: `next/og`'s `ImageResponse` (satori) can't resolve CSS custom properties, so both OG renderers must bake in literal colors rather than using `var(--color-brand-500)` — and since there was no shared literal-constants module for it, the second file was written by eye-copying the first's values instead of sharing them.
- **Impact**: Cosmetic today (the two cards currently match), but a rebrand of the teal accent requires editing the same 5-6 literals in two unrelated files with nothing to catch a missed one, so the article share card and the portfolio share card could silently stop matching.
- **Fix sketch**: Add a small literal-only `OG_PALETTE` object (e.g. in `article-og.tsx` itself, exported, or a new tiny `src/lib/og-theme.ts`) with `gradient`, `accent` (`#14b8b1`), `accentText` (`#6ee3da`), `mutedText` (`#92a3b3`), `accentBorder`, `accentSoftBg`, and import it from both `article-og.tsx` and `app/opengraph-image.tsx`. Do not wire this into `design-tokens.ts` — that module is explicitly scoped to the server-rendered `/design-system` page and reads `globals.css` off disk at request time, which is unnecessary indirection for two static hex values.
