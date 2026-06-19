# Pilot run summary — 2026-06-19 discovery

First full pilot of the simulated-UAT standard: 3 Characters × 1 journey each, driven against the real app (`:3100`, `DEV_AUTH` + `LOCAL_DB`), hybrid browser + code cross-check + adversarial verify.

## Scorecard

| Character | Journey | Surface | Status | Confirmed | Refuted |
|-----------|---------|---------|--------|-----------|---------|
| Petra (marketing manager) | prove-roi-this-month | /dashboard | Completed-with-friction | F1 closed-month pacing, F2 channel ΔRevenue identical | — |
| Tomáš (PPC specialist) | react-to-flagged-campaign | /app/demo-eshop/kampane | Completed-with-friction | FT1 sort-default, FT2 hover-only reason, FT3 latency | FT4 timestamp (false alarm) |
| Eva (content/SEO strategist) | brief-to-publishable-draft | /ai-asistent | Blocked → **Completed (EV1 fixed)** | EV1 60s ceiling blocks loop *(fixed)*, EV2 keyword gap | — |

Per-journey detail: `report.md` (Petra), `report-tomas.md`, `report-eva.md`, with `findings*.json` + first-person journals.

## The cross-cutting theme: AI latency vs. client ceilings

The single highest-leverage issue spans two journeys and is a **policy inconsistency**, not just slowness:

- **`/app` campaigns analyze** (Tomáš, FT3): *no* client abort → a 104s eval completes (but is slow to wait on).
- **`/ai-asistent`** (Eva, EV1): a hard **60s** abort (`useAiTool.AI_TIMEOUT_MS`) → the brief is flaky at the boundary and the article-draft **never completes**, blocking the whole content loop.

Same class of model call, opposite handling. Root cause is the dev provider's latency (Claude CLI cold spawn, ~47–130s); prod Gemini clears 60s — but the inconsistent per-surface timeout is a code issue regardless.

> **Fixed (see `EV1-fix.md`).** The assistant ceiling is now environment-aware and tracks the server cap (raised 90s→150s for the heavy draft); prod stays at 60s. Eva's loop now closes (brief ~50–74s, draft ~126s). This is the single highest-leverage fix from the run — it unblocked Eva and de-risks Tomáš's latency friction (FT3).

## What the harness proved about itself
- **Caught journey-level failures invisible to feature tests:** every endpoint returns 200 (e2e would be green), yet Petra can't answer "this month", and Eva never gets her draft. These are failures of *what the product does for the user*, not broken assertions.
- **The hybrid code-check did real work both ways:** it *sharpened* findings (FT1 → "the app's own `triageWeight` contradicts the default sort"; EV1 → exact ceiling + cross-surface inconsistency) and *refuted* a plausible-but-wrong one (FT4 timestamp). That's the difference between signal and noise.
- **Recorded what passed,** so the scorecard is a fair picture: the triage layer and the AI grounding (Tomáš) and the brief quality (Eva) are genuinely strong.

## Promotion candidates (discovery → regression gate)
- Tomáš `react-to-flagged-campaign` — ran Completed on a stable path; promote once FT1 is addressed.
- Eva `brief-to-publishable-draft` — promote after EV1 is fixed (and then the draft *content* can finally be evaluated).
- Petra `prove-roi-this-month` — promotable now as an acceptance check around the dashboard.

## Environment note
Driven on the local offline stack (no Google OAuth, users/projects in `.data/systedo.db`). The authed product was reachable for the first time thanks to `DEV_AUTH` + `LOCAL_DB` (see `authed-validation.md`).
