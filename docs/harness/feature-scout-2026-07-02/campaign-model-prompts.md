# Feature Scout — Campaign Model & AI Prompts (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/lib/campaigns/types.ts, src/lib/campaigns/triage.ts, src/lib/campaigns/report-input.ts

## 1. Ground the AI evaluation prompts in the sync-over-sync diff
- **Impact**: 8/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [GATE]
- **Category**: functionality
- **File**: `src/lib/campaigns/report-input.ts:25`
- **Opportunity**: The UI badges run change-aware triage — `CampaignTable.tsx:359` calls `triage(c, changesById[c.id])`, so `roas_crater` / `spend_spike` show on screen — but both prompt builders call `triage(c)` bare (report-input.ts:25, :111) and render no "what changed since last sync" block at all. The AI evaluation is blind to exactly the movement layer the module's own comments call out ("a campaign can sit above target yet be cratering toward it"), so a report can contradict the crater badge next to it.
- **Why valuable**: The product's core promise is that the AI never disagrees with the visible rule-based diagnosis; today it structurally can, on the most alarming class of finding. Change grounding also makes portfolio recommendations time-aware ("this donor is cratering, act now") instead of single-window.
- **Build sketch**: Add optional `changes?: ChangesSummary` params (default `undefined`, so existing calls are untouched) to `buildCampaignPrompt`/`buildOverallPrompt`; pass `changesById[id]` into `triage()` and render a compact "ZMĚNY OD MINULÉ SYNCHRONIZACE" block from `ChangesSummary.items` (fmtSignedPct deltas already exist). That edit is commit-safe. Wiring is the [GATE] step: `analyze/route.ts` fetches `getLatestChanges(tenant)` (already exported, store.ts:282) and threads it through `generateCampaignEvaluation` (`ai/tools/campaign-eval.ts`, hashed) — one bundled gate commit; also fold `changes.current` into `hashEvalInputs` (store.ts, unhashed) so the cache invalidates when the diff does.

## 2. Alert on ROAS craters and spend spikes, not just snapshot criticals
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: automation
- **File**: `src/lib/campaigns/alerts.ts:80`
- **Opportunity**: `evaluateAndAlert` (alerts.ts:80) and the weekly digest (cron/digest/route.ts:57) run `triage(c)` without the change diff, so the two change-aware rules never reach the alert inbox / email / webhook pipeline — a campaign that lost 40 %+ of its ROAS overnight alerts nobody unless someone opens the page. `getLatestChanges` already computes exactly the needed `CampaignChange[]` in the same store module, and both alert call sites (cron/sync/route.ts:61, api/campaigns/route.ts:143) run right after the snapshot write.
- **Why valuable**: This is the highest-value use of the alerting machinery already built: craters are *critical*-severity by the module's own rules, and "movement you'd miss" is precisely what proactive email/webhook alerts exist for.
- **Build sketch**: In `evaluateAndAlert`, accept an optional `changesById` (or fetch `getLatestChanges(tenant)` internally after the sync writes the snapshot) and pass it to `triage(c, change)`; the existing `alertedCampaignIds` de-dupe, inbox `recordAlert`, webhook and email paths all reuse unchanged. Same one-liner for the digest's criticals count. Server-only files — none are gate-hashed, no client component touched.

## 3. Make zero-return spenders first-class donors in budget moves
- **Impact**: 7/10
- **Effort**: 3/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/lib/campaigns/budget-moves.ts:41`
- **Opportunity**: The donor filter requires `c.roas > 0`, so a campaign matching the *critical* `no_conversions` rule (cost > 0, conversions = 0, roas = 0) can never appear in the recommended moves — the panel can literally say "Rozpočet je vyvážený" while the triage banner shows a critical budget-burner, and the AI prompt's "DOPORUČENÉ PŘESUNY" block (report-input.ts:142) inherits the same blind spot. The wasted-spend ranking `cost × (1 − roas/target)` would rank these worst-of-all (waste = full cost) if admitted.
- **Why valuable**: "Spending without conversions" is the single most actionable finding a PPC manager gets, and the BudgetMoves card already has the perfect action for it (Pause source, wired to `applyPause`) — it just never surfaces there.
- **Build sketch**: Drop the `roas > 0` donor requirement (keep `minSpend`) or emit a distinct `kind: "pause"` move for zero-return donors in `recommendBudgetMoves`; `simulateBudgetShift` already handles a 0-value donor correctly (moves spend, loses nothing). Render the new move shape in `BudgetMoves.tsx` (pause-first row, reusing the existing confirm/apply plumbing) — client edit, so the wave runs a full `next build`. Update the prompt's move-line renderer in report-input.ts (unhashed, commit-safe) to phrase pause moves.

## 4. Add a deterministic portfolio-health timeline from stored snapshots
- **Impact**: 6/10
- **Effort**: 4/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/lib/campaigns/store.ts:282`
- **Opportunity**: Every sync appends a full snapshot (`upsertCampaigns`, store.ts:57) but only the latest two are ever read (`getLatestChanges` … `limit(2)`, store.ts:287) — the history is write-only. Snapshot entries carry `status/cost/conversions/conversionValue`, which is sufficient to evaluate all four snapshot triage rules historically, yet the only trend surface today is `ScoreTimeline`, which tracks *AI* scores and only grows when someone pays for an evaluation.
- **Why valuable**: "Are we trending healthier?" answered deterministically, for free, on every sync — the rule-based counterpart to the AI score timeline, and a natural home next to TriageBanner ("3 kritické — o 2 méně než minulý týden").
- **Build sketch**: Add a pure `summarizeSnapshotEntries(entries)` (derive roas/pno via the existing ratio helpers, run the status/cost/conversions rules, return a `TriageSummary`) in triage.ts or a sibling pure module; add `listSnapshotSummaries(tenant, limit)` to store.ts mapping the last N snapshots through it; expose it on the existing `/api/campaigns` GET payload (route already returns `changes`/`series`). Render a small critical/warning-count strip (hand-rolled `<svg>` per house convention) near TriageBanner — client-adjacent, so run `next build`.

## 5. Teach the model and prompts the prospecting-vs-performance role of each channel type
- **Impact**: 6/10
- **Effort**: 3/10
- **Risk**: 2/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `src/lib/campaigns/types.ts:92`
- **Opportunity**: types.ts itself admits the paid target is looser than the blended goal "because the campaign mix includes prospecting", yet nothing downstream knows *which* types are prospecting: demand_gen/video/display campaigns are judged against the same direct-ROAS target as Search/Shopping, so they trend chronically red and the prompts give the LLM zero framing for why (last-click under-attribution of demand generation).
- **Why valuable**: Every PPC practitioner reads a video campaign's ROAS differently from a Search campaign's; encoding that once makes the type breakdown, the triage context and the AI verdicts read like a strategist instead of a spreadsheet — without moving any threshold.
- **Build sketch**: Add `CAMPAIGN_TYPE_ROLES: Record<CampaignType, "performance" | "prospecting">` (+ short CS/EN labels) beside `CAMPAIGN_TYPE_LABELS` in types.ts. In report-input.ts (unhashed, commit-safe), tag the role in `metricsLine`/the per-type breakdown lines and add one guidance sentence to both prompts ("prospekční typy hodnoť v kontextu celého portfolia, ne jen podle přímého ROAS"). Deliberately leave `triage`/tone thresholds untouched — informational first; a later opt-in per-role tolerance can reuse the map. Optional follow-up: a role pill in `TypeBreakdown.tsx` (that step would add [CLIENT]).
