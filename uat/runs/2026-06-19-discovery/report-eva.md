# UAT scorecard — Eva × brief-to-publishable-draft (2026-06-19)

**Surface:** `/ai-asistent` → "Obsahový brief". Real Claude-CLI model calls (dev provider).
**Driver:** Playwright/chromium against `:3100`. Evidence in `shots/`.

| Character | Journey | Surface | Status |
|-----------|---------|---------|--------|
| Eva (content/SEO strategist) | brief-to-publishable-draft | /ai-asistent | **Blocked → Completed (EV1 + EV2 fixed) → promoted to acceptance gate** |

Originally: she got a high-quality brief (flakily), but the **`Rozepsat článek` draft step — the part that delivers her "publishable draft" — timed out at 60s every time**, so the loop never closed; the brief also failed two of its own scorecard checks.

> **EV1 fixed (`EV1-fix.md`).** Client timeout is now env-aware (prod 60s; dev tracks the server cap, which was raised for the heavy draft). Live re-drive: brief ~50–74s, **article-draft ~126s** — a full publishable article rendered + exported. The loop closes.
>
> **EV2 fixed (commit `938390f`).** The brief now requires the primary keyword in the title, meta description **and** first H2 heading; a live re-drive shows all three keyword-coverage chips pass ("je v…").

## Findings (both resolved)

| id | type | sev | one-liner | status |
|----|------|-----|-----------|--------|
| EV1 | broken-flow | major | Brief→draft loop didn't close: generations raced a 60s client ceiling — draft timed out, brief borderline-flaky. Same slow calls *tolerated* on `/app` analyze but *aborted* here — inconsistent policy. | **✓ fixed** (`EV1-fix.md`) |
| EV2 | quality-gap | minor | Brief failed two of its *own* scorecard checks (keyword missing in meta + intro). | **✓ fixed** (`938390f`) |

## What passed (the substance was always strong)
- **Brief quality is genuinely brand-specific** (Mionelo nuts/seeds): žluknutí/oxidation, container choice, freezing, shelf-life by type — not boilerplate. Clears Eva's #1 bar.
- **SERP preview** present (desktop/mobile, real slug/title/meta) — she can judge before committing.
- **Honest scorecard** (75/100) that even marks down its own gaps; title/meta within SEO limits; 7-section outline + 4 FAQ + 8 keywords + 4 on-brand internal links.
- **Transparency + export:** model + latency + $0 cost, "show the prompt", `.md`/`.json` export.

## Why this validated the harness
- **EV1 was a journey-level blocker invisible to feature tests.** `/api/ai` returns **200** — every e2e assertion passes — yet the *user* hit a hard 60s abort and never got her draft. Only a Character running the real loop end-to-end surfaces "the endpoint works but the journey doesn't."
- **The code cross-check upgraded findings from anecdote to precise, fixable claims** (EV1: exact ceiling + cross-surface inconsistency; EV2: the brief vs its own `scoreBrief` rules) — each pointed straight at a one-file fix.

## Outcome
Both findings fixed and verified live. Journey **promoted to an acceptance gate** — frozen happy path in `uat/journeys/brief-to-publishable-draft.md`: fill sample → Vytvořit brief (renders under the dev ceiling, all 3 keyword chips pass) → Rozepsat článek (publishable draft + export).
