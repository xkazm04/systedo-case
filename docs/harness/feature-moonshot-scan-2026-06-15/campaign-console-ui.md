# Feature + Moonshot Scan — Campaign Console UI

> Context: ctx_1781547850586_ss7hwhp
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Recommended budget moves — turn triage + AI report into one quantified action list
- **Severity**: Critical
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/components/campaigns/TriageBanner.tsx` (+ new `src/lib/campaigns/budget-moves.ts`, `TypeBreakdown.tsx`)
- **Scenario**: The console already tells a PPC manager *what* is wrong — `triage()` in `triage.ts` flags `roas_critical` / `no_conversions` / `paused_spending`, and `groupByType()` (`types.ts`) computes per-type ROAS vs `TARGET_ROAS`. But the only "what now" is a generic "sort by priority" button and free-text AI recommendations. Nobody tells the manager *how much money to move and to where*.
- **Opportunity**: Add a deterministic "Doporučené přesuny rozpočtu" panel under the `TriageBanner`. A pure function `recommendBudgetMoves(rows)` ranks campaigns by `triageWeight` and pairs the worst spenders (critical rows whose `cost` is high and `roas < TARGET_ROAS * ROAS_CRITICAL_RATIO`) with the best over-performers (rows with `roas >= TARGET_ROAS` and headroom), producing concrete lines like "Přesunout ~12 000 Kč z *Display – remarketing* (ROAS 1,8×) do *Search – brand* (ROAS 7,2×) → odhad +X Kč hodnoty konverzí." Show estimated portfolio ROAS lift. This is the missing bridge between insight and action and reuses every existing threshold.
- **Impact**: Converts the dashboard from a diagnosis tool into a prescription tool — the single most valuable jump for a case study aimed at a marketing employer. Deterministic (no AI cost), instant, and demoable.
- **Implementation sketch**: New `src/lib/campaigns/budget-moves.ts` exporting `recommendBudgetMoves(rows: CampaignRow[]): BudgetMove[]` using `triage`, `TARGET_ROAS`, `roasMetricTone`. Render a new `BudgetMoves.tsx` between `<TriageBanner>` and the filter bar in `CampaignTable.tsx` (it already maps `all = campaigns.map(withMetrics)`). Each move row links to "Seřadit podle priority" / scroll-to-campaign. Pure + unit-testable like the rest of `triage.ts`.

## 2. Saved views — persist named filter/sort presets like a real Ads console
- **Severity**: High
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: `src/components/campaigns/CampaignTable.tsx` (filter/sort state block, lines ~155–169)
- **Scenario**: The table holds five independent view controls — `query`, `typeFilter`, `statusFilter`, `attentionOnly`, and `sort` — but only `sort` survives a reload (via `SORT_STORAGE_KEY` localStorage). A manager who repeatedly wants "PMax kampaně, jen vyžadují pozornost, seřazené dle nákladů" has to rebuild that every visit, and there is no way to flip between "morning triage" and "weekly review" lenses.
- **Opportunity**: Add **saved views**: a small dropdown next to "Zrušit filtry" that captures the full `{query, typeFilter, statusFilter, attentionOnly, sort}` tuple under a user name, lists saved presets, and applies/deletes them. Ship 2 built-in presets ("Vyžadují pozornost dle nákladů", "Bez konverzí") so the feature has value on first load. Persist to localStorage with the same try/catch pattern already used for sort.
- **Impact**: Power-user retention and a credible "console" feel — recruiters recognize saved views as a hallmark of mature Ads/Optmyzr tooling. Low risk: purely client-side, builds on existing serializable state.
- **Implementation sketch**: Extract a `ViewState` type and a `useTableView` hook from `CampaignTable.tsx` that wraps the five `useState`s. Add `src/components/campaigns/SavedViews.tsx` reading/writing `campaigns.table.views` in localStorage (mirror `loadSort`/the `useEffect` persistence). Built-in presets as constants; applying one calls the existing setters. No server change.

## 3. Bulk evaluate + portfolio digest export — batch the per-row AI clicks
- **Severity**: High
- **Lens**: feature-scout
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `src/components/campaigns/useCampaigns.ts` (`analyze`), `src/components/campaigns/CampaignsClient.tsx`
- **Scenario**: Today every campaign is evaluated one row at a time — `onAnalyze(c.id)` → `analyze("campaign", id, period)` fires a single `/api/campaigns/analyze` POST per click. With a dozen campaigns the manager must click "Analyzovat" twelve times, and there is no way to get a portfolio + per-row digest in one shot or to copy/share the whole thing. `ReportView` already builds a per-report `copyAllText`, but nothing aggregates it.
- **Opportunity**: Add a "Vyhodnotit vše, co vyžaduje pozornost" button in the toolbar that sequentially (respecting per-key busy state) evaluates every row where `triage(c).severity !== "ok"`, plus the portfolio. Then add an "Exportovat report" action that concatenates the portfolio `ReportView` text and each campaign's `copyAllText` into a single Markdown/clipboard digest (verdict, score, recommendations grouped by `EvalPriority`). The existing `analyze` already tracks `analyzing`/`analyzeErrors` per key, so the UI stays correct mid-batch.
- **Impact**: Removes the most repetitive interaction in the product and produces a client-ready deliverable (the exact artifact a marketing agency hands a client) — strong demo moment, modest build.
- **Implementation sketch**: In `useCampaigns.ts` add `analyzeMany(ids: string[], period)` that awaits `analyze` in series (or small concurrency) and surfaces aggregate progress. Add a `buildPortfolioDigest(reports, campaigns)` helper next to `ReportView`'s `copyAllText` logic (extract that into `src/lib/campaigns/report-text.ts` and reuse). Wire two buttons in the portfolio `<section>` of `CampaignsClient.tsx`.

## 4. Triage alerting + drift watch — the console notices change before the manager opens it
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: M (1-3d)
- **File**: `src/lib/campaigns/store.ts` (`upsertCampaigns`), `src/app/api/campaigns/route.ts` (POST)
- **Scenario**: `upsertCampaigns` does `DELETE FROM campaigns` then re-inserts on every sync, so the prior snapshot is thrown away — the app can never say "ROAS on *Search – brand* dropped 30 % since the last sync" even though `ScoreTimeline` proves the team values trend-over-time. The triage layer also only reacts to absolute thresholds, never to *deltas* between syncs.
- **Opportunity**: Keep a lightweight history of each campaign's key metrics per sync (a `campaign_snapshots` table) and add a `change_vs_last` triage signal — the code comment in `triage.ts` (line 75) already anticipates "a drop vs the prior window… slots in here without touching callers." Surface a "Co se změnilo od posledního načtení" strip above the table (new criticals, recovered campaigns, biggest ROAS swing) and let the `TriageBanner` count *newly* critical campaigns. This is the data foundation that later powers real email/push alerting.
- **Impact**: Adds a time dimension the UI is already shaped for, makes "are our optimizations working?" answerable at the portfolio level (not just per AI score), and de-risks the autonomous-agent moonshot (#5) by giving it a change feed to act on.
- **Implementation sketch**: New migration adding `campaign_snapshots(synced_at, campaign_id, cost, conversions, conversion_value, roas)` written inside the existing `upsertCampaigns` transaction before the `DELETE`. Add `getPreviousSnapshot()` to `store.ts`; add a `change` rule family to `RULES` in `triage.ts` taking an optional `prev`. Return a `changes` block from `loadState()` in `route.ts`; render `<ChangeStrip>` in `CampaignsClient.tsx`.

## 5. Autonomous campaign-optimization agent — propose → simulate → apply, with a human gate
- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: `src/app/api/campaigns/analyze/route.ts`, `src/lib/campaigns/connector.ts`, new `src/lib/campaigns/agent/*`
- **Scenario**: The console already has every primitive an optimization agent needs but stops at *advice*: triage rules classify, the AI returns prioritized `recommendations` (`CampaignReportResult.recommendations` with `EvalPriority`), `ScoreTimeline` tracks whether scores improve, and the `connector` abstraction (`getConnector()`) is the one seam where reads happen. Nothing closes the loop — recommendations are read by a human who then leaves the app to act in Google Ads.
- **Opportunity**: Build an **autonomous optimization agent** that runs a continuous *observe → decide → simulate → recommend/act* loop. Each sync, it (1) reads triage + change signals, (2) drafts concrete *mutations* as structured actions (`pause_campaign`, `shift_budget{from,to,amount}`, `raise_target_roas`) instead of prose, (3) **simulates** projected portfolio ROAS/PNO impact deterministically using the same `aggregate`/derive math, and (4) presents them as an "agent návrhy" inbox where each action has Approve/Reject/Snooze. Approved actions write through a new `connector.applyMutation()` (no-op/sample in dev, real Google Ads Mutate API in prod), and the next sync's `ScoreTimeline` proves whether the agent helped — a self-grading feedback loop. Start human-in-the-loop; graduate trusted action types to auto-apply with a budget cap and full audit log.
- **Impact**: Category-defining — turns a reporting case study into an autonomous PPC operator, the exact 10x narrative ("I didn't just build a dashboard, I built an agent that manages the portfolio"). Network/force-multiplier effect: every approved/rejected decision is training data that tightens the triage thresholds and the recommendation prompt over time.
- **Implementation sketch**: Extend `CampaignReportResult` (or a new `AgentPlan` type in `ai-types.ts`) with a typed `actions: CampaignMutation[]` field; have `generateCampaignEvaluation` emit them and validate like `validateEvaluationRequest`. Add `src/lib/campaigns/agent/simulate.ts` (pure, reuses `aggregate`/`deriveMetrics`) and `agent/actions.ts` (the mutation enum + apply contract). Add `connector.applyMutation()` to the `Connector` interface in `connector.ts` (sample connector logs + mutates the stored snapshot so the loop is demoable keylessly). New `agent_decisions` table in `store.ts` for the audit log + approve/reject endpoints; render an "Agent" tab in `CampaignsClient.tsx` reusing `ReportView`'s recommendation-card layout with action buttons.
