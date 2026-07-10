# AI generation, creative studio & ops telemetry

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

Note: prior report's #1 (compose the guard sequence) has since been implemented as `guardPaidGeneration` (`src/lib/ai/paid-guard.ts`), so the three inline copies it flagged are gone. The findings below are all new and do not restate that report (tenancy-resolve dedup, userId-cast dedup, `num` dedup, delete-body dedup) — those remain out of scope here.

## 1. Durable per-IP + global daily spend counters are committed *before* the concurrency gate, so requests rejected with 429 "server busy" still drain the budget

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/ai/paid-guard.ts:49`
- **Scenario**: `guardPaidGeneration` runs, in order: `tooLarge` → `durableGuard(ip, [aiPerMin, aiPerDay], { spendUnits: 1 })` → `acquireSlot()`. `durableGuard` commits its Firestore writes and returns `{ ok: true }` (per-IP `ai:min`/`ai:day` +1 and the `_global_<day>` spend ceiling +1) *before* `acquireSlot()` is ever called. When the process is already at `MAX_CONCURRENT` (default 4) in-flight provider calls — trivially reached because a single generation can hold a slot for up to ~90s — `acquireSlot()` returns false and the request is refused with a 429, but the spend unit and rate counts were already durably incremented. Reproduce: fire 20 concurrent `POST /api/ai`; the ~16 that lose the slot race each still burn one `_global_<day>` unit and one `ai:day` unit despite doing zero provider work. Repeat across IPs and ~2000 concurrency-rejected requests exhaust `AI_GLOBAL_DAILY_CEILING`, flipping the whole install to demo/refused for the rest of the day.
- **Root cause**: The irreversible, "commit-on-pass" spend accounting is sequenced ahead of the concurrency gate, violating the invariant both `rate-limit.ts` and `durable-limit.ts` document ("NOTHING is incremented unless every check passes, so a rejected request never consumes budget") — that invariant holds within `durableGuard` but is broken by the composition, because `acquireSlot` is a later check with no compensating decrement.
- **Impact**: Self-inflicted budget/DoS drain — a traffic spike (or a cheap distributed burst) that saturates the 4-slot cap silently eats the global daily paid-spend ceiling and per-IP daily budget without a single real generation, forcing legitimate users into demo mode / 429s.
- **Fix sketch**: Move `acquireSlot()` ahead of `durableGuard` (take the cheap in-process slot first, `releaseSlot()` if a later check fails), OR add a `refundSpend(ip, spendUnits)` path in `durable-limit.ts` and call it when `acquireSlot()` fails. Simplest: reorder to `tooLarge → acquireSlot → durableGuard`, releasing the slot on the `!limited.ok` branch.

## 2. Signed-in users are charged their daily AI quota for demo / no-provider results that are never even cached

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/ai/route.ts:94`
- **Scenario**: In `cachedRespond`, `consume(userId, "aiEval")` charges the daily quota *before* `gen()` runs. When no provider is configured (the app's deliberate public-demo posture — `/api/ai/status` exists precisely to warn "would degrade to the canned demo"), `gen()` returns an `AiResponse` with `meta.demo = true`. `setCachedAi` (`response-cache.ts:44-45`) explicitly refuses to cache a `meta.demo` result — so the quota was spent AND the next identical request charges again. The Creative Studio has the same shape: `src/app/api/images/route.ts:74` charges `count` `image` units before `generateImageSet`, then only *persists* when `result.source === "leonardo"` (`:106`) — i.e. the code knows a placeholder run isn't a real generation for persistence, but still bills `count` units for placeholder SVGs on any install without `LEONARDO_API_KEY`.
- **Root cause**: Quota is charged on "a request was made" rather than "a real, paid provider served it"; the demo/fallback signal (`meta.demo` / `source !== "leonardo"`) that both the cache and the persist paths respect is ignored by the billing path.
- **Impact**: On a demo-configured deploy every signed-in generation burns quota for canned output; a user exhausts their daily `aiEval`/`image` limit having received only demo answers, and (for `/api/ai`) pays again on every repeat because demo results aren't cached.
- **Fix sketch**: Charge after a successful real generation: run `gen()` first, and only `consume(...)` when `!result.meta?.demo` (and for images, when `result.source === "leonardo"`), mirroring the guard the persist/cache paths already use. Keep the pre-check cache lookup so cache hits still cost nothing.

## 3. Quota is consumed before the paid call and never refunded on provider failure — a client retry loop drains the daily limit

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/app/api/ai/route.ts:107`
- **Scenario**: `cachedRespond` does `consume()` → `gen()`. If `gen()` throws (provider 502, timeout, `request.signal` abort), the outer `catch` (`:432-446`) returns a 502 but the quota increment already committed and there is no refund/decrement API (`consume` in `usage.ts` only ever increments; no `refund` exists). Same in `images/route.ts:89` (N units charged, `generateImageSet` throws → 502) and `nobg/route.ts:44` (`removeBackground` throws → 502). Reproduce: point at a flaky provider; each failed attempt permanently costs quota, and the client's auto-retry-on-502 turns into a quota-draining loop that returns nothing.
- **Root cause**: Charge-then-do with no `try/finally` compensation — the metering assumes the provider call always succeeds once the quota check passes.
- **Impact**: Transient provider outages silently burn users' daily budget; combined with any client retry the user can hit "Denní limit vyčerpán" without a single successful generation.
- **Fix sketch**: Fold this into #2's charge-after-success change, or add `refundUsage(userId, kind, amount)` to `usage.ts` (a transactional `Math.max(0, current - amount)` decrement) and call it in each route's `catch` before returning 502.

## 4. `/api/images/upload-ref` is the one paid Leonardo endpoint with neither the global spend ceiling nor the concurrency cap, so distributed abuse bypasses both process-wide protections

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/api/images/upload-ref/route.ts:23`
- **Scenario**: This route calls `durableGuard(clientIp, [RATE_RULES.aiPerMin()])` with **no** `spendUnits` (so `countSpend` is false → the `AI_GLOBAL_DAILY_CEILING` is skipped) and **no** `acquireSlot()`, yet it buffers up to 8 MB (`MAX_BYTES`) via `file.arrayBuffer()` and calls `uploadInitImage` — a real Leonardo API round-trip (up to 60s). `paid-guard.ts`'s docstring waves this away as a "deliberately lighter, IP-throttle-only upload", but per-IP `aiPerMin` (8/min) does nothing against a distributed burst: N attacker IPs × 8/min each hold an 8 MB buffer + an outbound Leonardo upload simultaneously, with no global daily bound and no in-flight cap. Reproduce: 200 IPs × 8 concurrent multipart uploads = ~12.8 GB of in-flight buffers plus 1600 concurrent Leonardo uploads, none of which count toward the ceiling that caps every other paid endpoint.
- **Root cause**: The "an upload omits `spendUnits`" carve-out conflates "cheap to us" with "not a provider call" — `uploadInitImage` is a paid provider call and the 8 MB buffer is a memory-pressure vector, but the endpoint opts out of both the global ceiling and the concurrency cap.
- **Impact**: Cost drain (uncapped Leonardo uploads) + memory-exhaustion / OOM risk on a burst, on the single endpoint exempt from the two process-wide guards.
- **Fix sketch**: Front `upload-ref` with `acquireSlot()`/`releaseSlot()` and give it a small `spendUnits` (e.g. via a `guardPaidUpload` variant) so it counts toward the concurrency cap and the daily ceiling, or add a dedicated `upload` bucket with its own tight per-day cap and a separate concurrency ceiling.

## 5. The "Denní limit … vyšší plán (ceník na /cena)" quota-exhausted 429 body is hand-rolled in three routes

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/app/api/ai/route.ts:96`
- **Scenario**: The quota-exceeded 429 response — `{ error: "Denní limit … Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).", code: "quota", upgradeUrl: "/cena" }` — is built inline three times: `ai/route.ts:96-104` (aiEval), `images/route.ts:78-85` (image, with the count-aware "nestačí na N variant" wording), and `nobg/route.ts:34-40` (image). Verified via grep that no shared `quotaExceededResponse` helper exists (the only shared 429s are `tooManyRequests`/`payloadTooLarge` in `rate-limit.ts`, which are the *rate-limit* 429s, not the *plan-quota* 429). This is genuinely new — the prior code_refactor report flagged the guard sequence, tenancy resolvers, the userId cast, `num`, and delete-body parsing, but not the quota-429 body.
- **Root cause**: No `plan-quota → 429` response builder; each metered route formats the upgrade message and `code`/`upgradeUrl` fields itself.
- **Impact**: Low — three copies of the upgrade CTA drift independently (e.g. a pricing-URL change or a `code` rename must land in three places; already the wording has forked into aiEval vs image vs count-aware variants).
- **Fix sketch**: Add `export function quotaExceeded(status: UsageStatus, kind: UsageKind, opts?: { message?: string }): Response` to `usage.ts` (or a small `usage-http.ts`) returning the `{ error, code: "quota", upgradeUrl: "/cena" }` shape with the shared "/cena" CTA, and let callers pass the kind-specific sentence. Low priority; touch only if these files are edited.
