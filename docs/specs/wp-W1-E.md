# WP W1-E — Per-project outbound event bus: signed webhooks + delivery log
card #29 · L · gate: policy (tenant-supplied URLs; secrets at rest) · wave 1

## Goal
A project owner registers up to 3 webhook endpoints (URL + event filter); every alert, digest, report
and warehouse-sync-failure for THAT project is POSTed to them as a signed JSON event with a durable
delivery log and a retry step on the ledgers cron — instead of every tenant's alerts landing on the one
operator `ALERT_WEBHOOK_URL`. Acceptance: the five emit points each produce exactly one `OutboundEvent`
(pinned), a delivery is HMAC-signed and verifiable with the stored secret (pinned), a failed delivery is
retried by the `webhook-retry` ledger step with backoff and gives up after 5 attempts (pinned), and every
POST goes through the SSRF-guarded sender (grep-pinned: no bare `fetch` to an endpoint URL).

## Non-goals
- The operator channel stays: `sendWebhook` (`email.ts:32-44`) is untouched; the AI-ops rollup
  (`digest/route.ts:276-278`) stays operator-only.
- No inbound webhooks (W3-D). No Zapier-style templates. No per-event UI beyond the settings card + log.
- Do not edit `db.ts`, `delete-cascade.ts`, `vercel.json`, `sast-allowlist.json`, `context-map.json` —
  seam requests. Do not touch `src/lib/cron/ledgers.ts` beyond appending ONE step to `LEDGER_STEPS`
  (`ledgers.ts:86`) — that line IS the registration ceremony and is yours.

## Seams
- Emit points (insert AFTER the durable write, in the best-effort position — `alerts.ts:269-277` ordering):
  `src/lib/campaigns/alerts.ts:289` (`tenant, userId, alertId, title, body, items`),
  `src/lib/campaigns/anomaly-alerts.ts:164`, `src/lib/inventory/sync-alerts.ts:45`
  (`userId, projectId, providerId`), `src/app/api/cron/digest/route.ts:153` (`tenant, userId, project`),
  `src/app/api/cron/report/route.ts:142` (`project, brand, url, delivered`). Each is ONE line:
  `void emitOutbound(userId, projectId, { type, …payload })` (fire-and-forget, never awaited on the hot path
  except inside crons where you may `await` to make the count observable).
  Where only `tenant` is in scope, the project id is recoverable the way `digest/route.ts:162` already does
  (`project`) — pass `project.id`; alerts.ts callers already have `projectId` upstream (verify; if not, the
  emit takes `tenant` and resolves via `resolveProjectTenants` inverse — report which).
- SSRF guard: `src/lib/catalog/feed-fetch.ts:79` `isPublicIp`, `:89` `validateFeedUrl`, `:121-138`
  `guardedLookup`, GET-only `rawGet` `:146-162` (12 s timeout `:24`). Add `postGuarded(url, body, headers)` in a
  NEW `src/lib/outbound/send.ts` that reuses those exports (extend `feed-fetch.ts` with an exported
  `guardedRequest({method, body})` ONLY if `rawGet` cannot be reused without duplicating the BlockList — then
  `feed-fetch.ts` is in your write set for that one refactor, byte-identical GET behaviour pinned by
  `test-unit/catalog-feed-fetch*.test.mjs`).
- Secret at rest: copy `src/lib/inventory/token-crypto.ts` (v2 random salt, `createCipheriv` — SAST
  `deprecated-cipher` rule) into `src/lib/outbound/secret-crypto.ts` with salt context
  `"systedo-webhook-secret-v1"`, env `WEBHOOK_SECRET_KEY || AUTH_SECRET`; `hasWebhookCrypto()` → route returns
  501 `server-misconfigured` like `warehouse/route.ts:64-75`.
- Signing: `createHmac("sha256", secret)` over `${timestamp}.${rawBody}`; headers
  `X-Adamant-Signature: v1=<hex>`, `X-Adamant-Timestamp`, `X-Adamant-Event`, `X-Adamant-Delivery`.
  Verifier helper `verifyOutboundSignature(secret, ts, body, header)` uses `timingSafeEqual` over SHA-256
  digests (`cron-auth.ts` pattern) and rejects |now − ts| > 5 min.
- Config store (bounded → blob, `(userId, projectId)` key): copy `src/lib/inventory/connection-store.ts`
  (`get/save/delete/listAll`, `publicConnection` strips the secret → `hasSecret`).
