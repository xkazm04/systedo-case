# Ambiguity + UI Scan — Cumulative Fix Status

Branch: `vibeman/ambiguity-ui-2026-07-16` (off `master` @ `2e14069`, unmerged)

## Scan
- Combined **ambiguity-guardian + ui-perfectionist**, 5 findings/context, all 54 contexts.
- **270 findings**: 0 Critical / 101 High / 150 Medium / 19 Low (verified two ways).

## Fixes (waves 1–9, the High tier)

| Wave | Theme | High closed | Tests after |
|---|---|---:|---:|
| 1 | Ops success-theater | 7 | 1549 |
| 2 | Tenant isolation, auth & secrets | 8 | 1557 |
| 3 | Billing honesty (canned-billed-as-real) | 7 | 1583 |
| 4 | Sample-vs-live honesty | 8 | 1587 |
| 5 | Currency correctness | 5 | 1595 |
| 6 | Money-math & stats integrity | 7 | 1610 |
| 7 | Accessibility & focus | 7 | 1622 |
| 8 | Twin & state-loss / concurrency | 8 | 1636 |
| 9 | UI silent-failure tail | 9 | 1647 |
| **Total** | | **66** | |

- **66 of 101 High findings closed**, 0 skipped in-plan.
- Verification: **tsc 0 errors**, **test:unit 1647/1647 pass** (baseline 1541 → +106 new tests), **LLM contract gate green**, **0 net regressions**.
- ~74 commits (64 fix + 10 wave-summary docs), each atomic with a `Refs:` to its finding.
- Known flake `tenant-docs-local-store` (pre-existing cross-test shared state) fails ~1-in-N full runs; passes in isolation and on re-run — not introduced by this work.

## Remaining
- ~35 High findings not in the 9-wave plan (module-tail Highs mixed with Med), plus **150 Medium + 19 Low**. See INDEX.md themes I/J and the per-report files.
- 1 partial (wave 5): shared client-report page + AI recap grounding still render CZK; additive plumbing deferred.

## Behavior changes / new env vars needing sign-off
Collected from wave summaries (full detail in each `FIXES-WAVE-N.md`):
- **New env `TRUSTED_PROXY`** — off-Vercel deploys ignore `x-real-ip` unless set (fail-safe default: untrusted).
- **`BYOM_MATRIX=true` is now dead in production** (dev-only entitlement bypass).
- `/api/images/nobg` now requires sign-in + tenant-owned image ids.
- Project PATCH rejects non-hex accents / non-http(s) logo URLs (422).
- Tenant digest emails no longer carry app-wide AI telemetry.
- Microsite slugs must match `[a-z0-9-]{3,40}`.
- `/api/alerts` now requires an explicit `action` (bare body → 400, was mark-all-read).
- `/vykon` shows real KPIs for live-synced tenants; public case-study pages say "illustrative data" not "reálná časová řada".
- Non-CZK Ads accounts labeled in their own currency on wired surfaces; CSV keeps negatives numeric.
- Sponsorship prices rise (~+50% correction); Heureka short-dispatch products stay in stock; A/B winners gated on a volume floor.
- BYOM 429 now retries/falls back; test-connection keeps a healthy key on transient outages.
- Twin: auto-approved drafts read-only until Edit; duplicate send is idempotent no-op.
- Create-project module matrix marks are now honestly read-only (never persisted); real per-project module persistence deferred.

## Context-map drift found during scan
- `src/app/api/campaigns/apply/route.ts` no longer exists (apply → control-plane approve).
- `src/app/api/cron/microsite/route.ts` no longer exists (5 cron routes remain).
