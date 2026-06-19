# UAT scorecard — Tomáš × react-to-flagged-campaign (2026-06-19)

**Surface:** `/app/demo-eshop/kampane` — the authed campaigns module, drivable for the first time via the new offline local mode (`DEV_AUTH` + `LOCAL_DB`).
**Driver:** Playwright/chromium against dev server `:3100`. Includes **one live AI evaluation** (real Claude CLI call, ~104s). Evidence in `shots/`.

| Character | Journey | Surface | Status |
|-----------|---------|---------|--------|
| Tomáš (PPC specialist) | react-to-flagged-campaign | /app/demo-eshop/kampane | **Completed-with-friction** |

He completed every part of his job: saw it needed attention, sorted worst-first, understood why, got a grounded AI eval he'd act on, and left knowing the next action. The friction is in *getting* there, not the substance.

## Confirmed findings

| id | type | sev | one-liner |
|----|------|-----|-----------|
| FT1 | quality-gap | **major→minor** | Table defaults to cost-desc, not worst-first; criticals sit below warnings until you click sort — and `triage.ts:191` itself defines worst-first as the right attention order. |
| FT3 | quality-gap | **major** | One per-campaign AI eval took ~104s — completed (no timeout), but too slow to triage all six; lean on cache + portfolio eval. |
| FT2 | confusion | minor | Flag *reason* is hover-only; the row shows the badge but not the rule behind it. |

## Refuted on verification (appendix)

| id | type | sev | verdict | note |
|----|------|-----|---------|------|
| FT4 | trust | — | **refuted** | "před 8 hodinami" looked like a stale-timestamp bug. Code check: `format.ts:228 fmtRelative` is timezone-safe (UTC instants), and the two captures were ~8 real hours apart (sync in the prior session, analyze in this one). The label is *correct* — false alarm killed by grounding. |

## What passed (this module is strong — recorded so the scorecard isn't only negative)
- **Triage is trustworthy:** banner reconciles exactly with the rules; flags map to recognizable PPC rules (paused-but-spending, ROAS <60% of an 18% PNO target); one source of truth shared by badge/cell/banner.
- **Priority sort** floats criticals worst-first.
- **AI eval is exemplary:** grounded in real numbers, scores 20/100 honoring the "critical ≤ 50" guardrail, gives prioritized concrete actions, and shows model + latency + $0 cost + the exact prompt. The prompt builder injects the deterministic triage so the model can't contradict the screen.
- **Deterministic budget-move** quantifies the fix with no AI call.

## Why this validates the harness (again)
- **Code cross-check sharpened FT1 from opinion to fact.** "Default sort feels wrong" became "the app's own `triageWeight` encodes worst-first as the intended attention order, and the default UI ignores it" — a precise, defensible finding with a one-line fix.
- **It restrained two false alarms.** (a) The 104s wait looked like it might trip the AI Assistant's documented 30s ceiling — but that ceiling is a *different surface*; this call completed at 200, so FT3 is latency friction, not a timeout bug. (b) The "8 hodinami" timestamp looked like a staleness bug — but `format.ts` is timezone-safe and the captures were genuinely ~8h apart across sessions, so FT4 was **refuted**. Grounding kept both honest instead of shipping plausible-but-wrong findings.

## Next
- This journey is a **promotion candidate** once FT1 is addressed (it ran Completed on a stable path). `/uat promote react-to-flagged-campaign` would freeze the happy path (sync → priority sort → analyze top critical) into a regression gate.
- FT4 is a quick code check away from confirmed/refuted.
- Remaining pilot journey: Eva × the AI brief→article loop on `/ai-asistent`.
