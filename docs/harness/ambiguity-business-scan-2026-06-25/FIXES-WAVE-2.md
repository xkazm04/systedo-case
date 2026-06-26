# Ambiguity+Business Fix Wave 2 — "Stop the code lying about itself"

> 6 commits, 6 findings closed (5 High + 1 from home-app-shell #3). Theme: claims the
> code/docs/config made about themselves that weren't true (drift / single-source-of-truth).
> Baseline preserved: tsc 0 → 0 · unit tests 173 → 173 · 0 regressions.

## Commits

| # | Commit | Finding | Files |
|---|--------|---------|-------|
| 1 | `8406a24` | home-app-shell #1 — blanket noindex nullifies all SEO | `src/app/layout.tsx` |
| 2 | `80d41f7` | dataset-seed #1 — committed JSON drifted from generator | `scripts/generate-data.mjs`, `package.json` |
| 3 | `3308eea` | campaign-connector-store #1 — dead SQLite schema | `src/lib/db.ts` |
| 4 | `6e63041` | build-tooling #2 — CI falsely claims to mirror pre-commit | `.github/workflows/ci.yml` |
| 5 | `be7e601` | home-app-shell #3 — footer model names hand-copied | `src/lib/site.ts` |
| 6 | `66e3ba8` | build-tooling #1 — README hides the /app cloud product | `README.md` |

## What was fixed

1. **SEO indexing is environment-gated.** `robots:{index:false}` site-wide nullified the rich metadata above it; now indexes only on `VERCEL_ENV=production`, so the portfolio is findable while previews stay private.
2. **Generator drift is closed and guarded.** Agency name is a single `AGENCY` constant (was "Systedo" in the generator vs "Adamant" in the committed JSON); new `npm run seed:check` (`--check`) fails when the committed JSON diverges from fresh output. Re-seed produced a zero diff (confirming no numeric drift).
3. **Dead SQLite schema removed.** `campaigns/reports/sync_meta/campaign_snapshots` tables + the reports migration were leftover after the move to Firestore (9e66ed9); nothing referenced them. `db.ts` now honestly backs only rate-limits + (LOCAL_DB) users/projects.
4. **CI no longer lies about mirroring.** Header rewritten to state the real split (build + goldens = CI only; real-model Claude = local only); added the existing unit suite to CI. (The finding's "test:unit is a no-op" claim was wrong — it runs 173 tests — so the script was left intact.)
5. **Footer model names are sourced, not copied.** `STACK_FACTS` now imports `CLAUDE_MODEL`/`GEMINI_MODEL` (read-only, not gate-triggering) and the data line names each store's real backing (Firestore for campaigns, not node:sqlite).
6. **README surfaces the cloud product.** Added a `/app` callout (Auth.js/Firestore/cron/Creative Studio) linking `SETUP.md` and split the deploy guide into static-web vs full-`/app` with the previously-undocumented env vars.

## Scope adjustment
**llm-test-gate #1** (add `social.ts` to `HASHED_FILES`) was moved to the gate-locked track: adding a file to the gate's own hash set changes the computed fingerprint, which would *trigger* the real Claude run. Swapped in home-app-shell #3 (commit-safe) to keep the wave at six.

## Verification
tsc 0→0 · unit 173→173 · LLM gate green (cached; no hashed files touched) · `seed:check` passes.

## Patterns established (catalogue 5–7)
5. **Documented ≠ enforced** — a "never drift" / "single source of truth" comment is worthless without a check; add a `--check`/`diff` guard or derive the value from its real source (imports), don't hand-copy.
6. **Dead schema is a second mental model** — leftover tables/migrations after a storage move make readers believe the wrong backing store; delete them (CREATE IF NOT EXISTS removal is row-safe).
7. **Verify a finding's factual claims before acting** — the scan's "test:unit is a no-op" was false (173 tests run); the baseline caught it. Trust, but check.

## What remains
Waves 3–6 + gate-locked track. Next: Wave 3 "Don't crash, don't drain" (robustness/abuse).
</content>
