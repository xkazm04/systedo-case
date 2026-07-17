# Wave 5 — Currency correctness (5 High)

Theme: money was hard-coded to CZK ("Kč") across surfaces even though a connected Ads
account can bill in EUR/USD, and one CSV export corrupted negative numbers. Fixes thread
an optional `currencyCode` through the existing currency seam
(`src/lib/campaigns/currency.ts`), defaulting to CZK so existing tenants are
byte-identical.

## Commits

| # | Finding (report) | Commit | Scope |
|---|---|---|---|
| 5 | core-platform-infra #1 | `fix(export): keep plain negative numbers numeric in CSV exports` | `src/lib/export.ts` |
| 3 | finance-ltv-profit-ui #1 | `fix(cost-model): EN cost-model labels say Kč, not USD` | `CostModelEditor.tsx` |
| 4 | public-marketing-demo-pages #1 | `fix(report): shared report skips drifted tiles instead of showing 0` | `report/compute.ts`, `report/[token]/page.tsx` |
| 2 | campaigns-control-plane-ui #1 | `fix(campaigns): currency-aware signed money + change strip for non-CZK accounts` | `currency.ts`, `CampaignsClient/ControlPlane/BudgetMoves/ChangeStrip` |
| 1 | report-metrics-ingestion #1 | `fix(report-metrics): capture the Ads account currency and label the report in it` | `report-metrics/{types,sync,build,resolve}.ts`, `google/ads.ts`, `currency.ts`, `MonthlyReport.tsx`, `mesicni-report/page.tsx` |

(Committed in the order 5 → 3 → 4 → 2 → 1; atomic, one finding each.)

## Narratives

**#5 CSV negatives.** The formula-injection guard apostrophe-prefixed every cell
starting with `= + - @ TAB CR`, so any negative number became text (`"'-85000"`) that
Excel/Sheets import as a string and drop from sums/pivots. `csvCell` now exempts *plain*
signed numbers (`/^[+-]?\d+(?:[.,]\d+)?$/`, no grouping) from the apostrophe guard while
still guarding non-numeric trigger copy (`"-50 % na vše"`, `"=SUM(A1)"`). The cs
decimal-comma negative (`-0,85`) stays quoted (comma is a delimiter) but carries no
apostrophe, so it reads as a real number.

**#3 Cost-model EN label.** The editor's EN locale labeled overhead / per-order as
"(USD)", but the value is stored unit-less and rendered everywhere with `fmtCZK`. An EN
user entering 500 "USD" had it treated as 500 Kč (~22× off). The model has no stored
currency dimension, so the honest fix is the label ("Kč" in both locales), not a number
conversion.

**#4 Shared report drift.** `MonthlyReportPrimary` read each tile as
`snap.current[metric] ?? 0`, so any metric key missing from an old persisted snapshot
coalesced to a confident "0 Kč"/"0×". New pure helper `tileSnapshotValue` returns `null`
for an absent key (distinct from a real `0`); the page skips those tiles. Also replaced
the inline magic period-membership object + two `as` casts with the existing
`isCampaignPeriod` guard.

**#2 Campaigns signed money + ChangeStrip.** Direction-2 relabeling reached only the
unsigned surfaces, so a EUR/PLN account showed a euro amount next to a koruna gain on the
same pending-move row, and `ChangeStrip` was never handed a formatter at all. Added
`resolveSignedMoneyFormatter` (signed twin of `resolveMoneyFormatter`, same
round-before-sign / true-minus U+2212 rule as `fmtSignedCZK`), threaded as
`fmtMoneySigned` into `ControlPlane` + `BudgetMoves`, and passed `fmtMoney` into
`ChangeStrip`.

**#1 Report-metrics currency capture.** The sync divided `costMicros` of the *account*
currency but stored no code, so a EUR/USD account's spend rendered as koruny under the
"Živá data" label. Captured `customer.currency_code` at ingestion (new `pickCurrency`,
added to the shared `fetchAccountDailyRaw` SELECT; additive `meta.currencyCode` beside
`timeZone`), carried it into the tile model (`buildLiveDataset` sets `client.currency`),
surfaced it on `ResolvedDataset.currencyCode`, and made the in-app Monthly Report KPI
tiles currency-aware via the new `resolveMoneyCompactFormatter`. No conversion — amounts
stay native; only the symbol changes.

