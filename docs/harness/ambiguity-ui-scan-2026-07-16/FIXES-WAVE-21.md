# Fixes — Wave 21 (module-clustered tail: Social command center / speed-to-lead · social media planning · marketing landing pages)

Branch `vibeman/ambiguity-ui-2026-07-16`. Shared surfaces: `src/lib/social/*`, `src/lib/speed-lead/*`,
`src/components/social/*`, `src/components/brand/*`, `src/components/marketing/*`.

**13 findings assigned → 13 fixed** (5 High · 7 Medium · 1 Low). 0 skipped. Earlier waves had already closed
social-speed-lead #3 (stuck-`publishing` reclaim) and social-media-planning #1 (retry double-schedule) — both
verified present and untouched here.

## Commits

| # | Commit | Finding | Sev | Scope |
|---|--------|---------|-----|-------|
| 1 | `cc537cc` fix(social): judge a new connection real per-platform, not globally | social-speed-lead #1 | High | lib/social/connection |
| 2 | `3453aac` fix(social): reply through a distinct seam, never as a public post | social-speed-lead #2 | High | lib/social/providers+publish |
| 3 | `c9ac4e8` fix(marketing): give the visibility gauge its own subtitle | marketing #1 | High | marketing/LocalSeoShowcase |
| 4 | `93092da` fix(marketing): make Replay actually replay in one click | marketing #2 | High | marketing/RankClimbDemo |
| 5 | `decc753` fix(social): anchor the week calendar to the scheduler's first slot | social-media-planning #2 | High | social/WeekPlanner |
| 6 | `269755f` fix(speed-lead): stop counting fresh unanswered leads as SLA hits | social-speed-lead #4 | Med | speed-lead/analytics + SpeedLeadModule |
| 7 | `566787c` fix(speed-lead): channel-aware draft, drop placeholder-grade copy | social-speed-lead #5 | Med | speed-lead/draft |
| 8 | `7944663` fix(marketing): one starting rank for the climb story (#4 -> #1) | marketing #3 | Med | marketing/charts/RankClimbChart + LocalSeoShowcase |
| 9 | `6f5cc77` fix(brand): single-source crossroad order, warn on a dropped destination | marketing #4 | Med | brand/BrandLanding + crossroad/Crossroad |
| 10 | `932ed2c` fix(marketing): derive CompetitorBars scale from the data, not a fixed 40 | marketing #5 | Med | marketing/charts/CompetitorBars |
| 11 | `ec012b9` fix(social): flag when a week-plan run creates fewer posts than promised | social-media-planning #3 | Med | social/WeekPlanner |
| 12 | `533f272` fix(social): surface the 7-topic cap instead of silently dropping the tail | social-media-planning #4 | Med | social/WeekPlanner |
| 13 | `6c90022` fix(social): keep the week-planner brand voice fresh, drop dead i18n keys | social-media-planning #5 | Low | social/WeekPlanner + Composer |

## Narratives

**#1 — per-platform "real" check.** `connectAccount` decided real-vs-demo via `socialConfigured()`, an OR across
all platforms, so a LinkedIn token counted as real when only Meta creds existed (a non-demo account that always
silently simulates). Added `providerConfigured(platform)` mirroring publish.ts's per-platform gate; also made a
token-less reconnect over an existing real connection a no-op instead of a silent downgrade that discards the token.

**#2 — reply must never be a post (correctness/privacy).** `publishReply` reused `provider.publish()`, so once real
credentials exist a private DM reply would be posted as a NEW public post under the brand's name (`messageId` only
reached the error log). Added a distinct optional `reply(input: SocialReplyInput, …)` capability carrying `messageId`;
no adapter implements it yet, so `publishReply` now simulates a real-but-unsupported connection instead of publishing.

**#3 (marketing) — gauge subtitle.** Middle card passed `sub={c.compSub}` (the third card's click-share line). Added
`visSub` (cs + en) and wired it.

**#4 (marketing) — Replay.** `run()` short-circuited to `reset(); return` on `hasRun`, so the first Replay click only
snapped back to #4 (counters running the wrong way) and relabelled to "Run". Factored the climb into `start()`; the
`hasRun` branch now resets, then kicks `start()` on the next animation frame (with a cancel-on-unmount raf ref).

**#5 (planning) — calendar window.** Scheduling could roll to tomorrow (hour already past) putting a 7-topic batch's
last post on day 8, outside a calendar fixed at today+6. Extracted `firstSlotDate()`/`parseHour()` and anchor
`buildWeek(fmt, firstSlotDate(safeHour))` (re-anchoring when the hour changes) so both windows match by construction.

**#4 (speed-lead) — SLA rate.** Open, not-yet-breached leads were added to both `judged` and `hits`, so a fresh inbox
scored 100% and the rate *dropped* over time. Now only settled outcomes (answered-within-target or breached) are
judged; pending leads go to a new `atRisk` count, surfaced as "N awaiting reply" in the module.

