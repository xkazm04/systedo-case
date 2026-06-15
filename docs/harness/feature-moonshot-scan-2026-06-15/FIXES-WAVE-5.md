# Fix Wave 5 — API Hardening (systedo-case)

> 5 findings closed. The paid, unauthenticated LLM surface is now throttled,
> resilient, self-correcting and observable.
> Baseline preserved: 0 TS errors / 0 lint → 0 / 0. Production build ✓. LLM gate 4/4 ✓.

Date: 2026-06-15 · Wave chosen first because it contained the run's one genuine
risk finding (an unauthenticated public POST that spends paid provider budget).

## What was fixed (grouped)

### Abuse guards (the Critical)
1. **Rate limiting + abuse guard on `/api/ai`** *(Critical — `ai-generation-api.md` #4)*
   New `src/lib/ai/rate-limit.ts`: a fixed-window per-IP limiter persisted in the
   existing `node:sqlite` store (new `rate_limits` table, zero new deps), an
   in-process concurrency cap so slow 90 s spawns can't stack, a content-length
   body guard, and `clientIp()` from the proxy headers. `/api/ai` now enforces a
   per-minute **and** per-day ceiling → `429` + `Retry-After`, oversized bodies →
   `413`, and over-capacity → `429`. All limits tunable via env (documented in
   `.env.example`).
2. **Same guards on the campaign routes** *(`campaign-sync-api.md` #4)*
   `/api/campaigns` POST (sync) gets a looser per-minute cap; `/api/campaigns/analyze`
   POST (the paid LLM eval) gets the per-minute + per-day caps **and** the
   concurrency slot. GET (cheap read) stays open. Distinct buckets so endpoints
   don't share one budget.

### Resilience
3. **Provider fallback chain + bounded retries** *(High — `llm-provider-wrapper.md` #1)*
   `generateStructured` was single-shot: in dev it tried only Claude and a thrown
   CLI error fell straight through to the demo. It's now an availability-filtered
   provider list (dev `[claude, gemini]`, prod `[gemini, claude]`) with a bounded
   retry (2 attempts, short backoff) on the recoverable errors the adapters
   already enumerate (unparseable JSON / empty / timeout / CLI failure), then
   cross-provider fallback, then demo as a true last resort. Stamps
   `meta.provider`, `meta.attempts`, `meta.fellBack`.

### Correctness
4. **Server-side output validation + one self-repair re-prompt** *(High — `ai-generation-api.md` #3)*
   The ad/brief prompts demanded character limits the server never enforced
   (`normalizeAdResult` trimmed whitespace and array *length*, never char length).
   Now: a `validate?(parsed)` hook on `GenerateArgs`; on violations the wrapper
   re-prompts the model once to self-correct (`meta.repaired` / `meta.violations`),
   and `normalizeAdResult`/`normalizeBriefResult` **clamp** headlines, descriptions,
   callouts, long headline, title tag and meta description to their limits as the
   guaranteed floor. The server can no longer emit over-limit ad copy Google
   Ads / Sklik would reject.

### Observability
5. **Token + cost accounting in the result envelope** *(High — `llm-provider-wrapper.md` #2)*
   `runGemini` now threads `usageMetadata` out as `meta.usage`
   (input/output/total tokens); a small per-model rate table (`src/lib/llm/cost.ts`)
   derives `meta.estCostUsd`. The dev Claude/subscription path is tagged
   `estCostUsd: 0`, making the "free subscription vs metered API" story explicit
   and visible. (Claude usage parsing deliberately left out to avoid changing the
   working CLI path — subscription = 0.)

## Files changed

| File | Fix | New/мod |
|---|---|---|
| `src/lib/db.ts` | 1 | +`rate_limits` table |
| `src/lib/ai/rate-limit.ts` | 1, 2 | **new** (~150 LOC) |
| `src/app/api/ai/route.ts` | 1 | guards + slot in try/finally |
| `.env.example` | 1 | documented 5 tunables |
| `src/app/api/campaigns/route.ts` | 2 | sync rate limit + body guard |
| `src/app/api/campaigns/analyze/route.ts` | 2 | eval limit + slot |
| `src/lib/llm/index.ts` | 3, 4, 5 | provider loop, retry, validate hook, cost |
| `src/lib/llm/gemini.ts` | 5 | return `{ parsed, usage }` |
| `src/lib/llm/cost.ts` | 5 | **new** rate table |
| `src/lib/ai-types.ts` | 3, 4, 5 | optional `AiMeta` telemetry fields |
| `src/lib/gemini.ts` | 4 | clamp in normalize + `validateAds`/`validateBrief` |

## Verification

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` | 0 errors | 0 errors |
| `eslint .` | 0 errors | 0 errors |
| LLM gate coverage (static) | 4/4 | 4/4 (chokepoint intact) |
| `next build` | ✓ | ✓ (3 API routes dynamic) |

## Patterns established (catalogue)

1. **Public-paid-endpoint guard** — any unauthenticated route that spends a paid
   provider needs: per-IP fixed-window limit (min + day) + concurrency cap + body
   guard, persisted in the app's existing store, env-tunable. Reusable via
   `src/lib/ai/rate-limit.ts` for future routes.
2. **Provider chain over single-shot** — a multi-provider wrapper should iterate
   `availability-filtered providers` with bounded retry + fallback, not branch to
   one and drop to demo on any throw. Stamp which provider/attempt actually served.
3. **Validate-then-clamp** — enforce domain limits server-side as *both* a
   self-repair re-prompt (quality) **and** a normalize-time clamp (guarantee).
   Promises made in a prompt must be enforced in code, not just asked for.
4. **Envelope telemetry** — carry provider/attempts/fellBack/usage/cost in the
   response `meta` so the UI can surface what actually happened (cost, fallback,
   self-correction) without a second call.

## Commit status (read this)

**Not committed.** The target's working tree was already a large in-progress
snapshot (7 commits + an uncommitted WIP layer): `src/lib/llm/*`, `db.ts`, and the
campaign routes are **untracked**, and `ai-types.ts` / `gemini.ts` carried
*pre-existing* uncommitted edits. A per-fix atomic commit would have swept in that
unrelated WIP or entangled it with the hardening diff — so the wave was left in the
working tree for the owner to review and commit as they see fit. All changes are
verified green.

## What remains (other waves)

Waves 1–4, 6, 7 from `INDEX.md` are untouched. Adjacent un-done items from the
same reports: streaming (`generateStructuredStream`), output caching/persistence
(`generations` table), versioned-prompt eval harness, evaluation fingerprint
dedupe, non-destructive sync diff/history, scheduled/cron sync with `CRON_SECRET`.
