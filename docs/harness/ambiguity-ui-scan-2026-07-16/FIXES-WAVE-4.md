# Wave 4 fixes — sample-vs-live honesty

Theme: real data labeled demo/sample, or demo/scaled data labeled live/real. Each surface
was made to tell the truth the way the codebase already distinguishes live vs sample
(the `resolve*` live-over-sample seams, the `ModulePage sample` gutter, per-source tags).

## Commits

| # | Finding | Commit | Scope |
|---|---------|--------|-------|
| 1 | campaign-perf-pages #1 | `ea8f4b3` | `/vykon` page |
| 2 | content-creative-keyword-pages #1 | `31260ea` | produktova-kreativa page + catalog/load |
| 3 | article-publishing-pipeline #2 | `54bc5c1` | snapshot-to-article + 2 callers |
| 4 | local-seo-mappack #2 | `12f9158` | local-signals/resolve |
| 5 | local-seo-pages #1 | `1875696` | sklad-sezonnost page |
| 6 | ltv-spend-insights #1 | `1ba3e5f` | insights/aggregate |
| 7 | ppc-patterns-targets #2 | `78b9474` | patterns/extract |
| 8 | report-metrics-ingestion #2 | `eba069c` | report-metrics/build |

All 8 fixed; none skipped.

## Narratives

1. **/vykon split-brain** — the flagship performance dashboard was hard-pinned to
   `getProjectDataset` + `sample`, so a live-synced tenant read seeded KPIs that
   contradicted `/zisk` and the monthly report (both on `resolveReportDataset`). Routed
   `/vykon` through the same seam with `sample={!resolved.live}`. Page-only; no test.

2. **False sample banner over a real catalog** — `produktova-kreativa` hardcoded
   `ModulePage sample`, mislabeling a user's persisted catalog as illustrative. Added
   `loadProjectCatalogWithSource` / `loadProductsForWithSource` (report `"catalog"` vs
   `"sample"`, honoring the null-vs-`[]` contract) and passed `sample={source === "sample"}`
   like `experimenty-lp`.

3. **Article self-certifies "reálná" over demo data** — added a
   `provenance: "synced" | "illustrative"` param (default illustrative — no caller can
   accidentally over-claim). Perex + FAQ wording now discloses illustrative data
   ("Nejde o reálná data klienta"), so the claim travels into the Markdown twin too. Both
   current callers (microsite via `config.illustrative`, `/clanek/vykon` case study) pass
   illustrative.

4. **Seeded rank under a "live" label** — `resolveCoverage` kept the seed's hash-seeded
   rank on live combos; the coverage import carries page-presence only. Null the rank on
   every combo once coverage is live, keeping `coveredButWeak` honest.

5. **Notional 120000 budget baseline** — the seasonal CZK plan scaled off a hidden
   per-tenant constant, unlabeled next to live warehouse data. Now derives the baseline
   from trailing-30d ad spend when the project has a live Ads sync (`resolveReportDataset`),
   falls back to 120000 only otherwise, and marks the plan `sample={budgetIsIllustrative}`.

6. **Overview LTV ≠ /ltv** — `appRecs` read the static `SAMPLE_COHORTS`; switched to
   `resolveCohorts(project)` (pure, project-varied — exactly what `/ltv` consumes), so the
   command-center rec agrees with the module it links to.

7. **Contradiction check judged live pins against demo channels** — `MiningContext.channels`
   was hard-coded `SAMPLE_ATTRIBUTION`. Since the distribution module is sample-only (no
   live channel source), dropped the `channels` field + the targeting branch and made
   targeting pins EXEMPT — the honest half over the sample-fed half-measure.

8. **Sample meta rides the live dataset** — `buildLiveDataset` spread the sample spine's
   `meta {disclaimer, asOf, days, seed}` untouched onto "Živá data". Overwrite from the
   synced rows: `asOf` = last date, `days` = row count, `disclaimer` = "", `seed` = 0.

## Verification

- `npx tsc --noEmit`: **0 errors** (also enforced by the pre-commit hook on each commit).
- `npm run test:unit`: **1587 / 1587 pass** (baseline 1583 + 4 net new; see below). 0 fail.
- LLM gate (pre-commit): all 20 tool fingerprints unchanged — no schema/prompt touched.

New / adjusted tests (net +4):
- `article-validate.test.mjs`: provenance drives perex + FAQ wording (default illustrative,
  synced keeps the real-series claim). (+1)
- `local-signals.test.mjs`: live coverage nulls a seeded rank even where the page stays. (+1)
- `report-metrics.test.mjs`: `buildLiveDataset` overwrites sample meta. (+1)
- `insights-app-ltv.test.mjs` (new): app LTV rec matches `resolveCohorts`, is project-varied. (+2)
- `patterns-contradiction.test.mjs`: the two over-channel "fires/holds" tests replaced by one
  "targeting pins are EXEMPT" test. (−1)

## Patterns

- Findings 4/6/7/8 were the same root shape — a "resolve live, fall back to sample" seam
  leaking sample identity into the live path. Handled consistently: either substitute the
  real source (6: `resolveCohorts`; 5: trailing spend), or strip/exempt the sample artifact
  when it has no live analogue (4: null rank; 7: exempt targeting; 8: overwrite meta).
- The `ModulePage sample` gutter is the one page-level honesty signal; wire it to the same
  boolean that picked live-vs-sample (1, 2, 5), never a hardcoded literal.
- Provenance must travel *with the content* (3), not just the page chrome, because the
  Markdown/AI-crawler twin strips the chrome.

## Behavior changes worth sign-off

- **`/vykon` for live-synced tenants** now shows real KPIs and NO channel breakdown
  (live datasets set `channels: []`, same as `/zisk`/report) instead of the seeded sample.
  Unsynced tenants are byte-identical to before. The channel section renders empty for live
  tenants — acceptable (account-level sync has no per-channel data) but a candidate for an
  explicit "channel breakdown available on Zisk" empty state later.
- **Coverage matrix under live coverage** now shows no rank / `coveredButWeak = 0` (honest:
  no live rank source) instead of fabricated positions. If a rank source is later added to
  the coverage import, restore per-field rank.
- **Targeting channel pins** are no longer flagged as contradicted (they were only ever
  judged against demo data). If a live channel-performance source lands, re-enable the branch.
- **`/clanek/vykon` + every microsite** now openly state the report is illustrative
  case-study data rather than "reálná časová řada" — this is the intended honesty fix but
  is public-facing copy.
- **Seasonal budget plan** for live-synced projects now scales off real trailing spend, so
  the recommended CZK figures change (and the illustrative banner disappears for them).
