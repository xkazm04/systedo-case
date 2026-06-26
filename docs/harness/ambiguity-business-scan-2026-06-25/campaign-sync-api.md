# Campaign Sync & Evaluation API — Ambiguity + Business scan
> Context: Server routes that sync Google Ads campaigns into the per-tenant store (GET state / POST sync) and run single-campaign or whole-portfolio AI evaluations, persisting each report to match on-screen data.
> Files analyzed: 2 (plus 4 adjacent imports read for signatures: connector.ts, store.ts, usage.ts, ai/rate-limit.ts, ai/validation.ts)
> Total findings: 5

## 1. Spoofable client IP + `force=1` cache bypass = unmetered LLM budget drain
- **Lens**: 🌀 Ambiguity (security)
- **Value**: High
- **Effort**: M
- **File**: src/app/api/campaigns/analyze/route.ts:40,90 (with src/lib/ai/rate-limit.ts:60-64)
- **Problem/Opportunity**: The only abuse guard for anonymous callers on this paid LLM endpoint is the per-IP rate limiter, but `clientIp()` blindly trusts the first `x-forwarded-for` value — which the caller fully controls. An attacker sends a fresh random `X-Forwarded-For` per request and each maps to a brand-new bucket, so the 8/min + 80/day caps never bind. Anonymous traffic (`userId === null`) also skips the per-user `consume()` quota entirely, and `?force=1` (line 90) deliberately bypasses the dedup cache, so every looped request becomes a real, billable model call.
- **Why it matters**: A single scripted loop can drain the demo's LLM budget or pin the concurrency slots, defeating the entire defense this route was built around.
- **Fix sketch**: In rate-limit.ts `clientIp()` (not hashed), derive the IP from a trusted hop only — read `x-forwarded-for` from the right, indexed by a configured `TRUSTED_PROXY_HOPS`, and ignore it when no proxy is declared (fall back to the socket/`x-real-ip`). Optionally gate `force=1` behind a signed-in `userId` and/or count it against `consume("aiEval")` for anonymous callers — that second tightening edits the analyze route and is **gate-triggering**.

## 2. A transient series-fetch hiccup silently wipes the saved trend chart
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/app/api/campaigns/route.ts:126-132
- **Problem/Opportunity**: The "best-effort" series fetch is wrapped so a failure can't fail the sync — good — but on failure `series` stays `[]` and the code still calls `saveSeries(tenant, [], …)`, overwriting the previously-stored good daily series with an empty array. So one live GAQL hiccup blanks the trend chart even though the campaign upsert (and the prior series) were fine. The comment captures the intent ("must not fail the whole sync") but not the cost (destroying existing data).
- **Why it matters**: A successful sync visibly loses the trend chart on a partial provider failure — exactly the partial-data edge case the happy path ignores.
- **Fix sketch**: In route.ts, only persist series when the fetch succeeded: track a `seriesOk` flag (or skip `saveSeries` in the `catch`) so a failed fetch preserves the last good series instead of clearing it. Non-hashed file.

## 3. Reports & snapshots grow unbounded and are full-scanned on every request
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/app/api/campaigns/route.ts:41-51 (loadState) and src/app/api/campaigns/analyze/route.ts:92,94,149 (via store `allReports`, store.ts:164-167)
- **Problem/Opportunity**: Reports and per-sync snapshots are append-only with no cap or pruning, and every GET (`getReportHistories`, `getReportsForPeriod`) plus every analyze (`findCachedReport`, `getReportHistory`) reads the **entire** reports collection and filters in memory. The shared `sample` tenant is written by every anonymous sync/eval, so its collections grow forever from public traffic, making each subsequent read slower and more billing-heavy (per-doc Firestore reads). There's no recorded decision on retention limits.
- **Why it matters**: This is a latency + cost cliff that worsens precisely as the demo gets more traffic, and it concentrates on the one tenant anyone can write to.
- **Fix sketch**: Add a retention cap (e.g. keep last N reports per `(scope, campaignId)` and last N snapshots) trimmed inside `saveReport`/`upsertCampaigns` in store.ts, and/or query with `where`/`limit` instead of fetching the whole collection. All in store.ts — non-hashed.

## 4. Cache identity is under-specified; the request `period` is validated then ignored
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: M
- **File**: src/app/api/campaigns/analyze/route.ts:59,89,113-138 (with store.ts:214-231, validation.ts:508)
- **Problem/Opportunity**: Two contract gaps around what "identical inputs" means. (a) `hashEvalInputs` keys only on scope + campaignId + period + campaign metrics — it omits the locale (`getServerLocale()`, line 138), the RAG `patternLines` (lines 113-128), and the model, so a cs↔en switch, changed winning patterns, or a dev-Claude→prod-Gemini swap all return a stale or wrong-language cached report and never re-run. (b) `validateEvaluationRequest` requires a valid body `period` (validation.ts:508), but the route uses `meta.period` everywhere — the body field is dead input that misleads API clients.
- **Why it matters**: Users can be served a cached report in the wrong language or against outdated grounding with no way to tell, and the documented request contract lies about what `period` does.
- **Fix sketch**: Fold `locale`, a hash of `patternLines`, and the model id into the `hashEvalInputs(...)` call inputs, and either honor or drop the body `period`. Changing the hash inputs / period handling lives in the analyze route, so it is **gate-triggering**; the locale/pattern hashing itself can be implemented in store.ts (non-hashed) and only the call-site args change.

## 5. Productize "continuous monitoring + weekly AI portfolio digest" as a paid tier
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: L
- **File**: src/app/api/campaigns/route.ts:136-142 (evaluateAndAlert) and src/app/api/campaigns/analyze/route.ts:140-149 (saveReport/history)
- **Problem/Opportunity**: The expensive pieces of a monitoring product already exist and are wired to plans/quota: alerting on newly-critical campaigns (`evaluateAndAlert`), persisted report histories with trend timelines, per-plan limits, and an `upgradeUrl` to `/cena`. But today alerts + evaluation only fire on a **manual**, signed-in sync — there's no scheduled cadence or proactive AI summary, which is the recurring-value hook that justifies a subscription.
- **Why it matters**: Turning one-off manual evals into a "we watch your account and email you a weekly AI portfolio report + critical alerts" tier is a concrete retention + monetization path that reuses code already present, and the comment in route.ts already references a scheduled cron.
- **Fix sketch**: Add a scheduled job (cron route) that, for opted-in paid tenants, runs the existing sync → `evaluateAndAlert` → `saveReport` pipeline and emails a digest; gate cadence by `plan` in usage.ts/plans.ts. This is mostly new code plus the digest sender and reuses the analyze pipeline without editing the hashed route — not gate-triggering.
