# EV1 fix — AI tool client timeout vs. dev provider latency

**Finding:** `/ai-asistent` aborted generations at a flat **60s** client ceiling, while the dev provider (Claude CLI cold spawn) needs ~50–130s. The brief was a coin-flip and the heavier **article-draft never completed**, blocking Eva's brief→publishable-draft loop. The `/app` campaigns analyze had no such abort (ran 104s to success) — inconsistent policy.

## Root cause (two layers, both at the 60s boundary)
1. **Client:** `useAiTool.AI_TIMEOUT_MS = 60_000` hard-aborts the fetch (AbortController), regardless of provider.
2. **Server:** `CLAUDE_TIMEOUT_MS = 90_000` per-CLI-call cap was too tight for the heaviest tool (the full article-draft body), forcing a retry that pushed total time past the client ceiling.

## Change
- `src/components/ai/useAiTool.ts` — `AI_TIMEOUT_MS` is now **environment-aware**: `production → 60s` (Gemini answers in seconds), `development → CLAUDE_TIMEOUT_MS + 30s` margin. It imports `CLAUDE_TIMEOUT_MS` so the client ceiling **tracks the server cap** (one source of truth). `AI_TIMER_TARGET_MS` also env-aware (prod 18s / dev 50s) so the loading timer paces honestly.
- `src/lib/llm/models.ts` — `CLAUDE_TIMEOUT_MS` `90_000 → 150_000`, giving the heaviest generation server headroom. (Dev client ceiling becomes 180s; prod is untouched at 60s.)
- `src/components/ai/primitives.tsx` — fixed two stale "30s" comments.

## Before → after (live re-drive, same journey)
| Step | Before | After |
|------|--------|-------|
| Brief | timed out at 60s (then 47s on retry — flaky) | **done ~50–74s** |
| Article-draft | **timed out at 60s every time** | **done ~126–129s** (renders publishable article, exports .md/.json) |

Eva's journey: **Blocked-at-draft → Completed.** The loop closes; the draft content is high quality and brand-specific (full sectioned article on nut/seed storage, per-type shelf-life, FAQ, CTA).

## Safety / scope
- **Prod is unchanged** — the 60s ceiling still applies under `NODE_ENV=production` (Gemini is fast). The longer ceiling is dev-only.
- Verified: `npm run typecheck` + lint clean; no test pins the constants; live drive confirms both calls complete.
- Trade-off accepted: a genuinely stuck dev call now fails at ~180s instead of 60s — acceptable for the dev CLI, and the loading timer shows a graceful "Model přemýšlí o něco déle…" past the 50s target.
- Not done (deliberately): streaming partial output would remove the long synchronous wait entirely — a larger product change, out of scope for this fix.
