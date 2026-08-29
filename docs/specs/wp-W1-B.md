# WP W1-B — One publishing calendar with enforced per-channel cadence
card #24 · L · gate: contract (a 409 on the social write path; no new table) · wave 1

## Goal
One read-side calendar unifies the four schedulers (social posts, content-plan board, twin outbox,
distribution hand-off) per project over a canonical `ChannelKey`, and the kanály cadence cap
(`ChannelTrack.maxPerWeek`) — today written and displayed but enforced by nothing — is enforced at
the ONE write chokepoint every scheduler goes through (`POST /api/social/posts`), with an explicit
operator override. Acceptance: a scheduled post over the cap is refused with `409 cadence-exceeded`
(test-pinned), the calendar lists items from all four sources (test-pinned), and the wizard's promise
"víc jich modul nenavrhne" becomes true.

## Non-goals
- **No fifth store, no migration.** The calendar is a resolver over the existing four stores; the only
  persisted thing is what those stores already persist. Do not touch `db.ts`.
- No dates invented for twin drafts (`TwinDraft` has none — `twin/types.ts:152-175`); twin items appear
  in the calendar only via `sentAt` (past) — the outbox gets a "this week n/cap" pill, nothing more.
- No change to the content-plan `day` index model (`content-schedule/sample.ts:38-79`) — read it
  through `channelSendAt(day, now)` (`:107-112`) for the calendar.
