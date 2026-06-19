# UAT scorecard — Eva × brief-to-publishable-draft (2026-06-19)

**Surface:** `/ai-asistent` → "Obsahový brief". Real Claude-CLI model calls under a **60s client ceiling** (`useAiTool.AI_TIMEOUT_MS`).
**Driver:** Playwright/chromium against `:3100`; 2 attempts (the first brief timed out, a warm retry got through). Evidence in `shots/`.

| Character | Journey | Surface | Status |
|-----------|---------|---------|--------|
| Eva (content/SEO strategist) | brief-to-publishable-draft | /ai-asistent | **Blocked at draft → Completed after EV1 fix** |

Originally: she got a high-quality brief (flakily), but the **`Rozepsat článek` draft step — the part that delivers her "publishable draft" — timed out at 60s every time**, so the loop never closed.

> **Update — EV1 fixed (see `EV1-fix.md`).** Client timeout is now env-aware (prod 60s; dev tracks the server cap) and the server cap was raised for the heavy draft. Live re-drive: brief done ~50–74s, **article-draft done ~126s** — a full publishable article rendered + exported. The loop now closes; journey status → **Completed**.

## Confirmed findings

| id | type | sev | one-liner |
|----|------|-----|-----------|
| EV1 | broken-flow | **major** | Brief→draft loop doesn't close in dev: generations race a 60s client ceiling — draft times out, brief is borderline-flaky (60s fail, then 48s pass). Same slow calls are *tolerated* on `/app` analyze (104s) but *aborted* here — inconsistent policy. |
| EV2 | quality-gap | minor | The brief fails two of its *own* scorecard checks (keyword missing in meta + intro). |

## What passed (the substance is strong — it's the delivery that fails)
- **Brief quality is genuinely brand-specific** (Mionelo nuts/seeds): žluknutí/oxidation, container choice, freezing, shelf-life by type — not boilerplate. Clears Eva's #1 bar.
- **SERP preview** present (desktop/mobile, real slug/title/meta) — she can judge before committing.
- **Honest scorecard** (75/100) that even marks down its own gaps; title/meta within SEO limits; 7-section outline + 4 FAQ + 8 keywords + 4 on-brand internal links.
- **Transparency + export:** model + latency + $0 cost, "show the prompt", .md export — so the brief-only outcome is still usable.

## Why this validates the harness
- **EV1 is a journey-level blocker invisible to feature tests.** `/api/ai` returns **200** — every assertion an e2e suite makes would pass — yet the *user* hits a hard 60s abort and never gets her draft. Only a Character running the real loop end-to-end surfaces "the endpoint works but the journey doesn't."
- **The code cross-check upgraded it from anecdote to a precise, fixable claim:** not "the AI is slow" but "`useAiTool` hard-aborts at 60s while the dev provider needs ~47–104s, and the policy is inconsistent with the `/app` analyze route that has no such abort." That points straight at the fix.
- **Honest scoping:** flagged that the root cause is the dev provider (prod Gemini may clear 60s), so the severity isn't overstated as a prod outage — but the per-surface inconsistency is a real code issue regardless.

## Next
- EV1 is the highest-value fix across the three journeys: raise/stream the assistant ceiling and make timeout policy consistent. Cheap, unblocks the whole content loop.
- Re-run this journey after the fix; if the draft then lands, it becomes a promotion candidate (and I can finally evaluate draft *content* quality, which was unreachable here).
