# WP W3-D — Twin intake + social read-back (the safe half of "twin on the wire")
card #9 (safe half) · XL (narrowed to L: no autonomous delivery) · gate: policy (public HMAC routes; platform tokens) · wave 3

## Goal
Real inbound messages reach the Schránka: a per-project, HMAC-verified intake endpoint
mints pending `TwinDraft`s from Meta-/email-/GBP-shaped payloads (generic signed core +
a Meta flavour with the `hub.challenge` handshake). And real engagement reaches the
grounding: social providers learn an `insights` read, published posts keep their
`externalId`, a `social-readback` ledgers-cron step upserts per-(post, day) metric
counters, and the social tool's grounding block quotes what ACTUALLY worked. NO sends
originate anywhere in this WP — `sentAt` law untouched. Acceptance: signature
verify/replay pinned, intake mints exactly one pending draft per external message
(idempotent, pinned), Meta+LinkedIn insights adapters fixture-pinned, read-back step
recompute-idempotent (pinned), grounding line appears only with real data (pinned) —
≥30 assertions.

## Non-goals
- **No outbound anywhere**: intake never replies, read-back never posts, `decideDraft` /
  autonomy semantics untouched, `sentAt` still minted ONLY by
  `twin/send/route.ts:45,52-65`. Autonomous delivery is S2.
