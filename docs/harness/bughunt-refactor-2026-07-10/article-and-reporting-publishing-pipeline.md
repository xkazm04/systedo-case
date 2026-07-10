# Article & Reporting Publishing Pipeline

> Total: 5
> Critical: 1 · High: 1 · Medium: 1 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. New microsites are published as Google-indexed, undisclosed "proof of results" while always rendering scaled demo data

- **Severity**: Critical
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/microsite.ts:113`
- **Scenario**: Any signed-in user POSTs a client name to the shipped `POST /api/microsite` route (`src/app/api/microsite/route.ts:61`). `enableMicrosite` builds the `MicrositeConfig` (lines 113-124) but never sets `illustrative`, so it persists as `undefined`. The public page `/m/{slug}` reads that flag: `robots: config.illustrative ? {index:false} : {index:true,...}` (`src/app/m/[slug]/page.tsx:60`) and only renders the "Ilustrativní ukázková data — nejde o reálné výsledky klienta" disclosure banner `if (config.illustrative)` (line 133). With `illustrative` falsy, the page is therefore `index:true` **and shows no disclosure**. But `buildMicrositeView` (microsite.ts:144) *always* computes numbers from `scaledDataset(seedScale(config.slug))` — the scaled case-study series — with no code path to a tenant's real synced data.
- **Root cause**: The system has no live-data wiring yet (the `MicrositeConfig` comments call `tenant` "reserved for live-data wiring"), yet `enableMicrosite` defaults the safety flag to "this is real data" (falsy) instead of "this is illustrative" (true). The safe default is inverted: until real data exists, every microsite is demo data.
- **Impact**: A user can publish a search-engine-indexed page presenting fabricated/scaled performance numbers as a named real client's genuine results, with the demo disclosure suppressed — exactly the failure the page's own comment warns against ("demo numbers must not be published as search-findable proof"). Trust / reputational / false-advertising exposure on a public, indexed URL.
- **Fix sketch**: In `enableMicrosite`, set `illustrative: true` on the created `cfg` (until a live-data source is actually wired), so new microsites default to `noindex` + disclosed. Only flip it to `false` from an explicit "this tenant has connected live Ads data" path.

## 2. Anomaly/trend sections are computed over the *entire* dataset but labeled and titled as events "in the period"

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/snapshot-to-article.ts:180`
- **Scenario**: For a 30-day microsite/report, `buildMetricsSnapshot(data, {days:30})` slices `current`/`previous` totals to the window — but `anomalies` come from `detectAnomalies(data.daily, ...)` and trends from `detectTrends(data.daily)` (`src/lib/metrics/snapshot.ts:77-78`), both of which scan the **full** `data.daily` series (see `anomalies.ts:56`, `for (let i = window; i < daily.length; i++)`), never restricted to the period. `snapshotToArticle` then emits a section titled "Významné události **v období**" and lists the top-5 (lines 180-186), and `snapshotToPromptText` feeds the model "Významné události **v období**" + "Setrvalé trendy" (`snapshot.ts:198-224`) — all under a report whose title/perex say "za posledních 30 dní" (lines 57-61). The `ddmm` dates carry no year, so a spike from months (or a year) earlier renders as e.g. "14.5." next to a "last-30-days" headline.
- **Root cause**: `MetricsSnapshot.anomalies`/`trends` are whole-series artifacts, but the publishing bridge assumes they are period-scoped and copies the period language onto them.
- **Impact**: Public reports (`/clanek/vykon`, every `/m/{slug}` microsite) and the AI grounding present out-of-period events as if they happened in the reporting window — wrong/misleading data on client-facing pages and mis-grounded AI narration.
- **Fix sketch**: Either filter the anomaly/trend arrays to `snapshot.period.days` (drop points whose `date` predates `asOf − periodDays`) before rendering, or relabel the sections honestly ("Významné události v datech" / include the year in `ddmm` for out-of-window dates). Apply consistently in both `snapshot-to-article.ts` and `snapshot.ts`.

