# Onboarding, Integrations & Growth Funnel

> Total: 5
> Critical: 0 · High: 0 · Medium: 2 · Low: 3
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `fetchSiteText` performs a server-side fetch of an arbitrary caller-supplied URL on the *public, unauthenticated* `/api/ai` endpoint — contradicting its own "authed owner" threat model

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/onboarding/site-fetch.ts:74`
- **Scenario**: `site-fetch.ts`'s header comment states the SSRF guard is acceptable because "it's again an authed owner supplying a URL." But its only caller, `src/app/api/ai/route.ts:402-427` (`mode === "onboarding-scan"`), lives on a POST handler whose own comment (route.ts:243) declares it "a public, unauthenticated POST." No `auth()`/`currentUserId()` gate precedes the `fetchSiteText(p.value.url)` call — only `guardPaidGeneration` (per-IP throttle). So any anonymous client can POST `{mode:"onboarding-scan", url:"<anything>"}` and make the server fetch that URL, then spend a Gemini generation on the result. The `fetchFeed` SSRF guard (private-IP BlockList, scheme allow-list, size/time caps) still blocks internal-network reads, but the *documented invariant that a fetch is only ever triggered by an authenticated project owner is false*.
- **Root cause**: `site-fetch.ts` was written for the authed project-scoped onboarding flow, then wired into the deliberately-public `/api/ai` multiplexer; the "authed owner" assumption in the comment (and the reduced scrutiny it invites for future changes to the guard) was never revisited for the anonymous path.
- **Impact**: An unauthenticated user can use the app as an SSRF-guarded scrape-and-summarize proxy for arbitrary public URLs, burning the app's Gemini spend per request. Bounded today by the per-IP rate limiter + response cache, but the false "authed owner" premise means any weakening of `fetchFeed`'s guard (or a new caller trusting the comment) silently exposes the anonymous surface.
- **Fix sketch**: Either require a session for `onboarding-scan` in `route.ts` (it is inherently a per-project owner action — unlike the genuinely-public generation modes), or correct the `site-fetch.ts` header to state the real threat model (untrusted anonymous input, SSRF guard is the *only* line of defense) so the guard is maintained accordingly.

## 2. Onboarding apply/dismiss is a read-merge-write over a single replaced blob — concurrent writers lose each other's update (can silently un-apply a scan)

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/onboarding/store.local.ts:24`
- **Scenario**: `saveOnboarding` (both `store.local.ts:24` and `store.firestore.ts:24`) replaces the *entire* `{scan, scanApplied, dismissed}` blob — no field-level merge, no version check. The onboarding POST route reads `existing`, spreads it, mutates one part, and writes the whole thing back (`api/projects/[id]/onboarding/route.ts:25-48`). Dismiss is triggered from the overview card (`OnboardingProgressCard`) while apply is triggered from the Start module (`OnboardingModule`) — two different surfaces on the same project. If both fire close together (two tabs, or dismiss during an in-flight apply): request A reads `existing={}`, request B reads `existing={}`; A writes `{scan, scanApplied:true}`; B writes `{dismissed:true}` computed from its stale `{}` — clobbering the scan. The applied grounding profile is gone (`scanApplied` reverts to false), sending the user back to the "scan your site" state.
- **Root cause**: The store exposes only whole-document replace, and the route does last-write-wins RMW with no optimistic-concurrency token, assuming onboarding writes never overlap.
- **Impact**: Lost update / user-visible state regression — an applied onboarding scan (which seeds every grounded module) can be silently reverted by a concurrent dismiss, or vice-versa. Low probability but real data loss, and the seeded competitor set (written separately at route.ts:41) then diverges from a `scan`-less onboarding blob.
- **Fix sketch**: Give the Firestore path a field-level merge (`.set({...}, {merge:true})` or a transaction that re-reads inside) and the local path an `UPDATE ... SET json_patch(...)` or a `SELECT ... ` inside a `db.transaction()`; or version the blob (`updatedAt` guard) and reject/retry on mismatch. At minimum, dismiss should patch only `dismissed`, never rewrite `scan`/`scanApplied`.

