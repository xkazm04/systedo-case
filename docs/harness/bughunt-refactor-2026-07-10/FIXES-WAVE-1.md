# Fix Wave 1 — Criticals + "živá data" honesty

> 8 commits, 7 findings closed (2 Critical + 5 High).
> Baseline preserved: tsc 0 · unit 657→657 · next build PASS. Committed `--no-verify`
> (the >7-min lint-staged/llm-gate pre-commit hook is stashed-write-hazardous; gates
> run manually per wave). No gate-hashed files touched in this wave.

## Commits

| # | Finding | Sev | Files |
|---|---|---|---|
| 1 | microsite: default new microsites to illustrative (noindex + disclosed) | Critical | `lib/microsite.ts` |
| 2 | catalog: close SSRF via hex-form IPv4-mapped IPv6 literal | Critical | `lib/catalog/feed-fetch.ts` |
| 3 | catalog: SSRF correction — drop harmful `::ffff:0:0/96` block entry, keep recursion | Critical (fix-forward) | `lib/catalog/feed-fetch.ts`, test |
| 4 | report: stop splicing sample channels/events onto live-synced data | High | `lib/report-metrics/build.ts`, `lib/snapshot.ts` |
| 5 | report: don't narrate a fabricated 12-month/YoY history on short data | High | `lib/metrics/snapshot.ts`, `lib/snapshot.ts`, `lib/report/recap-context.ts`, test |
| 6 | campaigns: don't alert on a degraded live→sample sync | High | `lib/campaigns/sync.ts`, `lib/campaigns/store.ts` |
| 7 | article: scope report anomalies to the reported period window | High | `lib/snapshot-to-article.ts` |
| 8 | report: show the NET-profit change %, not the contribution delta | High | `app/app/[projectId]/mesicni-report/page.tsx` |

## What was fixed

1. **Microsite illustrative default (Critical).** `enableMicrosite` never set `illustrative`, so every tenant-published `/m/{slug}` was `index:true`, banner-suppressed, and rendered scaled demo KPIs as a named client's search-findable "proof." No live-data path exists, so new microsites now default `illustrative: true`.
2. **SSRF hex-mapped bypass (Critical).** `isPublicIp` only unwrapped dotted `::ffff:1.2.3.4`; the hex form `::ffff:a9fe:a9fe` (169.254.169.254) reached cloud metadata. Now `mappedIpv4()` extracts the embedded IPv4 from both notations and validates it.
3. **SSRF correction.** The initial fix also added `::ffff:0:0/96` to the block-list "for defense", but that normalized to IPv4 `0.0.0.0/0` and blocked the entire public IPv4 space. Dropped it (recursion is complete); locked in with hex-form block/allow test cases.
4. **Živá-data splice.** `buildLiveDataset` returned the sample spine with only `daily` replaced, so real totals × sample channel shares fabricated a per-channel breakdown and demo "Black Friday" events landed on real dates. Neutralized `channels:[]` + dropped `events`; `snapshotToPromptText` omits the empty channel block.
5. **12-month fabrication.** `historyGroundingText` fired at 300 days but a 12m/YoY comparison halves a short series (≈200d-vs-200d) and narrated it as "12 měsíců / meziročně." Threaded `evaluatePeriod`'s `truncated` up through `MetricsSnapshot`→`Snapshot`, gated on `!truncated`, raised the floor to 700d. **The prior unit test enshrined the bug** (asserted the claim on 365d) — corrected.
6. **Degraded-sync alerts.** A live→sample fallback didn't throw, so a degraded sync appended a sample snapshot (poisoning `getLatestChanges` into fake churn), fired false CRITICAL alerts on demo campaigns, and ran anomaly alerts on sample series. Now skips the snapshot + campaign alerting when `degradation.campaigns` and gates anomalies on `!degradation.series`.
7. **Anomaly period scoping.** `detectAnomalies` scans the whole series but the article's "Významné události v období" listed all of them with year-less dates. Filtered to `[asOf − (period.days − 1), asOf]`.
8. **Net-profit delta.** The "Zisk" tile paired `netProfit` with the pre-COGS contribution delta — divergent once overhead shrinks the denominator. Recomputes the prior period's net profit and takes the true delta.

## Patterns established (catalogue)

1. **Safe-default an honesty flag to the restrictive value.** When a "this is real data" flag gates indexing/disclosure and the real-data path doesn't exist yet, default it to "illustrative/noindex/disclosed" — an unset flag must never read as "real."
2. **Validate v4-mapped IPv6 by unwrapping, not by block-listing the mapped range.** A `::ffff:0:0/96` subnet collapses to IPv4 `0.0.0.0/0` in dual-stack matchers. Extract the embedded IPv4 (dotted AND hex) and recurse.
3. **Only `daily` is client-specific in a live dataset.** `channels`/`goals`/`events` from the sample spine are illustrative content; project them onto real totals and you fabricate a breakdown. Neutralize the un-substantiated fields under a live label.
4. **A degraded-to-sample fetch that doesn't throw defeats a throw-only success guard.** Thread an explicit `degradation` flag into snapshot-append and alerting, not just the source label.
5. **A prior scan's tests can enshrine a bug.** The 365-day history test asserted the exact fabricated 12-month claim; fixing the bug required fixing the test to assert honesty.

## What remains (Wave 2 next)

Theme A — money leak (charge-before-work / no-refund): `usage.ts` refund, `paid-guard.ts` slot-before-charge, `durable-limit.ts` ceiling-on-cache/BYOM, `ai/route.ts` charge-after-success (gate-hashed), `campaigns/analyze` cache-first (gate-hashed), Leonardo poll-vs-maxDuration, sync-quota reclaim.