## 3. A paid channel with zero revenue is invisible to the report's best/worst selection, producing misleading recommendations

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/snapshot-to-article.ts:52`
- **Scenario**: `paid = channels.filter(ch => ch.cost > 0)`; `best = sort by roas desc`; `worst = sort by pno desc` (lines 52-54). Channel `pno`/`roas` come from `safe()` which returns **0** on divide-by-zero (`channels.ts:40,43`). So a channel spending budget with `revenue === 0` gets `roas = 0` (never chosen as "best" — fine) but also `pno = 0`, the *lowest* possible, so it is never chosen as "worst" — even though a paid channel returning nothing is the single worst performer. The report's "Na co si dát pozor" / "Optimalizovat {worst}" (lines 92-116) then points at a moderate-PNO channel while the budget-burning channel is silently praised as most efficient.
- **Root cause**: `safe(cost, 0) → 0` conflates "no revenue" (infinitely bad efficiency) with "perfect efficiency" (0 % PNO); the selector trusts `pno` as a pure ordering key.
- **Impact**: Latent today for the shipped case-study data (all channels have positive revenue shares), but any zero-revenue paid channel (a paused/newly-launched channel, or future synced data) yields a client-facing report that recommends optimizing the wrong channel and hides the actual money sink.
- **Fix sketch**: Treat `cost > 0 && revenue <= 0` channels as worst-case explicitly (e.g. sort worst by `revenue > 0 ? pno : Infinity`, or filter to `revenue > 0` before ranking and surface zero-return paid channels as a separate risk line).

## 4. Drop-anomaly sentences render a redundant negative sign against "pod očekáváním" ("−30 % below expectation")

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/snapshot-to-article.ts:33`
- **Scenario**: In `anomalySentence`, the `"drop"` case returns `${ddmm(a.date)}: ${what} ${fmtSignedPct(devPct)} pod očekáváním` (lines 33-34). For a drop, `devPct = (observed − expected)/expected` is negative, so `fmtSignedPct` prints a leading "−": the reader sees e.g. "návštěvy −30 % pod očekáváním" — a signed value combined with the word "below", which double-negates (literally "30 % below below expectation"). The `"spike"` case (line 32) reads correctly because its `devPct` is positive.
- **Root cause**: The wording assumes `fmtSignedPct` yields a magnitude, but it yields a signed value; only the spike branch's positive sign happens to align with its "nad očekáváním" wording.
- **Impact**: Cosmetic-but-wrong copy on public reports/microsites — a drop reads with a confusing sign. No numeric corruption.
- **Fix sketch**: Use the absolute magnitude with the directional word (`fmtPct(Math.abs(devPct))` + "pod očekáváním"), mirroring how the prompt-text variant already uses a neutral "vs. očekávání" phrasing (`snapshot.ts:208`).

## 5. The "worst paid channel" selector is duplicated verbatim between the Article bridge and the report-chat helper

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/report-chat.ts:21`
- **Scenario**: `report-chat.ts:21-22` computes `const paid = s.channels.filter(c => c.cost > 0); const worst = [...paid].sort((a,b) => b.pno - a.pno)[0];` — byte-identical to `snapshot-to-article.ts:52,54`. Both derive the same "highest-PNO paid channel" to name it in client-facing output (the report's risk bullet vs. the chat's opening chip). This is NOT the same duplication the 2026-07-09 code_refactor report flagged: its Finding 1 covered the `ddmm`/`METRIC_LABEL`/"top-5 anomalies by |z|" trio between `snapshot.ts` and `snapshot-to-article.ts`; the worst-paid-channel selector between `snapshot-to-article.ts` and `report-chat.ts` is not named anywhere in that report.
- **Root cause**: Both files independently needed "the channel that most drags efficiency" and hand-rolled the same filter+sort instead of sharing a helper. It also inherits the zero-revenue blind spot from Finding 3 in both places.
- **Impact**: Low — a future fix to the worst-channel definition (e.g. the Finding 3 zero-revenue guard) must be made in two files or the report and the chat chip disagree about which channel is weakest.
- **Fix sketch**: Add a tiny pure helper, e.g. `worstPaidChannel(channels: ChannelRow[]): ChannelRow | undefined`, near the shared metrics/channels module (or in `snapshot.ts`) and call it from both `snapshotToArticle` and `reportChips`; fixing Finding 3 there fixes both callers at once.
