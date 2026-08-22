/** The INBOUND connector abstraction. Deliberately shaped as a SIBLING of
 *  `twin/connectors.ts` — same `id / label / labelEn / configured` + client-safe
 *  projection + degrade-at-write — and as a copy of `inventory/connection-store.ts`
 *  for the persisted record. That one SENDS; this one RECEIVES.
 *
 *  The core principle (docs/leads/design.md §C4): **polling is the universal
 *  baseline, webhooks are a cloud-only accelerator.** A self-hosted or LOCAL_DB
 *  deployment behind NAT cannot receive a webhook, so every connector must be able
 *  to `pull()`. The one place the principle breaks is WhatsApp — Meta exposes NO
 *  read endpoint at any tier — which is why `push_only` exists as an HONEST marker
 *  rather than a "WhatsApp (polling)" toggle that could never work.
 *
 *  Server-only by convention: a real connector holds secrets. */
import type { TwinChannel } from "@/lib/twin/types";
import type { LeadEvent } from "../types";

export const CONNECTOR_IDS = ["manual", "csv", "gsheet", "gmail", "whatsapp", "linkedin"] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

/** How a connector can be fed.
 *   - `poll`       the UNIVERSAL baseline; every connector implements it.
 *   - `webhook`    cloud-only accelerator; requires a public HTTPS endpoint.
 *   - `push_only`  the honest marker for WhatsApp: its `poll` drains OUR relay
 *                  queue, never Meta, because Meta has no read path. */
export const INGEST_MODES = ["poll", "webhook", "push_only"] as const;
export type IngestMode = (typeof INGEST_MODES)[number];

export interface ConnectorMeta {
  id: ConnectorId;
  /** cs */
  label: string;
  /** en */
  labelEn: string;
  /** which twin channel its events land on — REUSES the existing vocabulary rather
   *  than introducing a fourth channel enum (the repo already has three). */
  channel: TwinChannel;
  /** what it can do at all */
  modes: readonly IngestMode[];
  needsOAuth: boolean;
  needsToken: boolean;
  needsConfig: boolean;
  /** false ⇒ rendered as "coming soon", never connectable (the
   *  inventory/providers.ts posture — an honest unimplemented row beats a button
   *  that fails). */
  implemented: boolean;
  /** honest deployment caveat shown in the connect UI (cs / en). These are not
   *  marketing copy — they are the things that will otherwise surprise an operator
   *  after they have committed. */
  caveat?: string;
  caveatEn?: string;
}

/** Persisted per (user, project, connector). Mirrors `StoredConnection` field for
 *  field, plus a sync cursor and the webhook secret. NEVER serialised to a client. */
export interface StoredLeadConnection {
  connectorId: ConnectorId;
  /** AES-256-GCM blob from inventory/token-crypto (v2 per-token salts) */
  tokenEnc?: string;
  refreshTokenEnc?: string;
  tokenExpiresAt?: string;
  /** non-secret adapter config: gmail label ids, sheet id + range, WABA/phone ids,
   *  sponsoredAccount urn, … */
  config?: Record<string, unknown>;
  /** opaque, connector-defined resume point — the heart of polling idempotency:
   *    gmail    → historyId
   *    gsheet   → last row index + the file revisionId
   *    linkedin → submittedAtTimeRange lower bound (EPOCH MILLIS)
   *    whatsapp → relay queue cursor */
  cursor?: string;
  /** HMAC secret for the cloud webhook path (encrypted); absent in poll-only
   *  deployments */
  webhookSecretEnc?: string;
  connectedAt: string;
  /** last SUCCESS; a failure leaves it untouched (so "last synced" never lies) */
  lastSyncAt?: string;
  /** cleared on the next success */
  lastError?: string;
  lastErrorAt?: string;
  /** feeds classifySyncResult — transition-based alerting, so a broken connector
   *  alerts ONCE, not nightly */
  failCount?: number;
  /** GDPR data minimisation: how much of a message body may be stored. Default
   *  "snippet" — a connector that can see a whole mailbox is a large PII surface. */
  bodyRetention: "full" | "snippet" | "none";
}

/** Client-safe projection — token bytes become booleans (`publicConnection()`). */
export interface PublicLeadConnection {
  connectorId: ConnectorId;
  hasToken: boolean;
  hasWebhook: boolean;
  /** what is ACTUALLY running in this deployment, derived — never stored */
  mode: IngestMode;
  config?: Record<string, unknown>;
  connectedAt: string;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  health: "connected" | "degraded" | "failing" | "expired" | "disconnected";
  bodyRetention: StoredLeadConnection["bodyRetention"];
}