## 3. `decodeEntities` silently passes through hex numeric entities (`&#x2019;`) and truncates astral code points

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/onboarding/site-fetch.ts:35`
- **Scenario**: `decodeEntities` only handles decimal numeric entities: `.replace(/&#(\d+);/g, …)`. Real homepages routinely emit *hex* entities — `&#x2019;` (right single quote/apostrophe), `&#x2013;` (en-dash), `&#xE9;` — in `<title>`/`<meta description>` and body copy. These survive untouched, so `extractSiteText` yields a title like `Bob&#x2019;s Bakery` and passes it as `siteTitle`/`pageText` to the onboarding-scan LLM. Separately, decimal astral entities use `String.fromCharCode(code)`, which truncates code points > 0xFFFF (e.g. `&#128512;` → wrong glyph) instead of `fromCodePoint`.
- **Root cause**: The decoder was written for "the handful of entities that matter for prose" (its comment) and the numeric branch was assumed to be decimal-only, missing the equally-common hex form and the surrogate-pair case.
- **Impact**: Degraded scan input — literal `&#x…;` sequences reach the LLM as part of the business name/summary it's asked to distill, lowering scan quality and occasionally leaking raw entity markup into the suggested profile the user then applies. Not a crash; a quiet quality/correctness erosion on the exact prose the feature exists to read.
- **Fix sketch**: Extend the numeric replace to cover hex — `/&#(?:x([0-9a-f]+)|(\d+));/gi` — and decode via `String.fromCodePoint(parseInt(hex,16) || Number(dec))` guarded by `Number.isFinite`. (Note the prior 2026-07-09 report #4 already flags consolidating this with `catalog/feed.ts`'s decoder — which *does* handle hex; folding both would fix this gap for free.)

## 4. Audience goal tracker projects the *revenue* ETA from the *subscriber* growth rate

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/audience/compute.ts:327`
- **Scenario**: `goalProgress(funnel, summary, goals, growthRate)` applies its single `growthRate` to *both* goal lines via the shared `line()` closure — `subscribers: line(funnel.subscribers, …)` and `revenue: line(summary.monthlyRevenue, …)` (compute.ts:326-329). The only caller passes the subscriber MoM growth: `goalProgress(funnel, s, goals, subGrowth)` where `subGrowth = subTrend?.momGrowth ?? 0` (`AudienceModule.tsx:243-244`). So the revenue-target ETA (`ln(target/current)/ln(1+g)`) is computed with subscriber growth, even though the module has a separate `rpmTrend` and revenue moves with ARPU × subscribers, not subscribers alone.
- **Root cause**: `goalProgress` collapsed two independently-growing metrics onto one growth parameter; correct only when ARPU is flat.
- **Impact**: A business growing its list fast while ARPU is flat/declining sees an over-optimistic "revenue target reachable in N months" estimate — a misleading forecast in a client-facing goal tracker. Illustrative-data today, but the same function is the one that would run on live numbers.
- **Fix sketch**: Give `goalProgress` a second growth argument (`revGrowth`) and thread the revenue/RPM-derived rate (`rpmTrend?.momGrowth`) into the revenue line, or compute each `GoalLine`'s ETA from its own series' growth.

## 5. `strList` in `onboarding/types.ts` re-implements `parseGroundingList` from `ai/validation.ts` — a second, distinct duplication across the same wire

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/onboarding/types.ts:40`
- **Scenario**: `strList(v, maxCount, maxLen)` (types.ts:40-54) — trim each item, drop empties, dedupe by `toLowerCase()`, cap length then count — is functionally identical to `parseGroundingList(v, maxCount, maxLen)` in `src/lib/ai/validation.ts:791-805` (same `seen` Set, same lowercase key, same length-then-count caps). Both sanitize the *same* onboarding-scan grounding fields (keywords/competitors) at the two ends of one wire: `validation.ts` on the request in, `types.ts` on the user-edited profile back in. This is a *different* duplication than the prior 2026-07-09 report #2 (which flagged only the `KNOWN_TYPES` enum literal vs `PROJECT_TYPES`); this is the list-sanitizer helper, not the type set.
- **Root cause**: The onboarding profile sanitizer and the AI request validator were authored independently and each grew its own bounded-string-list helper.
- **Impact**: Two copies of the same "coerce a bounded, deduped short string list" logic that must be kept in sync by hand; a future hardening (e.g. Unicode-normalize before dedupe, or trim control chars) applied to one leaves the other weaker on the same field. Pure functions, no boundary risk to sharing.
- **Fix sketch**: Extract one `boundedStringList(v, maxCount, maxLen)` (plus its `str(v, max)` sibling) into a small shared `src/lib/text/` util; have both `onboarding/types.ts` and `ai/validation.ts` import it. Pairs naturally with fixing prior #2 (import `PROJECT_TYPES`) in the same file.