## Verification

- `npx tsc --noEmit`: **0 errors** (also enforced by the pre-commit hook on every commit).
- `npm run test:unit`: **1595/1595 pass** (baseline 1587 + **8 new tests**). LLM contract
  goldens unchanged (all 20 tools `ok`).
- One transient failure appeared on the first full-suite run in an **unrelated** module
  (`tenant-docs-local-store.test.mjs` — a hash mismatch from cross-test shared state);
  it passes in isolation and on rerun (known pid-keyed temp-DB flake pattern, not
  introduced here).

New tests: `export-csv` (plain-number negatives, +420-as-number), `report`
(`tileSnapshotValue` missing-key vs real-0), `campaigns-currency`
(`resolveSignedMoneyFormatter` base+foreign, `resolveMoneyCompactFormatter`,
`pickCurrency`), `report-metrics` (builder currency carry, resolver currency surface).

## Behavior changes (flag for sign-off)

1. **CSV `+420`** — a bare `"+420"` cell is now treated as the number 420 (unguarded)
   rather than apostrophe-guarded text. This intentionally supersedes the old
   `export-csv` assertion `csvCell("+420") === "'+420"` (updated). Non-numeric trigger
   copy like `"+420 volejte"` is still guarded. Negatives (`-85000`, `-0,85`) now import
   as numbers — the actual bug this fixes.
2. **Shared report tiles** — a tile whose metric key drifted out of an old persisted
   snapshot is now **omitted** instead of showing a fake `0 Kč`. A genuine `0` still
   renders.
3. **Non-CZK accounts** — money surfaces (campaigns signed figures + change strip;
   in-app Monthly Report KPI tiles) now label a captured foreign account in its own
   currency. This changes nothing for CZK / un-captured / pre-capture data (byte-identical).

## Partial / follow-up (needs sign-off)

**#1 does NOT reach every money surface.** Rendering in the captured currency is wired
for the **in-app Monthly Report tiles**. Two client-facing surfaces still render CZK
symbols because they read a *separate* data path with no currency field yet:

- **Shared client report** (`report/[token]/page.tsx`, `fmtTile` + the portfolio KPIs)
  — driven by the `SharedMonthlyReport` share-time payload, which has no currency field.
  Threading it means capturing currency at share time (an additive
  `shared-report.ts`/`buildSharedMonthlyReport` change) — deferred to keep this wave
  scoped.
- **AI recap grounding** (`recap-context.ts` / `fmtCZK` in the grounding text) — the
  narrative still quotes Kč. Same additive plumbing, deferred.

For a CZK tenant (the overwhelmingly common case) everything is byte-identical; the gap
only affects a connected non-CZK Ads account on those two surfaces. Recommend a follow-up
wave to thread `currencyCode` into the shared payload + recap grounding if non-CZK
accounts are in scope.

## Patterns

- **One seam, three variants.** `currency.ts` now exposes `resolveMoneyFormatter`
  (unsigned), `resolveSignedMoneyFormatter` (deltas), `resolveMoneyCompactFormatter`
  (tiles) — all sharing `normalizeCurrency` and all returning the passed base fn
  *unchanged* for CZK/unknown, so CZK output is a guaranteed byte-for-byte no-op.
- **Additive meta.** `currencyCode` follows the exact `timeZone` precedent on
  `MetricsSyncMeta` — stamped only when well-formed, absent on legacy blobs, defaulted to
  base on read.
- **Missing vs zero.** Distinguish "key absent from a Partial map" (`undefined` → skip)
  from "real 0" — never `?? 0` on a client-facing figure.
- **Numeric exemption before formula guard.** A CSV formula guard must carve out pure
  numerics, or it corrupts the very deltas a reporting product exports.
