# AI Abuse Guards & Response Governance

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

Note: the prior code_refactor report's items #1 (`resolveWouldServe` drift), #3 (`envInt` triplication) and the provider-order duplication have since been fixed (`@/lib/env`, `@/lib/llm/provider-order`, `resolveWouldServe` rewired). Its items #2 (inline window math in `rate-limit.ts`), #4 (shared-dial `RATE_RULES`) and #5 (unused exported constants) are still open in the code but are NOT restated here.

## 1. Global daily spend ceiling counts cache hits and BYOM calls as paid app ops, so the public demo locks out early

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/ai/durable-limit.ts:114`
- **Scenario**: `guardPaidGeneration` (the sequence every `/api/ai` POST runs first) calls `durableGuard(ip, [...], { spendUnits: 1 })` BEFORE the handler ever consults the response cache or resolves BYOM. With the default `AI_GLOBAL_DAILY_CEILING=2000`, `countSpend` is true, so `durableGuard` increments `_global_<day>.count` by 1 for **every** request that passes the per-IP window (durable-limit.ts:114-120). But two large classes of those requests cost the app nothing on a provider: (a) response-cache hits — `cachedRespond` returns a cached `AiResponse` with no `gen()` call (route.ts:85-86); and (b) BYOM-served calls — the user pays their own tokens and the app's quota charge is even explicitly skipped (route.ts:93). Both still burn a unit of the "total paid provider ops/day" ceiling. A visitor hammering one identical prompt (all cache hits after the first), or a heavy BYOM user, drives the shared global counter toward 2000 while the real app provider bill stays near zero.
- **Root cause**: the ceiling is charged at guard time on the assumption "one guarded request == one paid app provider op," but the guard runs before the cache-hit / BYOM branches that make many requests cost the app $0.
- **Impact**: degradation / availability — once the inflated global counter trips, `ceilingExceeded` refuses ALL anonymous paid calls with a `secondsUntilUtcMidnight` retry (durable-limit.ts:101-103), taking the public case-study demo down for everyone until UTC midnight, well before 2000 genuine provider ops occurred. The ceiling that exists to protect the provider bill instead becomes a self-inflicted global outage switch.
- **Fix sketch**: only charge the ceiling for calls that actually spend on the app's provider. Either (a) move the ceiling increment out of the pre-guard step and into the generation path — charge it after a real cache-miss, non-BYOM `gen()` in `cachedRespond` via a small `chargeGlobalSpend(units)` helper on `durable-limit` — or (b) split `durableGuard` into a pre-check (rate window only) plus a post-generation `commitSpend(ip, units)` the route calls only on the miss+app-provider branch. Keep the per-IP window charge where it is (abuse throttling legitimately counts attempts); it is only the *spend* ceiling that must count actual spend.

## 2. Concurrency slot is held across grounding I/O and the entire cache-hit path, not just the provider spawn it exists to cap

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/ai/rate-limit.ts:158`
- **Scenario**: `acquireSlot()` (max `MAX_CONCURRENT=4`) is taken inside `guardPaidGeneration` and released only in the route's outermost `finally` (route.ts:448), i.e. it wraps the *whole* handler. For grounded tools that includes seconds of non-provider work that runs BEFORE `cachedRespond`: `resolveGrounding`/`resolveBrandContext`/`resolveLeadGrounding` do multiple Firestore reads (route.ts:310, 321, 388), and `onboarding-scan` performs an external `fetchSiteText` HTTP round-trip (route.ts:411) — all while holding a slot, and all of it still runs even when the request will end up being a cache HIT (no provider call at all). Four concurrent grounded-but-cached (or slow-to-fetch) requests occupy all 4 slots, so a 5th caller — including one that would hit a real provider — is rejected with a 429 "Server je momentálně vytížený."
- **Root cause**: the slot's stated invariant is "slow provider *spawns* can't stack up," but it is acquired around the entire request lifecycle (grounding + external fetch + cache lookup), conflating cheap/cached/IO-bound work with the expensive provider spawn it is meant to meter.
- **Impact**: degradation — the concurrency cap under-serves real traffic; cached and grounding-heavy requests that consume no provider capacity still exhaust the 4-slot budget and 429 legitimate generations.
- **Fix sketch**: narrow the slot to the actual provider call. Acquire/release around `gen()` inside `cachedRespond` (after the cache-hit early-return and after grounding), not in the pre-flight `guardPaidGeneration`; a cache hit and grounding I/O should not hold a provider slot. Alternatively raise the cap for non-`gen` work, but scoping the slot is the correct fix.

