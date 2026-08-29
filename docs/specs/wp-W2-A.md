# WP W2-A — Organic outcome ledger: /go attributable links re-rank the free-channel plan
card #13 · XL (narrowed to L: no GSC/GA4) · gate: contract (new tables, golden re-fingerprint) · wave 2 · **modes.ts owner**

## Goal
Every distribution variant / channel action can mint a measurable `/go/{id}` link; the public
redirect stamps UTM and bumps a privacy-shaped daily counter; a `go-rollup` ledgers-cron step folds
counters into per-channel outcomes; the kanály plan shows a MEASURED signal beside the curated
`fit`, the Distribuce attribution/learnings panels flip from the illustrative sample to live rows,
and `channel-research` grounding carries the measured numbers. Acceptance: redirect+count pinned,
rollup pinned, provenance flip pinned, golden updated with a reason — ≥20 new assertions.

## Non-goals
- **No GSC/GA4 and no leads join** — `src/lib/content-engine/resolve.ts` is OUT of this WP
  (its `derivedFrom` stays `"sample"`); the deck's "search-console" leg is a later WP.
- No IP, UA, cookie, session or per-user storage — the click store copies the
  `src/lib/analytics/store.ts:1-6` privacy posture (metric key + UTC day + count, nothing else).
- No edits to `src/lib/analytics/**` (its metric keys are flat global strings by design — the
  outcome ledger is its own per-link store, do not force it in).
- `curated fit` is never overwritten: `OrganicChannel.fit` stays what sample/AI produced;
  measured is a SEPARATE, honestly-labelled signal (`measuredClicks`), not a fake re-fit.
- Do not edit `src/lib/db.ts`, `delete-cascade.ts`, `duplicate-cascade.ts`, `context-map.json`
  outside the seam-request protocol (apply locally to test, report verbatim).
- Do not touch `src/lib/cron/ledgers.ts` beyond appending ONE step to `LEDGER_STEPS`
  (`ledgers.ts:87`) — that line is the registration ceremony and is yours (W1-E precedent).
- Do not touch `src/app/api/ai/modes.ts` beyond the `channel-research` entry's needs — you own
  the FILE this wave, but other WPs (W2-B, W2-C) will hand the Director seam-request inserts for
  it; leave their keys alone.

## Seams
- UTM stampers to reuse: `src/lib/distribution/utm.ts` — `withUtm` :35-41, `channelUtmSource`
  :28-30, `campaignSlug` :45-56, `variantLink` :59-69, `UTM_MEDIUM` :8. Add
  `goHref(id): string` (`/go/${id}`) here; the redirect target composes `withUtm` server-side so
  a minted link a user copies is SHORT and the UTM appears only after the hop.
- Link mint + list (authed): NEW `src/app/api/projects/[id]/go-links/route.ts`
  (`requireOwnedProject`; POST `{url, channel, campaign?}` → `{id, href}` idempotent per
  `(projectId, url, channel)`; GET → links + 30d counts).
- Public redirect: NEW `src/app/go/[id]/route.ts` — GET only; unknown id → 404; known →
  best-effort count (`void`), then 302 to `withUtm(...)`. Not under `src/app/api/` so sast
  `route-auth` (scripts/sast.mjs:51,:167-184) never fires — no allowlist entry. Skip counting
  when the UA matches `/bot|crawl|spider|preview/i` (still redirect). Beware
  `raw-engine-outside-seam` (sast.mjs:129-166): all db access via the store trio only.
- Store trio (NEW `src/lib/organic-channels/outcomes-store.ts` + `.local` + `.firestore`):
  registry is GLOBAL like microsites (`src/lib/microsite/store.ts:6-15` — key = id, tenant a
  field, no ownership logic in the store); dispatcher pattern from `src/lib/leads/store.ts:13-28`.
  Clicks are rows `(link_id, day, count)` bumped with upsert-increment
  (`analytics/store.local.ts:8` shape).
- Pure rollup (NEW `src/lib/organic-channels/outcomes.ts`): types below +
  `rollupChannelOutcomes(links, dayRows, now): ChannelOutcome[]` + `measuredBadge(outcome)`.
- Rollup persistence rides `project_state` (NO third table): key `"organicOutcomes"` registered
  in `src/lib/project-state/keys.ts:57` shape (`owner: "kanaly", version: 1, http: false`),
  written via `mutateProjectState` (`src/lib/distribution/variants-store.ts:59-69` CAS shape).