- Delivery log (unbounded → rows): copy `src/lib/leads/store.ts` shape; `lead_events` PK
  `(project_id, dedup_key)` is the idempotency shape.
- Cron step: `src/lib/cron/ledgers.ts:41-53` (`LedgerStep`), `:78-86`; counts namespaced
  `webhook-retry.{retried,delivered,failed,gaveUp}`; `claimSentPeriod(tenant, "ledger-webhook-retry", period)`
  not needed (idempotent by delivery id + attempt).
- Routes: `src/app/api/projects/[id]/webhooks/route.ts` GET/PUT/DELETE (`requireOwnedProject`; PUT validates
  every URL with `validateFeedUrl` + https-only in production), `…/webhooks/test/route.ts` POST (sends a
  `ping` event now, returns the attempt), `…/webhooks/deliveries/route.ts` GET (`?limit=`).
- Integrations row: `src/lib/integrations/compute.ts:29-51` (`IntItemId` + `"webhooks"`), `:100-145`
  (`ProvisionInput.webhooks?: number`), `:232-271` rows (category `"reports"`, link `"nastaveni"`),
  `IntegrationStatusModule.tsx:66-74/:103-111` copy tables; probe in `integrations/status.ts` (degrades to 0).
- Settings card: `src/app/app/[projectId]/nastaveni/page.tsx:42-48` — insert `<WebhookEndpoints />` between
  `ByomMatrix` and `ProjectDangerZone`; copy `ByomKeys.tsx` card shape.
- Doctor: `scripts/doctor-rules.mjs:165,175` — add "per-project webhooks (WEBHOOK_SECRET_KEY)" capability line.
- Docs: `docs/deploy.md:30`, `.env.example:258` (add `WEBHOOK_SECRET_KEY` beside `ALERT_WEBHOOK_URL`).

## Data contract
```ts
// src/lib/outbound/types.ts — pure
export const OUTBOUND_EVENT_TYPES = ["alert.critical","alert.anomaly","digest.weekly","report.sent","sync.failed","ping"] as const;
export type OutboundEventType = (typeof OUTBOUND_EVENT_TYPES)[number];
export interface OutboundEvent { id: string; type: OutboundEventType; at: string; projectId: string;
  title: string; body: string; href?: string; data?: Record<string, unknown> }   // data: alert items / report url / provider
export interface WebhookEndpoint { id: string; url: string; events: OutboundEventType[] | "all"; enabled: boolean;
  secretEnc: string; createdAt: string; lastDeliveryAt?: string; lastStatus?: "ok" | "failed" }
export interface WebhookConfig { endpoints: WebhookEndpoint[] }   // ≤ 3; blob per (userId, projectId)
export interface Delivery { id: string; endpointId: string; eventId: string; type: OutboundEventType;
  status: "pending" | "ok" | "failed" | "gave-up"; attempts: number; nextAt: string | null;
  lastCode?: number; lastError?: string; createdAt: string; updatedAt: string; payload: string /* raw JSON */ }
export const DELIVERY_MAX_ATTEMPTS = 5;                       // backoff: 1m, 5m, 30m, 2h, 12h
export const DELIVERY_LOG_CAP = 500;                          // newest kept per project
export function backoffMs(attempt: number): number;
export function signPayload(secret: string, ts: string, raw: string): string;
export function verifyOutboundSignature(secret: string, ts: string, raw: string, header: string, now?: number): boolean;
export function endpointsFor(cfg: WebhookConfig, type: OutboundEventType): WebhookEndpoint[];
```
Stores: `src/lib/outbound/config-store{,.local,.firestore}.ts` (blob) and
`src/lib/outbound/delivery-store{,.local,.firestore}.ts` (rows: `append`, `listPending(now, limit)`,
`update(projectId, id, patch)`, `list(userId, projectId, limit)`, `clear(userId, projectId)`,
`listAllPending` for the cron). Emit: `src/lib/outbound/emit.ts` `emitOutbound(userId, projectId, ev)`:
loads config → for each matching enabled endpoint writes a `pending` Delivery then attempts once inline
(guarded POST, 12 s); success → `ok`; failure → `nextAt = now + backoffMs(1)`. Never throws.
Sqlite (seam request, migration **v25** — the Director numbers it; another WP may also claim v25):
```sql
CREATE TABLE IF NOT EXISTS webhook_configs (user_id TEXT NOT NULL, project_id TEXT NOT NULL, data TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY (user_id, project_id));
CREATE TABLE IF NOT EXISTS webhook_deliveries (project_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL,
  next_at TEXT, created_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (project_id, id));
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries (status, next_at);
```
Firestore: `users/{uid}/webhookConfigs/{projectId}`; `projects/{projectId}/webhookDeliveries/{id}` with a
collection-group query on `status == "pending"` for the cron (or `listAllConnections`-style enumeration of
configs then per-project pending reads — pick the one the fake supports and say which).

