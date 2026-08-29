/** TWIN INTAKE ENDPOINTS (WP W3-D) — backend DISPATCHER (ADR-0001). Local node:sqlite
 *  when LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Server-only.
 *
 *  GLOBAL and token-addressed, the `feed_tokens` / microsite-registry shape: the token
 *  is a public address space every tenant shares, so the token is the KEY and the owner
 *  rides inside the row. That is precisely what lets the public intake route be a single
 *  addressable read that takes NO tenant from the wire — ADR-0002 inverted correctly:
 *  `(userId, projectId, channel)` come out of the row that the owner-guarded management
 *  route wrote, never out of the payload a machine POSTed.
 *
 *  TWO CREDENTIALS, DIFFERENT LIVES. The token in the path is a plaintext ADDRESS (like
 *  a feed token): it must be re-readable, because the operator has to paste the URL into
 *  a Meta app dashboard or a mail forwarder and re-read it later. The per-endpoint
 *  SECRET is a signing key and is treated like a webhook signing secret: minted from
 *  `outbound/secret-crypto.ts`, encrypted at rest under that module's own salt context
 *  (deliberately REUSED rather than forked — one seam, one rotation story), returned in
 *  plaintext exactly ONCE by the mint that creates it, and never logged.
 *
 *  ONE endpoint per (project, channel): minting replaces, which is also how a leaked
 *  address is revoked — delete-then-insert, so a crash between the two leaves the
 *  project with no endpoint (re-mintable) rather than a stale one the owner believes is
 *  gone. */
import "server-only";
import { randomBytes } from "node:crypto";
import { LOCAL_DB } from "@/lib/local-mode";
import { encryptSecret, hasWebhookCrypto, mintWebhookSecret } from "@/lib/outbound/secret-crypto";
import { isTwinChannel, type TwinChannel } from "./types";

export interface TwinInboundToken {
  /** 32 lowercase hex characters — the primary key / document id. */
  token: string;
  userId: string;
  projectId: string;
  channel: TwinChannel;
  /** AES-256-GCM blob (outbound/secret-crypto.ts) — NEVER sent to a client. */
  secretEnc: string;
  createdAt: string;
}

/** The client-safe view: the secret becomes a boolean. The plaintext is returned by
 *  the minting POST and by nothing else, ever. */
export interface PublicTwinInboundToken {
  token: string;
  channel: TwinChannel;
  hasSecret: boolean;
  createdAt: string;
}

/** 16 bytes = 128 bits, the width `mintFeedToken` and `mintWebhookSecret` use. */
export const TWIN_INBOUND_TOKEN_BYTES = 16;

/** How many intake endpoints one project may hold — one per channel, and the channel
 *  list is closed, so this is a belt-and-braces bound on the by-project read. */
export const MAX_INBOUND_ENDPOINTS = 7;

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** Checked BEFORE the store is touched, so a scan of junk paths costs no read. */
export function isInboundTokenShape(token: string | null | undefined): boolean {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function publicInboundToken(row: TwinInboundToken): PublicTwinInboundToken {
  return {
    token: row.token,
    channel: row.channel,
    hasSecret: Boolean(row.secretEnc),
    createdAt: row.createdAt,
  };
}

/** Whether the server can store a signing secret at all. A deployment without the key
 *  chain must refuse to mint (501) rather than keep a plaintext secret at rest — the
 *  warehouse/webhooks 501 posture. Re-exported so the route has one import. */
export { hasWebhookCrypto as hasInboundCrypto };

/** The public address a token answers on. RELATIVE on purpose: the deployment's own
 *  host is what the operator is looking at, and hard-coding an origin here is how a
 *  preview deployment hands somebody a production URL. The panel prefixes
 *  `location.origin`. Lives here rather than in the route because Next validates a
 *  `route.ts`'s exports and rejects anything that is not an HTTP method or a
 *  recognised config field. */
export function inboundPath(token: string): string {
  return `/api/twin/inbound/${token}`;
}

function backend() {
  return LOCAL_DB ? import("./inbound-store.local") : import("./inbound-store.firestore");
}

/** The row a token addresses, or null when unknown/revoked/malformed. The public
 *  intake route's ONLY input — everything it then does is keyed off this row. */
export async function getInboundToken(token: string): Promise<TwinInboundToken | null> {
  if (!isInboundTokenShape(token)) return null;
  return (await backend()).getByToken(token);
}

/** Every endpoint the project owns, `token` ascending (ADR-0001's capped-read rule:
 *  both drivers must select the same rows in the same order). */
export async function listInboundTokens(userId: string, projectId: string): Promise<TwinInboundToken[]> {
  return (await backend()).listByProject(userId, projectId);
}

/** Mint (or RE-mint) the endpoint for one channel, revoking any prior one first.
 *  Returns the row AND the plaintext secret — the only moment it exists outside the
 *  encrypted blob. Callers must gate on {@link hasInboundCrypto} first; this throws
 *  through `encryptSecret` otherwise rather than storing a plaintext secret. */
export async function mintInboundToken(
  userId: string,
  projectId: string,
  channel: TwinChannel,
  now: Date = new Date()
): Promise<{ row: TwinInboundToken; secret: string }> {
  if (!isTwinChannel(channel)) throw new Error("Neznámý kanál pro příjem zpráv.");
  const b = await backend();
  await b.deleteForChannel(userId, projectId, channel);
  const secret = mintWebhookSecret();
  const row: TwinInboundToken = {
    token: randomBytes(TWIN_INBOUND_TOKEN_BYTES).toString("hex"),
    userId,
    projectId,
    channel,
    secretEnc: encryptSecret(secret),
    createdAt: now.toISOString(),
  };
  await b.insert(row);
  return { row, secret };
}

/** Revoke one channel's endpoint. Returns whether there was one, so the route can
 *  answer honestly instead of reporting a revocation that never happened. */
export async function revokeInboundToken(
  userId: string,
  projectId: string,
  channel: TwinChannel
): Promise<boolean> {
  return (await (await backend()).deleteForChannel(userId, projectId, channel)) > 0;
}

/** Drop every intake endpoint the project owns — the delete-cascade's hook. A deleted
 *  project must not leave live public intake URLs minting drafts into a twin blob that
 *  no longer exists (the same orphan class the feed token is cascaded for). */
export async function clearInboundTokens(userId: string, projectId: string): Promise<void> {
  await (await backend()).deleteForProject(userId, projectId);
}