- Cron step: NEW `src/lib/organic-channels/rollup-step.ts` copying
  `src/lib/outbound/retry-step.ts:27-41` verbatim shape — `id: "go-rollup"`, `due: () => true`,
  `run` = for each project with links: recompute outcomes blob, prune `go_clicks` rows older
  than 90 days; counts `{projects, links, clicks30d, pruned}`; never throws
  (retry-step.ts:43-45). Register: append to `LEDGER_STEPS` at `src/lib/cron/ledgers.ts:87`.
- Kanály read: `src/lib/organic-channels/resolve.ts:28-58` `resolveOrganicChannels` — extend the
  result with `outcomes?: ChannelOutcome[]` (from the blob; absent = nothing measured).
  UI: `src/components/app/channels/ChannelTable.tsx` fit cell :88-95 gains the measured badge
  (clicks30d, title with lastClickAt) when an outcome row matches `c.name`; `T` dict :14-29 gains
  cs/en keys. `src/components/app/modules/OrganicChannels.tsx` passes outcomes through.
- Distribuce flip: `src/lib/distribution/provenance.ts:25-36` — `attributionLive` is the
  documented fail-closed seam; it becomes TRUE when ≥1 measured click exists. `sample.ts:36-49`
  untouched; `src/components/app/modules/distribution/AttributionTable.tsx` renders live rows
  (channel outcomes → `ChannelPerf`-shaped: reach = links, clicks = clicks30d — label the reach
  column honestly when live, e.g. "odkazy") instead of `attributionForProject` when live;
  `LearningsPanel.tsx:21,105` `rollupLearnings` (`learnings.ts:143-168`) receives the live
  `ChannelPerf[]` when live. `distribuce/page.tsx:36-37` wires it.
- Mint UI (small): `src/components/app/modules/distribution/VariantCard.tsx` gains a
  "měřený odkaz" copy action (POST mint → copy `/go/{id}` absolute URL) beside the existing
  copy; keep the card ≤200 LOC — extract if it would grow past.
- visibility-plan: `src/lib/organic-channels/visibility-plan.ts` — `VisibilityRow` :104-125
  gains optional `measuredClicks?: number`; `buildVisibilityPlan` input gains
  `outcomes?: ChannelOutcome[]`; `visibility-plan-resolve.ts:32-77` passes them;
  `VisibilityPlanRow.tsx` shows the number when present.
- **modes.ts ownership (channel-research measured grounding):**
  `src/lib/ai-types.ts:28,44` region — `ChannelResearchRequest` gains
  `measured?: Array<{ channel: string; clicks30d: number; links: number }>` (≤12 rows).
  Prompt: `src/lib/ai/tools/channel-research.ts` `buildChannelResearchPrompt` :91-117 gains a
  "Měřené výsledky (kliknutí za 30 dní z vlastních odkazů)" block with the anti-fabrication
  line (numbers are ground truth; nevymýšlej si čísla) and the instruction that measured
  channels' fit should reflect real clicks. Validator: `src/lib/ai/validation.ts` (~:1144
  region) accepts+sanitizes `measured`. Grounding builder:
  `src/lib/organic-channels/grounding.ts` `buildKanalyGrounding` :187 includes outcomes;
  `kanaly/page.tsx:37-61` already wires reads. Mode entry `modes.ts:461-467` likely unchanged
  (validate covers it); registry `test-llm/registry.mjs` fixture: if `llm:gate:check` reports
  drift, `npm run llm:eval:update -- --reason "channel-research grounds on measured /go clicks"`.
- Cascade: `delete-cascade.ts` gains `{ name: "go-links", delete }` (clear links + clicks for
  the project) — seam request, anchor `delete-cascade.ts:78` region.
- Test harness: `test-unit/campaigns-local-store.test.mjs:1-30` temp-db shape
  (`SYSTEDO_DB_FILE` + `LOCAL_DB=true` before dynamic import).

## Data contract
```ts
// src/lib/organic-channels/outcomes.ts
export interface GoLink { id: string; userId: string; projectId: string; url: string;
  channel: string; campaign: string; createdAt: string }        // id: 10-char base36 random
export interface GoClickDay { linkId: string; day: string; count: number }  // day = UTC YYYY-MM-DD
export interface ChannelOutcome { channel: string; links: number; clicks7d: number;
  clicks30d: number; lastClickAt?: string }                     // ISO day of newest counted day
export interface OrganicOutcomes { channels: ChannelOutcome[]; updatedAt: string }
export const GO_LINK_CAP = 200;          // per project; mint refuses past the cap (409 cap)
export const GO_CLICK_RETENTION_DAYS = 90;
```
Store API: `saveGoLink`, `getGoLink(id)`, `listGoLinks(projectId)`, `bumpGoClick(linkId, day)`,
`listGoClickDays(linkIds, sinceDay)`, `pruneGoClicks(beforeDay)`, `clearGoLinks(userId, projectId)`.

