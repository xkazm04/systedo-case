# Campaign ops & tenant utility/research

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

_Note: the 2026-07-09 report has drifted — its finding #2 (routes reimplementing session→userId) is already fixed; every route in this context now imports `currentUserId` from `@/lib/session`. None of the findings below restate the prior report._

## 1. Single-campaign evaluate charges the global spend ceiling + per-IP daily eval cap on cache hits and server-busy rejections

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/api/campaigns/analyze/route.ts:41`
- **Scenario**: `durableGuard(clientIp(request), [RATE_RULES.evalPerMin(), RATE_RULES.evalPerDay()], { spendUnits: 1 })` runs at line 41 — the very top — and, per `durable-limit.ts:106-120`, on success it commits `count+1` to the per-IP `evalPerDay` bucket **and** `+1` to the `_global_{day}` spend ceiling doc. Only *afterwards* (lines 103-109) does the route check `findCachedReport` and return the cached report with **no LLM call**. So every re-view of an unchanged (cached) report — the common case after a sync, since the client re-requests per campaign — burns one unit of the caller's per-IP daily eval allowance and one unit of the platform-wide `AI_GLOBAL_DAILY_CEILING` (default 2000). The batch sibling proves the intended order: `analyze/batch/route.ts:113-139` runs the cache pass first (free) and charges `durableGuard` only for `pending.length` (the actually-paid targets).
- **Root cause**: the abuse guard was placed before the cache lookup so that "hammering" is throttled, but `spendUnits` (a money/quota charge, not just a throttle) was folded into that same pre-cache call, conflating "this request arrived" with "this request will spend".
- **Impact**: a user who opens the campaigns view a dozen times, or an agency polling cached reports, silently exhausts their per-IP `evalPerDay` cap and is then **locked out of real evaluations for the rest of the day despite never having paid for one** (user-visibly-broken); the global ceiling is inflated by $0 cache hits, tripping the "budget exhausted/degraded" status banner (`status-core.ts`) for *all* callers earlier than real spend warrants. The same over-charge occurs when `acquireSlot()` (line 48) rejects with a server-busy 429 — the spend unit is already committed.
- **Fix sketch**: split the guard — keep a spend-free throttle (`evalPerMin`/`evalPerDay` count only, `spendUnits: 0`) up front for abuse protection, and issue the `{ spendUnits: 1 }` durable charge only on the paid path, immediately before `generateCampaignEvaluation` (after the cache-hit early return at line 108 and after `acquireSlot`), mirroring the batch route's cache-first-then-charge ordering.

## 2. Best-effort activity logging is not isolated from the save — a `recordActivity` failure returns 500 and drives duplicate saves on retry

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/keywords/lists/route.ts:75`
- **Scenario**: `POST` does `const list = await saveKeywordList(...)` (line 74) — which commits — then `await recordActivity(tenant, {...})` (lines 75-82) with **no surrounding try/catch** (the handler's only `try` wraps `request.json()` at 56-60). If `recordActivity` rejects (it's a separate Firestore write — different collection, own transient/quota failure modes), the whole `POST` rejects and Next.js returns a 500, even though the keyword list was already persisted. The identical shape exists at `src/app/api/experiments/route.ts:70` (`upsertExperimentVariant` at 65 commits, then unguarded `recordActivity` at 70).
- **Root cause**: an audit-log side-effect (explicitly best-effort — an activity entry failing should never fail the user's primary action) is `await`ed inline in the success path with no error isolation, so its failure is indistinguishable from the save failing.
- **Impact**: the client sees an error toast for a save that actually succeeded and, on the natural retry, `saveKeywordList` runs again and creates a **duplicate list** (each call mints a fresh id); the experiments path double-upserts. Data-integrity noise plus a confusing "it failed but the row is there" state.
- **Fix sketch**: wrap the `recordActivity` call in `try { await recordActivity(...) } catch (err) { console.error(...) }` (or `void recordActivity(...).catch(...)`) so logging failure can never fail the save; apply to both files.

## 3. Sync daily quota is consumed even when the sync then fails, with no reclaim

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/campaigns/route.ts:145`
- **Scenario**: `POST` calls `const quota = await consume(userId, "sync")` (line 145) — which atomically increments the day's `sync` counter (`usage.ts:94-95`, no auto-refund) — and only *then* runs `await runTenantSync(...)` (line 168). If `runTenantSync` throws (returned as a 502 at lines 171-174, e.g. a transient Google Ads / connector failure), the sync credit has already been spent for a sync that produced nothing.
- **Root cause**: "charge, then do the work" without a compensating reclaim on the work failing — the quota decrement assumes the sync always succeeds once past the guard.
- **Impact**: on a low free-plan sync allowance, a few transient upstream hiccups silently drain the user's daily sync quota, blocking legitimate syncs the rest of the day (`Denní limit synchronizací vyčerpán`) even though no successful sync ever ran. Degraded/misleading metering.
- **Fix sketch**: either move `consume` to after a successful `runTenantSync`, or reclaim on failure (decrement the counter / a `refund(userId,"sync")` helper) in the `catch` at lines 169-175. Note `runTenantSync` degrades live→sample internally rather than throwing for provider hiccups, so charging on the *thrown* path only (true failure) is the safe boundary.

## 4. Batch evaluate charges the whole planned batch to the global spend ceiling up front, then over-charges when it stops early

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/api/campaigns/analyze/batch/route.ts:135`
- **Scenario**: `durableGuard(..., { spendUnits: pending.length })` (lines 135-139) commits `pending.length` units to the global ceiling *before* `acquireSlot()` (line 146) and before the per-target loop. Two paths then do far fewer paid calls than charged: (a) `acquireSlot()` returns a server-busy 429 at line 147 → **zero** calls made but the full `pending.length` already committed to the ceiling; (b) inside the loop, per-user quota exhaustion (`break` at 173) or the first provider failure (`break` at 222) stops the walk — e.g. stopping at target 3 of 10 still charged the ceiling for all 10.
- **Root cause**: the spend charge is deliberately levied up front to stop a batch being "a way around the per-request eval budget" (comment at 133-134), but the ceiling is a *money* counter, not just an abuse throttle — it should reflect calls actually made, and the up-front charge happens even before the concurrency gate that can reject the batch outright.
- **Impact**: the platform-wide `AI_GLOBAL_DAILY_CEILING` is decremented for provider calls that never happen (worst case: entire batch on a server-busy 429), tripping the degraded/exhausted status banner for all callers prematurely. Per-user counters are unaffected (charged per real call in-loop), so the leak is confined to the shared ceiling — but that's the one guarding real spend.
- **Fix sketch**: move `acquireSlot()` before `durableGuard`; and charge the ceiling incrementally per actual call inside the loop (`spendUnits: 1` alongside the per-user `consume`), or reconcile at the end by charging only `evaluated.length`. Keep the per-IP `evalPerMin`/`evalPerDay` count-throttle up front (spend-free) for abuse protection.

## 5. The abuse-guard preamble (size check + durable throttle + 429 reply) is copy-pasted across five routes

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/app/api/campaigns/analyze/route.ts:38-47`
- **Scenario**: the block `if (tooLarge(request)) return payloadTooLarge(...); const limited = await durableGuard(clientIp(request), [...]); if (!limited.ok) return tooManyRequests(limited.retryAfter, ...)` is repeated near-verbatim (only the rule list and the Czech message differ) in five owned/adjacent routes: `analyze/route.ts:38-47`, `analyze/batch/route.ts:55-57`+`135-145`, `campaigns/route.ts:107-116`, `keywords/route.ts:20-29`, and `patterns/search/route.ts:17-23`. This is distinct from the 2026-07-09 report's finding #5 (the `let body = {}; try { body = await request.json() } catch {}` JSON-body shell) and #4 (`str`) — neither touched the rate-limit preamble.
- **Root cause**: no shared "guard this request (size + durable rate/spend) or return the standard 429/413" helper exists, so each paid/throttled endpoint re-inlines the three-step shell.
- **Impact**: purely structural today, but the ordering bug behind findings #1 and #4 (spend charged before cache/slot) is exactly the kind of subtlety that a single shared guard would fix once instead of five times; five copies means five places to keep the message/retry semantics consistent.
- **Fix sketch**: add `async function guardPaidRequest(request, rules, opts?): Promise<Response | null>` to a small shared module (e.g. `src/lib/ai/guard.ts`) that runs `tooLarge`→413, then `durableGuard`→429, returning the error `Response` or `null` to proceed; each route becomes `const blocked = await guardPaidRequest(request, [RATE_RULES.evalPerMin(), ...]); if (blocked) return blocked;`. Leave the message text per-route via an `opts.tooManyMessage`.