export interface PullResult {
  events: LeadEvent[];
  /** the resume point to persist; unchanged ⇒ nothing new arrived */
  cursor?: string;
  /** true when the provider signalled a STALE cursor (Gmail's 404 on an expired
   *  historyId) → the caller must full-sync. A full-sync fallback is not optional. */
  resetRequired?: boolean;
  /** a non-fatal error carried on the result rather than thrown */
  error?: string;
}

export interface PullOptions {
  limit: number;
  now: Date;
  projectId: string;
  /** raw material for the pull-by-paste connectors (csv/manual) */
  payload?: unknown;
}

export interface LeadConnector {
  meta: ConnectorMeta;
  /** env/credential presence — the twin's `configured` flag, per connector. */
  configured(): boolean;
  /** THE BASELINE. Every connector implements it. NEVER throws — an error rides
   *  the result so one failing tenant cannot abort a whole cron sweep. */
  pull(conn: StoredLeadConnection, opts: PullOptions): Promise<PullResult>;
  /** Cloud-only. Verifies the signature over the RAW body and normalises. Absent ⇒
   *  poll-only. (Raw body: `await req.text()`, never `req.json()` — re-encoding the
   *  body breaks an HMAC computed over the exact bytes.) */
  handleWebhook?(rawBody: string, headers: Headers, conn: StoredLeadConnection): Promise<LeadEvent[]>;
  /** cheap liveness probe for the Integrations readiness board */
  probe?(conn: StoredLeadConnection): Promise<{ ok: boolean; detail?: string }>;
}

/* ── projections + the write boundary ────────────────────────────────────────── */

/** Client-safe registry projection (twin's `connectorInfo()` pattern) — metadata
 *  only: no functions, no secrets. */
export function leadConnectorInfo(registry: readonly LeadConnector[]): ConnectorMeta[] {
  return registry.map((c) => ({ ...c.meta }));
}

/** Degrade an unknown or unimplemented id to `manual` AT THE WRITE BOUNDARY
 *  (`storableConnectorId`'s posture). A stored id must always resolve to something
 *  the code can actually run, so a stale/typo'd id can never brick a connection. */
export function storableLeadConnectorId(
  id: string,
  registry: readonly LeadConnector[]
): ConnectorId {
  const found = registry.find((c) => c.meta.id === id);
  if (found && found.meta.implemented) return found.meta.id;
  return "manual";
}

/** The mode actually in force for a deployment. DERIVED, never stored: a stored
 *  "webhook" would keep claiming webhooks after a move to a NAT'd box. */
export function resolveIngestMode(
  meta: ConnectorMeta,
  ctx: { hasWebhookSecret: boolean; localDb: boolean; publicBaseUrl?: string }
): IngestMode {
  if (meta.modes.includes("push_only")) return "push_only";
  const canWebhook =
    meta.modes.includes("webhook") && ctx.hasWebhookSecret && !ctx.localDb && Boolean(ctx.publicBaseUrl);
  return canWebhook ? "webhook" : "poll";
}

/** Connection health from the stored record. Transition-based alerting lives in
 *  `inventory/sync-health.ts`; this is only the label the UI renders. */
export function connectionHealth(
  conn: StoredLeadConnection,
  now: Date = new Date()
): PublicLeadConnection["health"] {
  if (conn.tokenExpiresAt && Date.parse(conn.tokenExpiresAt) < now.getTime()) return "expired";
  const fails = conn.failCount ?? 0;
  if (fails >= 3) return "failing";
  if (fails > 0 || conn.lastError) return "degraded";
  return "connected";
}

/** Strip every secret from a stored connection. The ONLY shape that may cross to a
 *  client. */
export function publicLeadConnection(
  conn: StoredLeadConnection,
  meta: ConnectorMeta,
  ctx: { localDb: boolean; publicBaseUrl?: string },
  now: Date = new Date()
): PublicLeadConnection {
  return {
    connectorId: conn.connectorId,
    hasToken: Boolean(conn.tokenEnc),
    hasWebhook: Boolean(conn.webhookSecretEnc),
    mode: resolveIngestMode(meta, {
      hasWebhookSecret: Boolean(conn.webhookSecretEnc),
      localDb: ctx.localDb,
      publicBaseUrl: ctx.publicBaseUrl,
    }),
    ...(conn.config ? { config: conn.config } : {}),
    connectedAt: conn.connectedAt,
    ...(conn.lastSyncAt ? { lastSyncAt: conn.lastSyncAt } : {}),
    ...(conn.lastError ? { lastError: conn.lastError } : {}),
    ...(conn.lastErrorAt ? { lastErrorAt: conn.lastErrorAt } : {}),
    health: connectionHealth(conn, now),
    bodyRetention: conn.bodyRetention,
  };
}
