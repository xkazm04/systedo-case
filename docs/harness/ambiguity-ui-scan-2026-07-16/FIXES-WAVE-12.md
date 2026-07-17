# Wave 12 — Metrics engine, report metrics, performance dashboard, public demo pages

Module-clustered tail wave over the metrics/report/report-metrics/dashboard/public-page
cluster. **13 findings fixed, 1 skipped-with-reason** (the formatter half of metrics #5).
tsc clean, `npm run test:unit` **1678/1678** (baseline 1672 + 6 new), 0 regressions, LLM
gate unchanged (no tool schema/prompt touched — the grounding-writer change is downstream
of the golden snapshots and re-proved automatically).

## Commits

| Commit | Finding(s) | Scope |
|--------|-----------|-------|
| c665371 | metrics #1 (High) | window full-series anomalies in the AI grounding |
| a44fbe5 | metrics #2 (High) + #3 (M) | present-only ratio baseline + distinct-day anomaly count |
| 11cb400 | metrics #4 (M) | pacing prescription divides by future days, not gap days |
| 7838dc5 | metrics #5 (Low, part a) | Czech AOV description no longer opens in English |
| 471f18b | report-metrics #3 (M) + #5 (M) | correct SYNC_DAYS comment + classify empty-window sync |
| 6363951 | report-metrics #4 (M) | log unparseable blobs and store-read failures |
| de86218 | dashboard #4 (M) | localize ReportChat error strings |
| f751998 | dashboard #5 (M) | centralize CSV export filename, drop hardcoded brand |
| 60630c7 | demo-pages #2 (M) | /kvalita-modelu uses Container, not bespoke w-4/5 |
| db683b6 | demo-pages #3 (M) | /cena metadata + mailto follow the page locale |
| f34cb70 | demo-pages #4 (M) | centralize JSON-LD emission with unconditional `<` escape |
| ddf261c | demo-pages #5 (M) | shared FaqSection (deep-link/print/rich answers) |

## Narratives

**metrics #1 — grounding quoted out-of-period anomalies.** `MetricsSnapshot.anomalies`/
`trends` are full-series (the detector scans the whole daily feed), but `snapshotToPromptText`
headlined the top-5 by |z| as "Významné události v období" without windowing, so a
months-old spike could be grounded as this period's event (ddmm drops the year). Documented
both fields as full-series, added `Snapshot.asOf`, and filtered the grounding's anomaly block
to `[asOf-(days-1), asOf]` — exactly as `snapshot-to-article` already did. New test proves an
out-of-window spike is dropped while an in-window one survives.

**metrics #2 — ratio baseline zero-pollution.** The CTR/CPC baseline sliced the raw `adj`
window including absent days, which enter as `ctr(0,0)=0` placeholders. A paid channel that
launches mid-series (or runs some days only) halved the true mean and inflated std → real
launch days read as spikes, genuine collapses hid under the bar. Now the baseline **and** the
weekday weights are built from present days only, requiring ≥⌈window/2⌉ present days and
recalibrating the z bar for the actual sample size. Tests: a steady mid-launch channel fires
no false spike; a real collapse still fires.

**metrics #3 — AnomalyImpact.count double-counted bad days.** An outage day fires both a
revenue and a cost anomaly; `count` (documented "days carrying a monetary effect") incremented
per record. Now counts distinct dates via a `Set`.

**metrics #4 — pacing prescription divided by phantom days.** `daysRemaining` counts missing
interior days (already behind "today") as remaining — right for the projection weight, wrong
for `requiredDailyRevenue`/`recentDailyRevenue`/`impliedExtraDailySpend`, which understated the
required pace so a barely-recoverable month read as comfortable. Added `futureDays = daysInMonth
- dayOfMonth(last)` for those three fields, keeping present-count `daysElapsed` for prorating/
weights and the projection band. Test: gappy May, 20 present days, latest = 25th → required
divides by 6 future days, not 11.

**metrics #5 — cs AOV copy opened in English.** Fixed. The formatter-fallback half is skipped
(reason below).

**report-metrics #3 — SYNC_DAYS comment contradicted the YoY gate.** The comment claimed 400d
"covers the 365d report plus its prior-year delta", but YoY needs ~730d and recap-context gates
it behind `HISTORY_MIN_DAYS=700`, so live projects never unlock it. Rewrote the comment to state
the real arithmetic and warn against lowering the honesty gate. (Raising SYNC_DAYS is a quota
decision — see sign-off.)

**report-metrics #4 — corrupt blob degraded silently.** A parse failure returned null in both
backends → read as "never synced" → silent revert to sample data, no log. Added `console.error`
in both store backends' parse catch and in `resolveReportDataset`'s store-read catch.

**report-metrics #5 — zero-row sync keeps stale blob invisibly.** Documented the keep-last-known-
good decision on the `rows.length === 0` branch and added `SyncResult.emptyWindow` so a caller
can distinguish a dormant account from a broken integration. (Caller behavior unchanged — see
sign-off.)

**dashboard #4 — ReportChat error strings hardcoded Czech.** `useReportChat` had no access to
the component's `useT(T)`, so its two failure fallbacks were inlined Czech. Added
`errorSend`/`errorGeneric` keys and thread the resolved strings into the hook.

**dashboard #5 — CSV filename baked the brand as a magic string.** Two independent template
literals (`adamant-kanaly-…`, `adamant-vyvoj-…`) with no baseline in the name. Added one
`exportFilename(kind, periodKey, baseline?, prefix?)` helper prefixed from `SITE_NAME`, folding
the baseline in; both call sites use it.

**demo-pages #2 — /kvalita-modelu bespoke w-4/5 shell.** Added a `narrow` (max-w-5xl) size token
to `Container` (chosen via a token, not a className override, so it can't lose a Tailwind
max-w-* tie) and used it + `max-w-3xl` on the intro.

**demo-pages #3 — /cena English metadata + Czech mailto.** Converted the static English
`metadata` to `generateMetadata()` reading the `T` table (with a `/cena` canonical); moved both
mailto subjects into `T`, encoded per locale.

**demo-pages #4 — JSON-LD escaping applied on one page of four.** Extracted a `<JsonLd data>`
component that always applies the loss-free `<` → `<` escape; used on all four pages,
deleting the raw inline scripts.

**demo-pages #5 — FAQ accordion cloned + degraded in /clanek/vykon.** Extracted a shared
`FaqSection` (stable ids, FaqHashOpen, scroll-mt, print:break-inside-avoid, rich inline
rendering, optional `withPermalinks`); both /clanek and /clanek/vykon consume it, so the report
page regains deep-links, print answers, and links inside answers.

## Skipped (with reason)

- **metrics #5 part (b)** — the formatter-fallback lint-friendly wrapper. Every current UI call
  site (KpiCard, TrendChart) already threads `useFormatters()`, so a required-`Formatters`
  wrapper would be an unused, speculative export. Fixed only the copy drift, which is the real
  user-visible bug.

## New tests (6)

- `metrics-ratio-anomalies`: mid-launch steady channel fires no false ratio spike; real collapse still fires.
- `metrics-anomalies`: `anomalyImpact.count` counts distinct days.
- `metrics-pacing-runrate`: gappy month divides the prescription by future days.
- `snapshot-grounding-anomaly-window` (new file): grounding drops an out-of-window anomaly, keeps an in-window one.
- `export-csv`: `exportFilename` is product-branded and folds in the baseline.

## Behavior changes needing sign-off

1. **AI grounding text** now omits anomalies that fall outside the reported period window
   (previously the top-5 by |z| across the whole series). This is the intended honesty fix, but
   it changes the recap/analysis grounding a model sees — recap wording can shift for short
   windows with old spikes.
2. **Pacing steering numbers** (`requiredDailyRevenue`/`recentDailyRevenue`/`impliedExtraDailySpend`)
   now read higher on **gappy months** (divide by future days, not remaining incl. interior gaps).
   Gapless months are unchanged.
3. **CSV filenames** now include the baseline suffix, e.g. `adamant-vyvoj-90d-previous.csv` /
   `-yoy.csv` (was `adamant-vyvoj-90d.csv`). Prefix still resolves to `adamant` (= SITE_NAME).
4. **SYNC_DAYS stays 400** — raising it to ~740 to unlock live YoY grounding is a quota/cost
   decision left for the team (comment now documents this).
5. **SyncResult.emptyWindow** is added but no caller acts on it yet — the empty-window sync still
   returns `ok:false` with the same error copy; wiring cron/manual-sync behavior (offer
   clearReportMetrics, stop counting empty as a hard failure) is a product decision.
6. **New console.error logs** on the report-metrics corrupt-blob / store-failure paths (previously
   silent) — expect these lines in operator logs where corruption or store hiccups occur.

## Patterns

- **Two consumers, two interpretations of one "full-series" field** (metrics #1) — the fix is to
  document the field's scope once and make every "in period" consumer window it; `snapshot-to-article`
  already had the right pattern to copy.
- **"Not measured" collapsed into "measured as zero"** (metrics #2) — a presence predicate must
  gate the *baseline* too, not only the scored point.
- **One variable serving two meanings** (metrics #4: daysRemaining = projection weight AND
  actionable future days) — split into two locals.
- **Point-fix security hardening on one of N siblings** (demo #4) — centralize the emission so the
  safe path is the only path.
- **Clone-before-upgrade divergence** (demo #5) — a copy-pasted block silently misses every later
  improvement; extract a shared component.
- **Tailwind class-override footgun** (demo #2) — `max-w-5xl` appended after a hardcoded `max-w-6xl`
  can lose the specificity tie; pick the token inside the component instead.