## Invariants
- ADR-0001 (two backends per store), ADR-0002 (config keyed by `(uid, projectId)` from `requireOwnedProject`),
  no `export const dynamic`. SAST `route-auth` passes by construction; no new allowlist entries expected —
  if `raw-engine-outside-seam` fires on a store file, it must be named `*.local.ts`/`*.firestore.ts`.
- SSRF: every outbound request resolves through `guardedLookup`; redirects are NOT followed for webhooks
  (a 3xx is a failure). Private/loopback URLs rejected at PUT time AND at send time (DNS rebinding).
- Secrets: the plaintext secret is shown ONCE in the PUT response (`secret` field) and never again; the log
  stores no secret; `publicEndpoint` strips `secretEnc`.
- Payload cap 64 KB; alert `items` truncated to 20 with `truncated: true`.

## UI
- `src/components/app/modules/WebhookEndpoints.tsx` (≤200 LOC; extract `WebhookDeliveryLog.tsx`): list ≤3
  endpoints (url, events, enabled, last status), add form (url + event checkboxes), "Odeslat test", secret
  reveal-once banner, delete; deliveries table (type, status, attempts, next, code) with `Pill` tones; `T` cs/en.

## Build steps
1. `types.ts` (sign/verify/backoff/endpointsFor) + `test-unit/outbound-sign.test.mjs` (≥10: sign round-trip,
   tamper, skew, backoff table, filter).
2. `secret-crypto.ts` + stores + `test-unit/outbound-stores-local.test.mjs` (temp-db pattern from
   `campaigns-local-store.test.mjs:1-30`; config CRUD, delivery append/pending/update/cap/clear).
3. `send.ts` guarded POST (+ `feed-fetch.ts` refactor only if unavoidable) + test with a local `http.createServer`
   on 127.0.0.1 — NOTE loopback is BLOCKED by the guard, so test the guard's refusal on loopback and test the
   signing/transport against an injected `request` function (dependency-injected `transport` param).
4. `emit.ts` + five one-line hooks + `test-unit/outbound-emit.test.mjs` (module-mock the stores; one event per
   emit point; disabled endpoint skipped; filter honoured; failure → pending with nextAt).
5. `webhook-retry` step + `test-unit/outbound-retry-step.test.mjs` (due every tick; retries only `nextAt ≤ now`;
   gives up at 5; counts namespaced).
6. Routes + UI + integrations row + doctor + docs; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/outbound "src/app/api/projects/[id]/webhooks" src/components/app/modules/WebhookEndpoints.tsx src/components/app/modules/WebhookDeliveryLog.tsx src/lib/integrations src/lib/cron/ledgers.ts src/lib/campaigns/alerts.ts src/lib/campaigns/anomaly-alerts.ts src/lib/inventory/sync-alerts.ts src/app/api/cron/digest src/app/api/cron/report` ·
`npm run test:unit` · `npm run sast` (report its output; it may be red on pre-existing findings — say which).

## Acceptance
- ≥35 new assertions; `grep -rn "emitOutbound(" src/lib src/app/api/cron` → 5 hooks + the definition.
- `grep -n "fetch(" src/lib/outbound/` → 0.

## Hotspot requests (seam requests, verbatim + anchor)
- `src/lib/db.ts` DDL + migration v25 (after `:922-927`), `test-unit/db-migrations.test.mjs:10`.
- `src/lib/projects/delete-cascade.ts:77` — `{ name: "webhooks", delete: (p, u) => clearWebhooks(u, p) }`
  (both stores). `duplicate-cascade.ts:17-24` exclusion note (operating data + secrets never copied).
- `.github/security/sast-allowlist.json` — only if a rule fires; give the reason text.
- `context-map.json` (Director).

## Rollback
Revert; tables inert; encrypted secrets unreadable by old code (harmless); pending deliveries stranded.
