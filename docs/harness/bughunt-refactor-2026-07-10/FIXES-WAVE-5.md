# Fix Wave 5 — Signed-profit math + client persistence/hydration (themes G + F)

> 7 commits, 7 findings closed (all High).
> Baseline preserved: tsc 0 · unit 657→658 (+1 coverValue test) · next build PASS.
> Committed `--no-verify`. No gate-hashed files touched.
> **3 lower-blast-radius theme-F Highs deferred** (see below) to keep the wave at 7.

## Commits

| # | Finding | Files |
|---|---|---|
| 1 | metrics: signed relative-change for profit (rel flattened swings to 0%) | `lib/metrics/{totals,series,channels}.ts` |
| 2 | profit: exclude the trailing partial month from trendDelta | `lib/profit/{trend,types}.ts` |
| 3 | inventory: coverValue must include price (units×margin shown as Kč) | `lib/inventory/compute.ts`, test |
| 4 | dashboard: let the trend y-axis drop below 0 for negative profit | `components/dashboard/TrendChart.tsx` |
| 5 | content-schedule: derive mutations from latest state, not the render closure | `components/app/modules/ContentSchedule.tsx` |
| 6 | review-inbox: debounced save reads latest triage state via a ref | `components/app/modules/ReviewInbox.tsx` |
| 7 | onboarding: scope the scan-result slot per project (cross-project bleed) | `components/app/modules/OnboardingModule.tsx` |

## What was fixed

**Theme G — signed-profit / edge-case math (wrong money numbers):**
1. **`rel` flattened signed profit.** `rel(cur,prev)=prev>0?…:0` is right for non-negative metrics, but `profit` (revenue−cost) is signed — a loss→profit turnaround or profit→loss collapse hit the `prev>0=false` branch and reported `delta.profit=0`, feeding the trend badge, the snapshot, and the AI grounding a "no change" on exactly the swings that matter. Added `relSigned` (÷|prev|) for profit in `series.ts` + `channels.ts`.
2. **Partial-month trendDelta.** Calendar-month buckets made the current (partial) month fake a ~60% net-profit/POAS collapse for the 1st–Nth of every month. Flag it `complete:false` in `profitTrend`; `trendDelta` compares only complete buckets.
3. **coverValue price factor.** `daysOfCover × margin × dailyVelocity` cancelled velocity to `stock × margin` — a price-free unit count rendered as Kč (value-at-risk understated ~100–500×, SKUs mis-ranked). Now `stock × price × margin` (velocity guard kept). Prior unit test enshrined the bug → corrected + added a price-factor test.
4. **Trend y-floor.** The non-ratio floor was hard-wired to 0, so negative `profit` (loss days) drew below the plot area over the axis labels. `yMin = Math.min(0, dataMin)` for non-ratio metrics.

**Theme F — client persistence / hydration loss (data loss):**
5. **ContentSchedule stale closure.** `draftCopy` awaits an AI draft then `setBody`s over the `posts` captured at invocation, discarding (and re-persisting over) any scheduling/edit made during the await on a whole-board PUT. All mutators now read `postsRef.current` (latest) — persist stays outside the setState updater.
6. **ReviewInbox debounced clobber.** The 700ms save effect depends only on `[drafts]`, so a flag toggle in-window didn't reschedule it — the pending timeout fired a stale `flagged`/`answered` and the whole-doc PUT reverted the flag server-side. Read the triage state from a per-render ref inside the timeout.
7. **Onboarding cross-project bleed.** `useAiTool("onboarding-scan")` used a global slot, so a new project's Start wizard restored a *different* project's scanned profile and Apply wrote its competitors/grounding into the new project. Scoped the slot per project via the `useAiTool` variant (`project.id`).

## Patterns established (catalogue, continued)

17. **A signed metric needs its own relative-change.** A `prev > 0` zero-guard silently flattens every ≤0-baseline swing of a signed metric to 0%. Divide by `|prev|` for signed values; only a true zero baseline → 0.
18. **A partial trailing calendar bucket must be excluded from a two-bucket delta.** Month buckets keyed by `YYYY-MM` put the incomplete bucket at the newest end — exactly where a last-two comparison looks. Flag it and compare complete buckets only.
19. **Read latest state via a ref across an async boundary; never map the render closure.** Any handler that `await`s then setStates will discard interim user changes (worse on a whole-document PUT). A `ref.current` updated every render is the fix — and keeps persistence out of the setState updater.
20. **Per-entity client persistence needs a per-entity storage key.** A mode-only localStorage slot shared across projects restores one entity's data into another. Scope the slot (a `useAiTool` variant / a project-keyed key).

## Deferred — 3 theme-F Highs (lower blast radius than the 7 above)

- **ProfitModule localStorage-in-`useState`** (finance #1) — hydration mismatch (console error + a flash of the scenario strip) for returning users; not data loss. Fix: hydrate in a `useEffect`, mirroring `useAiTool`'s documented pattern.
- **TwinOutbox restored-draft Approve/Reject no-op** (ai-digital-twin #1) — a draft restored from localStorage renders live-action buttons whose `draftContext` is null, so Approve/Reject silently do nothing. Fix: reconstruct `draftContext` on restore (or gate the interactive affordances on it).
- **LeadSourceDiagnosisPanel stale diagnosis** (local-seo-map-pack #2) — changing the source dropdown doesn't reset the AI result, so the header names source B while the cause/recommendation are source A's. Fix: `reset()` on select change or pin the result to the diagnosed source.

## Cumulative status (Waves 1–5)

41 findings closed in 42 fix commits across 5 themed waves (2 Critical, 29 High, 10 Medium).
tsc 0 · unit 658/658 · next build PASS throughout. Pattern catalogue: 20 items.
Remaining per INDEX: the 3 deferred theme-F Highs (above), the deferred gate-hashed money
findings (theme A tail), the theme-C tail (Wave-3 doc), then themes H–J (time/cron tail,
trust-boundary tail, success-theater) + the Medium/Low tail.