## 3. Response cache has no in-flight de-dupe, so concurrent identical submits both pay the provider and both burn quota

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/ai/response-cache.ts:30`
- **Scenario**: the cache is populated only *after* `gen()` completes (`setCachedAi` at route.ts:108). Two identical requests that arrive within the same window (double-click, a client auto-retry, two tabs) both call `getCachedAi` and both miss — because neither has written yet — so both proceed to `consume(userId,"aiEval")` (route.ts:94) and both call the paid provider. The module docstring claims it "dedupes identical `/api/ai` submits within a TTL window," but it only dedupes *sequential* submits where the first has already finished; concurrent in-flight duplicates are not deduped.
- **Root cause**: the cache stores completed results only; there is no pending/in-flight map, so the TTL de-dupe has a hole exactly as wide as one generation's latency (the seconds a real model call takes — the worst case for double-spend).
- **Impact**: money-wrong + wrong quota — a signed-in user is charged two `aiEval` units for one logical action, and the app pays for two provider calls (and, per finding #1, two ceiling units) for an identical output.
- **Fix sketch**: single-flight the cache. Store `Promise<AiResponse>` (not just settled values): on miss, insert the in-flight promise under `key` immediately and have concurrent callers `await` it; on settle, replace with the value + TTL (and drop the entry if the promise rejects). Charge quota once per resolved promise, after it settles, rather than once per caller.

## 4. `peekDurableRemaining` fallback reports a near-full budget during a Firestore outage, contradicting what the POST will enforce

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/ai/durable-limit.ts:156`
- **Scenario**: the preflight `GET /api/ai/status` calls `peekDurableRemaining`, whose whole purpose (per its docstring and the status route comment) is that "the preflight number matches what a POST would hit." On a Firestore error it falls back to `localPeekRateLimit`, which reads the per-process `node:sqlite` table. But in normal production operation `durableGuard` writes counters to *Firestore only* and never touches sqlite — so at the moment Firestore starts failing, the local table is empty and the peek returns `limit - 0` = the full per-min/per-day budget, even though the real usage (and the durableGuard fallback that also starts writing local) will throttle. The banner tells the user they have their whole daily budget left while the next POST may 429 them.
- **Root cause**: the durable counters and the local fallback counters are two disjoint stores; the peek fails over to the empty one and treats "no local rows" as "no usage" rather than "unknown."
- **Impact**: honesty/UX degradation — the preflight banner, which exists specifically so users don't burn a carefully-filled form on an exhausted budget, becomes actively misleading during the exact outage window it should hedge for.
- **Fix sketch**: on the Firestore-peek failure, either surface uncertainty (omit `remaining`, or flag the payload `stale: true` so the banner softens its "N of M left" claim) instead of returning full-budget local numbers; or, if the local fallback is kept, only trust it once the durable guard has itself been falling back locally (e.g. gate on a shared "durable degraded" flag) so peek and guard read the same store.

## 5. `resolveWouldServe` and the status route independently rebuild the same provider availability map + order projection

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/ai/status-core.ts:59`
- **Scenario**: NEW duplication introduced by the fix for the prior report's item #1. `resolveWouldServe` builds `const available: Record<ProviderName, boolean> = { claude: claudeOk, gemini: geminiOk }` and maps `providerOrder(dev)` over it (status-core.ts:59-64). The status route then rebuilds the exact same `available` record (`src/app/api/ai/status/route.ts`, `{ claude: claudeOk, gemini: geminiOk }`) plus a parallel `modelTag` record and maps `providerOrder(dev)` again to produce the `providers[]` list. The `{ claude, gemini }` availability shape and the "zip providerOrder against a per-provider record" pattern are written twice against the same two inputs; adding a third provider means editing both the record literal and both map sites.
- **Root cause**: the prior fix correctly centralized the *order* (`providerOrder`) but left each consumer to hand-build the `Record<ProviderName, boolean>` availability projection, so the new shared helper stopped one hair short of the seam.
- **Impact**: cosmetic/maintenance only — no runtime bug today; the two copies happen to agree. Purely a "one more provider forces a two-site edit" legibility cost.
- **Fix sketch**: export a tiny `providerAvailability(claudeOk, geminiOk): Record<ProviderName, boolean>` (and/or a `providerStatusList(dev, available, modelTag)` builder) from `provider-order.ts`, and have both `resolveWouldServe` and the status route consume it. This is a judgment-call cleanup, not a correctness fix — flagging, not prescribing.