**#5 (speed-lead) — draft copy.** One hardcoded template promised "ozvu se do pár minut telefonicky" for every channel
(incl. email with no number) and shipped gendered "ráda/rád" + a bare "tým" sign-off. Now channel-aware
(`CONTACT_BACK` per channel), neutral team voice, and an optional `brand` sign-off (neutral "náš tým" when absent).

**#3 (marketing) — climb numbers.** Hero/demo start at #4 but the chart plotted `YOU=[5,…]` / said "#5 → #1". Seeded
the chart at rank 4 (`[4,4,4,3,2,1,1]`, still reaching #1 at day 75 for the reference dot) and set both `rankSub`s to #4.

**#4 (marketing) — crossroad.** BrandLanding filtered the nav list (order = nav order, not journey order) and dropped
a meta-less href silently while indices kept counting. Now built by mapping over `CROSSROAD_HREFS` (order
single-sourced) with a dev `console.warn` on either join miss (missing nav item, or missing `CROSSROAD_META`).

**#5 (marketing) — CompetitorBars scale.** Hardcoded `MAX=40` with a public `data` prop → any value >40% overflowed
the plot and clipped its label. Derive `scaleMax = max ?? Math.max(1, …values) * 1.15`, with an optional `max` prop.

**#3 (planning) — silent partial success.** Progress counted topics while the summary promised posts; a draft omitting
a platform was `continue`d past. Added a `savedCount` of persisted posts and, on a green run, a non-fatal
"created X of Y posts" notice when it falls short of `topics × networks`.

**#4 (planning) — 7-topic truncation.** `.slice(0,7)` dropped the tail silently and clear-on-success wiped it. Compute
`rawLines` uncapped, show a warning counter over the cap, and keep `rawLines.slice(7)` in the field after a run.

**#5 (planning) — stale brand.** `brand` was a one-shot mount snapshot. Added a setter + `social:brand-changed`
listener (Composer now emits it on write) + `storage`, and read the brand fresh at planWeek time. Removed dead
`topicCount`/`topicCountPlural` keys (replaced by `batchSummary`).

## Tests

- `test-unit/social-providers.test.mjs`: +1 — publishReply on a real Meta account + token but no reply adapter →
  simulated, and asserts the publish transport was **never** called.
- `test-unit/speed-lead-analytics.test.mjs`: reworked the open-lead test to the settled-only semantics (`judged=2`,
  `atRisk=1`, rate `0.5`) and added an all-fresh-inbox test (`withinSlaRate=null`, not a flattering 100%).
- `test-unit/speed-lead-qualification.test.mjs`: +2 — channel-aware contact-back sentence (email never promised a
  phone call) and the dropped gendered opener + branded sign-off.

**Verification:** `npx tsc --noEmit` → 0 errors. `npm run test:unit` → **1760/1760 pass** (baseline 1756 + 4 new),
0 fail, no flake. Each commit passed the lefthook gate (eslint + tsc + LLM contract eval, all golden-matched).

## Behavior changes needing sign-off

1. **Reply is now always simulated** (never routed through publish) until a real `reply()` adapter is added — the safe
   default, but it means "reply" does not hit the network even with live credentials. Adding an adapter is a future task.
2. **Token-less reconnect is now a no-op** over an existing real connection (was a silent downgrade to demo). A real
   connection is only removed via explicit disconnect.
3. **SLA "within SLA" figure will read lower** than before for inboxes with open, on-track leads (they're no longer
   pre-counted as hits) — this is the intended honesty fix; a new "N awaiting reply" line explains the pending set.
4. **Week calendar can start tomorrow** (not always today) when the chosen hour is already past — it now tracks the
   scheduler. A post scheduled for *today* by another surface (Composer) won't show in the WeekPlanner grid in that case.
5. **Speed-lead draft copy changed** (channel-aware, no gendered "ráda/rád", "náš tým" sign-off) — customer-facing text.

## Patterns

- **Per-action vs global config checks** (#1): a per-platform action gated on a global "any configured" OR is a
  recurring honesty trap — mirror the narrowest existing check (publish.ts) at every decision site.
- **Distinct-operation seams** (#2): "reply" reusing "publish" is a category error that's invisible while everything
  simulates — separate the capability and fail-closed to simulation until an adapter owns it.
- **Single-source ordering + join-miss signals** (#4 marketing): derive order from the canonical list and dev-warn on
  join misses instead of `return null` — the silent drop is the bug, not the miss itself.
- **Windows computed independently drift** (#5 planning): a scheduler window and a render window built from separate
  code paths will offset by a day — anchor both to one shared function.
- **Progress unit mismatch** (#3 planning): counting progress in one unit (topics) while promising another (posts)
  hides partial success — reconcile the promised total against what actually persisted.