- Do not edit `organic-channels/**` (the cap's WRITE side stays the wizard), `twin/**` lib, `social/store.ts`,
  `ChannelWizard.tsx`, `context-map.json`.
- Autonomy stays off: the override is a human click; nothing auto-reschedules.

## Seams
- Social write chokepoint: `src/app/api/social/posts/route.ts:46-97` (`createPost(tenant, {status:"scheduled",
  scheduledAt})` at `:97`) — every scheduler posts here: `WeekPlanner` via `usePlanWeek.ts` + `plan-pool.ts`,
  `ContentSchedule.tsx:228-259` (`sendToChannel`), `distribution/VariantCard.tsx:161-189` (`schedule()` mints
  `now+30min`, no calendar, no cap).
- Reads: `listPosts(tenant, limit)` `src/lib/social/store.ts:56`; `getProjectState<ContentPost[]>(uid, projectId,
  "content-schedule")` `src/lib/project-state/store.ts:143`; `getTwin(projectId).drafts` `src/lib/twin/store.ts:21`;
  `getOrganicChannels(projectId).tracks` `src/lib/organic-channels/store.ts` (project-keyed; `ChannelTrack`
  `organic-channels/types.ts:76-87`, `maxPerWeek` clamp 1–14 at `:252-253`).
- Channel vocabularies (no shared id exists): `SocialPlatform` `social/types.ts:9-10`; `TwinChannel`
  `twin/types.ts:23-24`; `OrganicChannel.id` slugs (`"instagram-organic"`, `"linkedin-organic"`,
  `"facebook-skupiny"`, `"google-business-profile"`, `"newsletter"`, …, `organic-channels/sample.ts`);
  `RepurposeChannel` labels `distribution/generate.ts:22-30`; bridge `channelToPlatform` `distribution/handoff.ts:14`.
- Pill: `ChannelPlaybook.tsx:156-158` (`cadence: "max {n}× týdně"`). Wizard copy `ChannelWizard.tsx:55-56` (read-only).
- Insights: `src/lib/insights/aggregate.ts:465-502` `collectRecommendations` (positional inputs; `channelRecs`
  runs for all types) — **W1-B owns the producer hotspot this wave**: add ONE optional trailing input.
- UI hosts: `src/components/social/SocialClient.tsx` (21 LOC, no `stagger` — add it), `WeekPlanner.tsx:179-186`
  (`byDay` grouping; `localIso` `:85-90`), `ContentScheduleCalendar.tsx` (existing 4-week grid, a11y contract
  in its header — reuse its cell shape, do not fork it), `useFormatters()` for every date.
- i18n: `WeekPlanner.tsx:35-74` `T` shape; `useT` fallback is `en`.
- Tests: `test-unit/social-plan-pool.test.mjs`, `social-publish-claim.test.mjs`, `content-schedule.test.mjs`,
  `organic-channels-track.test.mjs:63,72`, `insights-channel-rec.test.mjs`. `handoff.ts` has NO test — add one.

## Data contract
```ts
// src/lib/publishing/channel-key.ts — pure, client-safe
export const CHANNEL_KEYS = ["facebook","instagram","linkedin","tiktok","x","newsletter","gbp","blog","youtube","pinterest","other"] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];
export function channelKeyFromPlatform(p: SocialPlatform): ChannelKey;           // identity for the 4
export function channelKeyFromOrganicId(id: string): ChannelKey;                 // "instagram-organic"→instagram, "facebook-skupiny"→facebook, "google-business-profile"→gbp, unknown→"other"
export function channelKeyFromRepurpose(label: string): ChannelKey;              // "X / Twitter"→x, "Newsletter"→newsletter
export function channelKeyFromContentChannel(c: ContentPost["channel"]): ChannelKey;

// src/lib/publishing/types.ts
export type PublishingSource = "social" | "content-plan" | "twin" | "distribution";
export interface PublishingItem {
  id: string;                 // `${source}:${sourceId}`
  source: PublishingSource;
  channel: ChannelKey;
  at: string;                 // ISO instant
  title: string;
  status: "planned" | "scheduled" | "published" | "sent" | "failed";
  href?: string;              // /app/{projectId}/{module}
}
export interface CadenceRule { channel: ChannelKey; maxPerWeek: number; organicId: string }
export interface CadenceCheck { channel: ChannelKey; weekStart: string; count: number; cap: number | null; exceeded: boolean }

// src/lib/publishing/cadence.ts — pure
export function cadenceRules(tracks: Record<string, ChannelTrack>, channels: OrganicChannel[]): CadenceRule[];
export function weekStartIso(at: string): string;                                // Monday 00:00 LOCAL, YYYY-MM-DD
export function checkCadence(items: PublishingItem[], channel: ChannelKey, at: string, rules: CadenceRule[]): CadenceCheck;
//  counts items with status scheduled|published|sent in the same ISO week + channel; cap null ⇒ never exceeded

// src/lib/publishing/resolve.ts — server-only, one read per store, React cache()
export async function resolvePublishingCalendar(uid: string, projectId: string, opts?: { from?: string; to?: string }):
  Promise<{ items: PublishingItem[]; rules: CadenceRule[]; sources: Record<PublishingSource, "ok" | "empty" | "error"> }>;
```
Enforcement at `POST /api/social/posts` (only when `status === "scheduled"` and `scheduledAt` present):
resolve calendar → `checkCadence` → if `exceeded` and body lacks `overrideCadence: true` →
`409 { error: "cadence-exceeded", channel, cap, count, weekStart }`. With override: create the post AND
`emitProjectActivity(kind:"update", module:"kanaly", title: "Cadence cap overridden …")`.
Tenant for the social read inside the route = the same tenant the route already resolves.
Calendar read API: `GET src/app/api/projects/[id]/publishing/route.ts?from&to` → the resolver result
(`requireOwnedProject`). Insights: `publishingRecs(locale, input?: { checks: CadenceCheck[] })` emits a
`warning` per channel already over cap this week + an `info` when a channel with a cap has 0 items planned
this week (module `"kanaly"`), appended in `collectRecommendations` via a NEW trailing optional param
`publishing?: PublishingRecsInput | null` (portfolio-model / ProjectOverview callers unchanged ⇒ undefined ⇒ no recs).

## Invariants
- ADR-0001/0002: no new store; all reads via existing dispatchers with the keys they already use (social by
  tenant, content-plan by (uid, projectId), twin + kanály by projectId).
- Cache Components: the calendar route is a plain handler; the page reads stay inside `<Suspense>` boundaries.
- Byte-identity: `POST /api/social/posts` with no cap in force is unchanged (pin: a project with no tracks →
  no 409, same response). `collectRecommendations(...)` without the new param is unchanged (pin).
- Honest: `sources.error` renders a `DataUnavailableNote`-style line, never silently an empty week.

## UI
- NEW `src/components/social/PublishingCalendar.tsx` (≤200 LOC; extract `CadenceMeter.tsx`): 7-day week strip,
  each item as a chip coloured by source (semantic tokens), per-channel `n/cap` meters; mounted first in
  `SocialClient.tsx` (lazy `next/dynamic` + `SectionSkeleton`), root gets `stagger`.
- `WeekPlanner.tsx`: show the per-channel cap next to the plan button and handle a 409 per post in
  `usePlanWeek.ts` (skip + "cap reached" line, offer "Naplánovat i tak" which re-posts with `overrideCadence`).
- `ContentSchedule.tsx:228-259` + `VariantCard.tsx:161-189`: on 409 show the cap message + override button
  (same two T keys each); do not restructure these components.
- `TwinOutbox.tsx`: ONE pill in the channel header — "tento týden {n}/{cap}" from the calendar API (slot only).
- `ChannelPlaybook.tsx:156-158`: pill text stays; add `title` attr "vynucuje se při plánování" and a link to the
  social calendar (`/app/{projectId}/socialni`).

## Build steps
1. `channel-key.ts` + `cadence.ts` + tests (`test-unit/publishing-cadence.test.mjs`, ≥14 assertions incl. week
   boundary Mon/Sun local, cap null, override no-op) + `test-unit/distribution-handoff.test.mjs` (new coverage).
2. `resolve.ts` + `test-unit/publishing-resolve.test.mjs` (mock the four stores with
   `--experimental-test-module-mocks`; one item from each source; an erroring store → `sources.twin === "error"`).
3. Route enforcement + `test-unit/social-posts-cadence.test.mjs` (409 shape; override path; no-track byte-identity).
4. Calendar API + UI + planner/board/variant 409 handling + outbox pill + playbook pill.
5. Insights producer + pin test extension in `insights-channel-rec.test.mjs` shape (new file).
6. LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/publishing src/app/api/social/posts "src/app/api/projects/[id]/publishing" src/components/social src/components/app/modules/ContentSchedule.tsx src/components/app/modules/distribution/VariantCard.tsx src/components/app/twin/TwinOutbox.tsx src/components/app/channels/ChannelPlaybook.tsx src/lib/distribution/handoff.ts src/lib/insights/aggregate.ts` ·
`npm run test:unit` (`social-*`, `content-schedule`, `organic-channels-*`, `insights-*` green).

## Acceptance
- ≥30 new assertions; `grep -rn "cadence-exceeded" src/` ≥ 4 files (route + 3 callers).
- `test-unit/organic-channels-track.test.mjs` unchanged and green.

## Hotspot requests
- `src/lib/insights/aggregate.ts` — OWNED by W1-B this wave; edit directly (additive trailing param only).
- `context-map.json` new files (Director). Doc-sync: `docs/` page for kanály/social if one names the cadence
  promise (grep `maxPerWeek` in docs → `docs/headless-outreach/design.md:92,117` — update the sentence).

## Rollback
Revert; nothing persisted changes shape. Activity rows from overrides remain (harmless).
