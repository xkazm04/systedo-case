# Ambiguity+Business Fix Wave 3 — "Don't crash, don't drain"

> 6 commits, **7 findings closed** (the rate-limit fix and the article fix each close two).
> Theme: robustness, abuse-resistance, and defensive guards on server + render surfaces.
> Baseline preserved: tsc 0 → 0 · unit 173 → 173 · **next build ✓** · 0 regressions.

## Commits

| # | Commit | Finding(s) | Files |
|---|--------|-----------|-------|
| 1 | `617ac68` | ai-generation-api #1 **+** campaign-sync-api #1 — spoofable rate-limit IP | `src/lib/ai/rate-limit.ts` |
| 2 | `d3e4548` | article-content #2 **+** #3 — unchecked cast + broken anchors | `src/lib/article.ts` |
| 3 | `88d0c97` | campaign-console #3 — partial AI report crashes the card | `src/components/campaigns/useCampaigns.ts` |
| 4 | `59e5cb1` | trend-channel #3 — empty series throws on render | `src/components/dashboard/TrendChart.tsx` |
| 5 | `0d3795d` | ai-workspace #1 — e2e timeouts assume a dead 60s ceiling | `tests/ai-asistent.spec.ts` |
| 6 | `d3661ed` | campaign-connector-store #3 — no `busy_timeout` | `src/lib/db.ts` |

## What was fixed

1. **X-Forwarded-For spoofing closed (both AI endpoints, one file).** `clientIp()` took the client-controlled leftmost XFF, so rotating the header gave a fresh rate-limit bucket per request — the only anon budget guard, defeated. Now prefers the platform's verified connecting-IP header and otherwise reads XFF from the right past `TRUSTED_PROXY_HOPS`. **Follow-up:** a process-wide global anonymous daily budget cap (defense-in-depth) needs a hashed-route edit — deferred to the gate-locked track.
2. **Article content validated at load.** Replaced `data as Article` with `parseArticle()` that fails the build on unknown block types, figures missing src/alt, empty FAQ, dead `#anchors`, or duplicate heading ids; documented the H2-only ToC. (`next build` confirms the current JSON passes.)
3. **AI report normalized before render.** `normalizeReport()` coerces `strengths/weaknesses/recommendations` to `[]` and clamps `score`, so a partial payload can't crash ReportView.
4. **Empty-series guard on the trend chart.** Muted placeholder when `n === 0`, placed after all hooks — `data[-1]` no longer throws.
5. **AI e2e timeouts derive from `CLAUDE_TIMEOUT_MS`.** The timeout test can now actually reach the ~180s dev ceiling (was a dead 70s wait under a 100s cap); live-result waits scale too.
6. **`busy_timeout = 5000`** added after the WAL pragma so contended SQLite writes wait instead of throwing `SQLITE_BUSY`.

## Scope decision (deferred, not silently changed)
**home-app-shell #2 (English-only landing)** was pulled from this wave. The repo rebranded to an English product brand ("Adamant — AI ad intelligence"), so whether the landing should be Czech is a **product-positioning decision** (English-first adtech brand vs cs-first case study), not a clear bug. Logged as a follow-up for the team rather than silently translated. Wave 4 keeps the four unambiguous i18n-correctness leaks.

## Verification
tsc 0 · unit 173/173 · **`next build` exit 0** (validates the new build-time article validator + SSR/client boundary) · LLM gate green (cached).

## Patterns established (catalogue 8–11)
8. **Trust the proxy, not the client, for IP** — `x-forwarded-for[0]` is attacker-controlled; key rate limits off the platform's verified connecting IP or a right-indexed trusted hop.
9. **Cast ≠ validation at a data boundary** — JSON imported and `as`-cast type-checks but guarantees nothing at runtime; validate at load and fail the build, especially before a model fans out to many files.
10. **Normalize external/LLM payloads at one store site** — coerce arrays/numbers once on ingest rather than `?? []` scattered across every render read.
11. **Derive test bounds from the constant under test** — a hard-coded `60s` in a test silently rots when the real ceiling moves; import the source-of-truth value.

## What remains
Waves 4–6 + gate-locked track. Next: Wave 4 "Czech, all the way down" (4 i18n leaks).
</content>