- No OAuth flows (accounts keep the existing raw-token POST,
  `api/social/accounts/route.ts:41-51`); no TikTok insights (no provider exists —
  `providers.ts:149-155`); no email POLLING (intake is push-only; SMTP/IMAP is S2's).
- No new inbox entity: an inbound message IS a pending `TwinDraft` with `reply: ""`
  (`types.ts:152-176` — the model already says `inbound` is the message being answered).
- Do not touch `src/lib/insights/aggregate.ts` (W3-A's), `modes.ts`/`dispatch.ts`
  (W3-B's — your grounding rides `resolveSocialContext` in `grounding.ts`? NO:
  `grounding.ts` is W3-A's this wave — put your summary builder in
  `src/lib/social/metrics.ts` and hand the ONE-LINE `resolveSocialContext` insert to the
  Director as a seam request).
- `src/lib/ai-types.ts`/`validation.ts`: co-owned (marked `// ── W3-D ──` hunks) — you
  likely need NO change (grounding is a string concat, `social.ts:70-72` constraint);
  report either way.

## Seams
- **Intake token store (NEW `src/lib/twin/inbound-store.ts` + `.local` + `.firestore`):**
  global token-keyed (the `feed_tokens` shape, `db.ts:1136-1150`): row
  `{ token (32-hex PK), userId, projectId, channel: TwinChannel, secretEnc, createdAt }`;
  secret minted+encrypted via the W1-E crypto (`outbound/secret-crypto.ts` — reuse its
  exports, salt context stays; if a distinct context string is needed, a NEW
  `twin-inbound-secret-v1` constant in YOUR file, not an edit there). Show-once UX like
  `WebhookEndpoints.tsx:127-133`. One endpoint per (project, channel), re-mint replaces.
- **Management route (NEW `src/app/api/projects/[id]/twin/inbound/route.ts`):**
  `requireOwnedProject`; GET (endpoints, secret never re-shown), POST mint/re-mint
  (returns `{ url, secret }` once), DELETE revoke. Activity records.
- **Intake route (NEW `src/app/api/twin/inbound/[token]/route.ts`):** PUBLIC — machines
  POST here, so it stays under `/api` and takes the sast waiver (seam request; the
  `feed/[token]` entry :8 is the template — "the token in the path plus an HMAC over the
  raw body IS the credential"). Contract:
  - GET: Meta verification handshake — `hub.mode=subscribe`, `hub.verify_token` must
    equal the endpoint's secret-derived verify token (SHA-256 of secret, hex — never the
    secret itself), echo `hub.challenge`; otherwise 403.
  - POST: 64 KB cap (`MAX_PAYLOAD_BYTES` precedent); RAW body read first; signature
    check BEFORE parsing: accept `x-adamant-signature` (`v1=<hex>` over `${ts}.${raw}`,
    `verifyOutboundSignature` — `outbound/types.ts:169-188`, 5-min replay window) OR
    `x-hub-signature-256` (`sha256=<hex>` HMAC over raw body with the endpoint secret,
    `timingSafeEqual` — Meta has no timestamp header; say so in code). Fail → 401
    constant-shape.
  - Normalize via per-channel adapters (below) → for each message: idempotency key
    `in_${sha256(externalId ?? raw).slice(0,16)}`; `mutateTwin(projectId, …)`
    (`twin/store.ts:33-38` — the ONLY safe write): skip if a draft with that id exists,
    else append `{ id, channel, contact, inbound, reply: "", questions: [],
    confidence: 0, risks: ["inbound"], status: "pending", autoApproved: false,
    createdAt }` — `enforceServerSent` semantics hold by construction (no `sent` ever
    minted here). Cap pending inbound drafts per project at 200 (oldest inbound-pending
    evicted; never evict operator-created drafts — mark yours with the `in_` prefix).
    Respond `{ ok, accepted, duplicates }`; per-message failures never 500 the batch.
- **Payload normalizers (NEW `src/lib/twin/inbound.ts`, pure):**
  `normalizeInbound(channel, body): InboundMessage[]` — three shapes, fixture-pinned:
  `meta` (page webhook `entry[].messaging[]`/`changes[].value` comment shape → social
  channel), `email` (a simple `{ from, subject, text }` JSON — the generic shape any
  mail-forwarder can send), `gbp` (review/question shape → reviews channel). Unknown
  fields dropped, text clamped (2000), NO HTML retained (strip tags). Each returns
  `{ externalId?, contact: { name?, handle? }, inbound: string, channel: TwinChannel }`.
- **Schránka provenance:** `TwinOutbox`/`TwinInboxModule` — inbound-minted drafts
  (id prefix `in_`) get a small "přijato" pill (channel-labelled); ≤ 20-line UI touch,
  extract if a component would pass 200 LOC.
- **externalId persistence:** `src/lib/social/types.ts:95-116` `SocialPost` gains
  `externalId?: string` (additive); `publish.ts:56` stops discarding it
  (`PublishResult` gains `externalId?`, the posts route/claim path persists it — find
  the `updatePost` call sites and thread it; pin: a published post stores the id).
- **Insights adapters:** `src/lib/social/providers.ts` — `SocialProvider` gains optional
  `insights?(post: { externalId }, ctx: { token; transport }): Promise<PostInsights>`;
  implement for `metaProvider` (`/{id}/insights?metric=post_impressions,…` Graph shape)
  and `linkedinProvider` (socialActions/statistics shape) — BOTH behind `configured()`,
  BOTH fixture-tested through the injectable transport
  (`test-unit/social-providers.test.mjs:16-26` shape), endpoint constants isolated with
  the "OFFLINE-UNVERIFIABLE SEAM" note verbatim (:82-90 precedent).
- **Metrics trio (NEW `src/lib/social/metrics-store.ts` + `.local` + `.firestore`):**
  the `go_clicks` shape: rows `(post_id, day, tenant, reach, likes, comments)` PK
  `(post_id, day)`, upsert-OVERWRITE (a read-back is a snapshot, not an increment —
  `rollup-step.ts:12-17` rationale), `listPostMetricDays(postIds, sinceDay)`,
  `pruneSocialMetrics(beforeDay)` (180d), `clearSocialMetricsForTenant(tenant)`.
- **Read-back step (NEW `src/lib/social/readback-step.ts`):**
  `SOCIAL_READBACK_STEP_ID = "social-readback"`, `due`: at most once per 6h (use
  `lastRunAt`); run = for each connected social user
  (`listConnectedSocialUserIds`, `connection.ts:66-68`): decrypt token
  (`getAccountToken` :110-113), list published posts with `externalId` (≤ 50 newest),
  call `provider.insights` per post (per-post try/catch, count failures), overwrite
  `(post, today)` rows; counts `{accounts, posts, updated, failed, pruned}`; skip
  entirely when no provider `configured()` (honest zero-work). Append to
  `LEDGER_STEPS` (`ledgers.ts:88` — yours). No sent-guard (idempotent overwrite).
- **Grounding:** NEW `src/lib/social/metrics.ts` —
  `socialPerformanceLines(posts, metricRows, locale): string` ("Nejlepší nedávné posty
  (reálná čísla): …" top-3 by reach with likes/comments; `""` when no rows — absence ≠
  zero). SEAM REQUEST (one insert, Director applies): concat into the `grounding`
  string inside `resolveSocialContext` (`src/app/api/ai/grounding.ts:287-300` region) —
  enters the prompt at `social.ts:59` with the fingerprint untouched (:70-72). Byte-pin
  the no-data path.
- **Integrations row:** `src/lib/integrations/compute.ts` — `IntItemId` gains
  `"twin-inbound"` (:29-52), `IntDetail` members (`inbound-none`/`inbound-live`),
  builder + array line (the `webhooksRow` :242-251 pattern), `ProvisionInput` signal
  (`inboundEndpoints?: number`); label tables (the closed unions force them). Copy
  tables in `IntegrationStatusModule.tsx` per the W1-E shape.
- Test recipes: `outbound-sign.test.mjs` (verify/replay), `sklik-adapter.test.mjs` /
  `social-providers.test.mjs` (fixture transports), `twin-commit.test.mjs` (mutateTwin),
  temp-db shape for the trios, `cron-ledgers` for the step.

## Data contract
```ts
// src/lib/twin/inbound.ts
export interface InboundMessage { externalId?: string;
  contact: { name?: string; handle?: string }; inbound: string; channel: TwinChannel }
export const INBOUND_TEXT_MAX = 2000;
export const INBOUND_PENDING_CAP = 200;
export const INBOUND_ID_PREFIX = "in_";
// src/lib/social/providers.ts (additive)
export interface PostInsights { reach: number; likes: number; comments: number }
// metrics rows
export interface SocialMetricDay { postId: string; day: string; tenant: string;
  reach: number; likes: number; comments: number }
export const SOCIAL_METRIC_RETENTION_DAYS = 180;
```
Sqlite (seam requests, migrations **v32** `twin_inbound_tokens` + **v33**
`social_post_metrics` — W3-B=v30, W3-C=v31; append after the current tail, never
renumber; SCHEMA DDL too; LATEST = highest present):
```sql
CREATE TABLE IF NOT EXISTS twin_inbound_tokens (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
  channel TEXT NOT NULL, secret_enc TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_twin_inbound_project ON twin_inbound_tokens (user_id, project_id);
CREATE TABLE IF NOT EXISTS social_post_metrics (
  post_id TEXT NOT NULL, day TEXT NOT NULL, tenant TEXT NOT NULL,
  reach INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (post_id, day)
);
CREATE INDEX IF NOT EXISTS idx_social_post_metrics_tenant ON social_post_metrics (tenant);
```
Firestore: `twinInboundTokens/{token}`; `socialPostMetrics/{postId}/days/{day}`.

## Invariants
- ADR-0002 inverted correctly: the intake resolves (userId, projectId) from the TOKEN
  ROW, never the wire; the twin write uses that projectId through `mutateTwin` only.
- Signature law: raw-body-before-parse, constant-time compare, replay window on the
  Adamant flavour, 401s indistinguishable (wrong token vs wrong sig vs stale ts).
- Secrets: encrypted at rest, shown once, never logged; a missing crypto key → 501
  `server-misconfigured` on mint (the `warehouse/route.ts:64-75` shape).
- Honesty: grounding lines only from real metric rows; the read-back never writes a row
  for a post it could not read (failed ≠ zero); sample messages
  (`store.ts:167-185`) untouched and never mixed with inbound drafts.
- No `export const dynamic`; best-effort appends never fail the caller.

## Build steps
1. `inbound.ts` normalizers + fixtures (meta/email/gbp, clamps, tag-strip; ≥8).
2. Token trio + crypto + management route + tests (mint/show-once/re-mint/revoke/501).
3. Intake route + tests (hub.challenge, both signature flavours, replay, idempotent
   mint, cap eviction protects operator drafts, batch partial failure; ≥10).
4. `externalId` persistence + `insights` adapters + fixture-transport pins (Meta URL +
   bearer + mapping; LinkedIn mapping; unconfigured → skip).
5. Metrics trio + read-back step + `LEDGER_STEPS` + idempotence pin (run twice →
   identical rows) + failed≠zero pin.
6. `metrics.ts` grounding builder (+ byte-pinned no-data) + the `resolveSocialContext`
   seam-request text; Schránka pill; integrations row; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/twin src/lib/social src/app/api/twin
"src/app/api/projects/[id]/twin" src/lib/integrations src/components/app/twin
src/components/app/modules/TwinInboxModule.tsx src/lib/cron/ledgers.ts` ·
`npm run test:unit` (all `twin-*`, `social-*`, `cron-ledgers` suites green) ·
`npm run llm:gate:check` (green — no registry change).

## Acceptance
- Meta handshake pinned; a signed POST with 2 messages (1 duplicate) → exactly 1 new
  pending draft, `accepted:1 duplicates:1` (pinned); tampered body → 401.
- Insights fixture: Meta transport called with the right URL+token, row
  `{reach, likes, comments}` exact; second run overwrites, not doubles (pinned).
- `socialPerformanceLines` byte-pinned with rows and `""` without.
- `grep -rn "sentAt" src/lib/twin src/app/api/twin` → no new mint sites (pinned in
  report, not a test).
- ≥30 new assertions.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `db.ts` v32+v33 + SCHEMA DDL + LATEST; table-count comments — Director settles.
- `.github/security/sast-allowlist.json` route-auth entry for
  `src/app/api/twin/inbound/[token]/route.ts` (reason: machines POST here and cannot
  sign in; the 128-bit path token + per-endpoint HMAC over the raw body ARE the
  credential; replay-window on the timestamped flavour; 64 KB cap; writes only a
  pending draft into the token's own project).
- `delete-cascade.ts`: `twin-inbound-tokens` deleter (+ import) and
  `social-metrics` deleter (`clearSocialMetricsForTenant(buildTenantKey(u,p))` — the
  tenant-keyed microsite shape :103) + cascade-suite fixtures for BOTH (wave-2 lesson).
- `duplicate-cascade.ts` exclusion bullets (intake tokens are secret addresses; metric
  rows are operating data).
- `src/app/api/ai/grounding.ts` `resolveSocialContext` one-line concat (verbatim insert
  + anchor — W3-A owns the file).
- `context-map.json` (Director).

## Rollback
Revert; both tables inert; minted intake URLs 404; inbound drafts already in twin blobs
are ordinary pending drafts (deletable in the UI); no send path ever existed to leak.
