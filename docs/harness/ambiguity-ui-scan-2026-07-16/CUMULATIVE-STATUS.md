# Ambiguity + UI Scan — Cumulative Fix Status

Branch: `vibeman/ambiguity-ui-2026-07-16` (off `master` @ `2e14069`, unmerged)

## Scan
- Combined **ambiguity-guardian + ui-perfectionist**, 5 findings/context, all 54 contexts.
- **270 findings**: 0 Critical / 101 High / 150 Medium / 19 Low (verified two ways).

## Fixes — COMPLETE (26 waves)

**Waves 1–9 (High tier)** closed the 66 planned Highs. **Waves 10–26 (module-clustered tail)** closed the remaining 35 Highs plus all Mediums and Lows.

| Waves | Scope | Tests after |
|---|---|---:|
| 1–9 | High tier, 9 themes (ops-theater, tenant-isolation, billing-honesty, sample-vs-live, currency, money-math, a11y, state-loss, UI silent-failure) | 1647 |
| 10–26 | Module-clustered tail (all remaining H + M + L, by area) | 1791 |

### Final tally
- **270 findings, all resolved: 269 fixed + 1 verified false-premise** (local-seo-leads #3 — code already correct, documented won't-fix).
- Severity: **101/101 High**, **150/150 Medium**, **19/19 Low**.
- **288 commits** (253 fix + wave/status docs), each atomic with a `Refs:` to its finding.
- Final verification: **tsc 0 errors**, **test:unit 1791/1791 pass** (baseline 1541 → **+250 new tests**), **LLM contract gate green**, **0 net regressions**.
- Known flake `tenant-docs-local-store` (pre-existing cross-test shared state) fails ~1-in-N full runs; passes in isolation and on re-run — not introduced by this work.
- Untracked `uat/driver/*.mjs` (user WIP) untouched throughout.

Per-wave detail: `FIXES-WAVE-1.md` … `FIXES-WAVE-26.md`.

## Remaining / deferred
- **0 open actionable findings.**
- 1 verified false-premise (local-seo-leads #3), documented.
- A few fixes were the "honest minimum" of a larger finding, with the broader change flagged in the wave summary (e.g. wave-5 shared-report/recap currency plumbing; wave-19 `ProductOffering.stock` optional for pacing; wave-11 content-pages #3 full sample/live convention). These are noted for future work, not open defects.

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