Sqlite (seam request, migration **v27** — append after `db.ts:1032`; contiguity test
`test-unit/db-migrations.test.mjs:10` LATEST bump is also a seam request):
```sql
CREATE TABLE IF NOT EXISTS go_links (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
  url TEXT NOT NULL, channel TEXT NOT NULL, campaign TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_go_links_project ON go_links (project_id);
CREATE TABLE IF NOT EXISTS go_clicks (
  link_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, day)
);
```
Firestore: `goLinks/{id}` (projectId field, query by field); clicks
`goLinks/{id}/days/{day}` with `FieldValue.increment`.

## Invariants
- ADR-0001 both backends; ADR-0002 mint route keys off `requireOwnedProject`, never the body;
  the PUBLIC route reads only by link id and writes only the counter.
- ADR-0003: the only provider call stays inside `channel-research.ts`'s existing
  `generateStructured` (:298 tag) — this WP adds grounding, not calls.
- Honest labels: measured numbers appear ONLY where clicks exist; the sample gutter/provenance
  contract (`provenance.ts:39-59`, `isProvenanceCoherent` :77-81) stays coherent — extend the
  fixture test rather than fight it.
- Cache Components: no `export const dynamic` anywhere, including `/go/[id]/route.ts`.

## Build steps
1. `outcomes.ts` pure types + `rollupChannelOutcomes` + `test-unit/organic-outcomes.test.mjs`
   (7d/30d windows, retention boundary, channel grouping, bot-skip predicate; ≥8 assertions).
2. Store trio + `test-unit/organic-outcomes-store.test.mjs` (mint idempotency, cap, bump
   increment, since-day read, prune, clear; ≥8).
3. Routes (`/go/[id]`, `go-links`) + redirect test (302 target carries utm_source/medium/
   campaign; 404 unknown; bot not counted).
4. Rollup step + `LEDGER_STEPS` append + `test-unit/cron-ledgers.test.mjs`-shaped step test.
5. Kanály + Distribuce + visibility-plan UI seams; provenance flip pinned in
   `test-unit/distribution-provenance.test.mjs` (or the suite that owns `panelProvenance`).
6. `measured` grounding (ai-types, prompt, validation, kanaly grounding) + golden re-fingerprint
   if the gate asks; `npm run llm:gate:check` green. LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/organic-channels src/lib/distribution src/app/go
"src/app/api/projects/[id]/go-links" src/components/app/channels src/components/app/modules/distribution
src/lib/ai/tools/channel-research.ts` · `npm run test:unit` · `npm run llm:gate:check`.
Do NOT run `npm run test:llm` (Director does on landing).

## Acceptance
- Redirect fixture: GET `/go/{id}` → 302, `Location` contains `utm_source=<channelUtmSource>`,
  `utm_medium=distribution`; counter row `{day, count:1}` present (pinned).
- `rollupChannelOutcomes` over a 3-link fixture → exact `clicks7d/clicks30d` per channel (pinned).
- `panelProvenance` with live outcomes → `attribution: true` (pinned; sample path unchanged).
- `npm run llm:gate:check` exit 0; if the fingerprint moved, CHANGELOG has the
  `channel-research | <from> | <to> | <reason>` row.
- ≥20 new assertions total.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `src/lib/db.ts` v27 after :1032 + DDL after the last `CREATE TABLE` (:573 region);
  `test-unit/db-migrations.test.mjs:10` LATEST; table-count comments `db.ts:612` and `:1184`
  (38 → new count).
- `delete-cascade.ts` go-links entry; `duplicate-cascade.ts` exclusion comment (a click ledger
  is operating data — not copied).
- `context-map.json` (Director).
- NOTE for the Director: `src/lib/ai-types.ts` and `src/lib/ai/validation.ts` are co-owned with
  W2-C this wave — they land whole with the later WP (both commit messages note it).

## Rollback
Revert; `go_links`/`go_clicks` inert; public `/go/{id}` 404s after revert (dead short links in
the wild are acceptable — they were never promised durable); the golden row reverts with the
prompt change or `llm:gate:check` reports stale.
