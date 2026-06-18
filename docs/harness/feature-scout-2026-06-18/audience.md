# Feature Scout — Publikum & výnos (`/app/[projectId]/publikum`)

> Module: src/components/app/modules/AudienceModule.tsx
> Project type: content
> Total: 5 ideas

## 1. Subscriber-source attribution (kde rostou odběratelé)
- **Category**: feature
- **Impact**: 9
- **Effort**: 5
- **Risk**: 3
- **Gap today**: The funnel is a single anonymous snapshot — `AudienceFunnel` (sample.ts:4-9) holds only `visitors / subscribers / activeSubscribers`. There is no `source` dimension anywhere, so a content creator cannot see which channel (newsletter referral, organic article, social, sponsorship swap) actually produced subscribers. The visible "konverze {subRate}" KPI (AudienceModule.tsx:24) is one undifferentiated number.
- **Proposal**: Add a `SubscriberSource[]` shape (`{ source, newSubs, costPerSub?, retention30 }`) to sample.ts + a `sourceAttribution()` rollup in compute.ts (share of new subs per source, blended cost-per-sub). Render a new "Zdroje odběratelů" table/bar card next to the funnel KPIs, sorted by new-sub share, flagging the lowest-retention source. Cross-link to `distribuce` (where channel attribution already lives in DistributionModule.tsx) via a `NextSteps` strip.
- **User value**: Tells a creator where to spend effort to grow the list — the single most-asked audience question — instead of just how many subscribers exist.
- **Fit**: Directly extends the "subscriber funnel" charter of the module; reuses the channel-attribution pattern the content project already ships in Distribuce, closing the funnel→channel loop.

## 2. Sponsorship rate-card calculator (cena za sponzoring z velikosti publika)
- **Category**: functionality
- **Impact**: 9
- **Effort**: 4
- **Risk**: 3
- **Gap today**: "Sponzoring newsletteru" appears only as a flat past-amount in `RevenueStream` (sample.ts:38) and the right-hand "Zdroje výnosu" bars (AudienceModule.tsx:75-93). There is no forward-looking pricing tool — the module shows what sponsorship *earned*, never what a slot *should cost*, even though it already holds the exact inputs (active subscribers, segment open-rates, RPM).
- **Proposal**: Add a pure `rateCard(funnel, segments, { cpmFloor, cpmCeil })` helper returning a suggested per-send price range derived from active reach × open-rate × a benchmark CPM band, plus a per-segment premium (a high-open "Plánují miminko" segment commands more). Render a "Cena za sponzoring" card: suggested slot price, price-per-1000-opens, and a small segment-targeting premium table.
- **User value**: Lets a creator quote a defensible sponsorship price on the spot, anchored to their real audience — replacing guesswork that leaves money on the table.
- **Fit**: The registry blurb explicitly names "výnos (RPM / sponzoring)"; this turns the passive sponsorship number into the module's headline power-feature, all from data already in props.

## 3. Revenue-mix diversification & concentration risk
- **Category**: user_benefit
- **Impact**: 8
- **Effort**: 3
- **Risk**: 2
- **Gap today**: `revenue` is rendered as independent bars scaled to `maxStream` (AudienceModule.tsx:16,84-86) with no relationship between streams. `audienceSummary` (compute.ts:14-22) sums them into `monthlyRevenue` but never measures balance — a creator earning 84k of 188k from one sponsor sees no warning, even though single-stream dependence is the top failure mode for content businesses.
- **Proposal**: Add `revenueMix(revenue)` to compute.ts returning per-stream share, top-stream concentration %, and an HHI-style diversification score. Surface a "Skladba výnosu" card: a 100%-stacked bar, the largest-stream dependency %, and a tone-coded note ("84 % výnosu závisí na sponzoringu — diverzifikujte") mirroring the existing LtvModule healthy/at-risk insight banner (LtvModule.tsx:46-53).
- **User value**: Converts raw revenue figures into a risk verdict, nudging the creator to build a second income leg before the dominant one wobbles.
- **Fit**: Pure-helper + insight-banner pattern already established in sibling modules; squarely "výnos" and content-creator-specific.

## 4. RPM & subscriber-growth trend with forecast
- **Category**: feature
- **Impact**: 8
- **Effort**: 6
- **Risk**: 4
- **Gap today**: Every value is a static point-in-time number — there is zero time series in the audience domain. RPM is a constant per segment (`rpm`, sample.ts:16) and the funnel has no history, so a creator cannot tell whether RPM or the list is rising or falling, nor project next month.
- **Proposal**: Add monthly history arrays (`subscriberHistory[]`, `rpmHistory[]`) to sample.ts and a `trend()` helper (MoM growth, 3-mo moving average, simple linear projection of subscribers and blended RPM) in compute.ts. Render a compact sparkline-style card pair: "Růst odběratelů" and "Trend RPM" each with the MoM delta (`fmtSignedPct` already exists) and a one-month forecast value.
- **User value**: Answers "am I growing and is each subscriber worth more or less over time?" — the trend signal that decides whether to invest in growth vs. monetization.
- **Fit**: Extends the funnel + RPM model along the missing time axis; `fmtSignedPct`/`fmtMonth` formatters are already available, so it slots into the established rendering style.

## 5. Audience-growth goal tracker (cíl odběratelů)
- **Category**: functionality
- **Impact**: 7
- **Effort**: 4
- **Risk**: 3
- **Gap today**: There is no notion of a target anywhere in the module — KPIs (AudienceModule.tsx:20-40) show absolute current values with no goal, pace, or ETA. A content creator's core motivation (hit N subscribers / N Kč MRR) is invisible, so the module reports status but never progress.
- **Proposal**: Add an optional `goals` shape (`{ subscriberTarget, monthlyRevenueTarget }`) and a `goalProgress(funnel, summary, goals, growthRate)` helper computing % to target and a projected ETA (using the trend growth from idea 4, or current run-rate as a fallback). Render a "Cíle" card with progress bars (reusing the inline bar markup at AudienceModule.tsx:84-86) and an "odhad dosažení: ~květen 2026" label via `fmtMonthLong`. Add a `NextSteps` link to `obsahovy-engine`/`distribuce` to drive the growth needed.
- **User value**: Gives the audience module a destination — turns a dashboard into a plan with a visible finish line and ETA, which sustains creator motivation.
- **Fit**: Builds on the existing summary metrics and the project-wide `NextSteps` flow-wiring; goal-tracking is a natural power-user layer for a content audience module.
