# Ambiguity+Business Fix Wave 1 — "Numbers you can trust"

> 6 commits, 6 findings closed (all High). Theme: numbers the case study displays that were
> subtly wrong, misleading, or self-contradicting.
> Baseline preserved: tsc 0 → 0 · unit tests 173 → 173 · 0 regressions.

## Commits

| # | Commit | Finding | Value | Files |
|---|--------|---------|------:|-------|
| 1 | `54be0dd` | format-helpers #1 — "−0,0 %" sign before rounding | High | `src/lib/format.ts` |
| 2 | `7f7e49a` | campaign-model-prompts #1 — ROAS/PNO thresholds not equivalent | High | `src/lib/campaigns/triage.ts` |
| 3 | `b2e45ff` | campaign-model-prompts #2 — burned-budget == paused in prompt | High | `src/lib/campaigns/report-input.ts` |
| 4 | `9c41ad6` | metrics-engine #2 — anomaly impact nets windfalls vs losses | High | `src/lib/metrics/anomalies.ts` |
| 5 | `8222b13` | trend-channel #1 — five identical channel revenue deltas | High | `ChannelTable.tsx`, `metrics/channels.ts` |
| 6 | `a1bede6` | campaign-console #1 — sort buries the worst campaigns | High | `CampaignTable.tsx` |

## What was fixed

1. **`fmtSignedPct` rounds before choosing its sign.** Previously the sign came from the raw fraction, so a delta rounding to 0,0 % still printed a trust-eroding "−0,0 %" next to KPIs and inside AI prompts. Now mirrors `fmtSignedInt`.
2. **`PNO_CRITICAL_RATIO = 1 / ROAS_CRITICAL_RATIO`.** The two "critical" thresholds were sold as equivalent but were 1.6 vs the true reciprocal 1.667, leaving a band where the PNO cell went red while ROAS/triage stayed neutral — the cross-surface contradiction the module exists to kill. Now genuinely reciprocal (target ROAS = 1/target PNO).
3. **Burned-budget is distinct from paused in the eval prompt.** `cost>0, value=0` now prints `0× / ∞ (bez návratnosti)` instead of the same "—" a paused campaign shows, so the model's grounded reasoning sees the worst case.
4. **Anomaly impact is loss-honest.** `net` now counts only revenue shortfalls + cost overspend (windfalls/savings moved to a new `gained` field), so a good day can't silently cancel a bad one in the "dopad ≈ −X Kč" headline.
5. **Channel revenue delta shown once.** Constant-share projection makes every channel's revenue delta identical to the aggregate; the per-row column rendered five identical badges that read as fake data. Removed the per-row column; the genuine delta now sits once under the Total revenue, with the property documented in `channels.ts`.
6. **No-data campaigns sort as worst.** No-revenue PNO / no-conversion CPA carried a `safe()` 0, so worst-first sorts buried the most wasteful campaigns at the bottom; the comparator now maps those "—" rows to +∞ on lower-is-better metrics.

## Verification

| Gate | Before | After |
|------|-------:|------:|
| tsc --noEmit | 0 | 0 |
| unit tests | 173/173 | 173/173 |
| LLM gate | green (cached) | green (cached, no hashed files touched) |

## Patterns established (catalogue 1–4)

1. **Sign-before-rounding** — derive a delta's sign from the value *as displayed*, never the raw input, or near-zero deltas render "−0,0".
2. **Reciprocal-threshold drift** — when two thresholds (ROAS vs PNO) are "the same line two ways," derive one from the other; a hand-typed pair silently diverges.
3. **`safe()`/zero-denominator sentinels mislead sorts & prose** — a 0 standing in for "no data" is the *best* value on a lower-is-better metric; map to ±∞ at the comparison site and distinguish it in text.
4. **Constant-share projection cancels per-row deltas** — any per-row metric that's a fixed fraction of a total carries zero extra information row-to-row; show it once on the total.

## What remains
Waves 2–6 (commit-safe) + gate-locked track. Next: Wave 2 "Stop the code lying about itself" (drift/SSOT).
</content>
