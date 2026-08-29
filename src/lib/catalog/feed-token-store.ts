/** Outbound-feed TOKENS (WP W2-D) — backend DISPATCHER (ADR-0001). Local node:sqlite
 *  when LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Server-only.
 *
 *  GLOBAL and token-addressed, like the microsite registry (microsite/store.ts:6-9):
 *  the token is a public address space shared by every tenant, so the token is the key
 *  and the owner rides inside the row. That is what makes the public feed route a
 *  SINGLE addressable read with no wire-supplied tenant — ADR-0002's rule that the
 *  route trusts only the stored row, which was itself written behind
 *  `requireOwnedProject`.
 *
 *  The token is a CAPABILITY URL, not a secret to verify against: 128 bits of
 *  `randomBytes`, stored in PLAINTEXT as the primary key (unlike a webhook signing
 *  secret, outbound/secret-crypto.ts, which is encrypted because the server never needs
 *  to show it again). It must be retrievable — the panel re-shows the feed URL every
 *  time the owner opens it, and a merchant who cannot re-read their own feed URL after
 *  pasting it into Merchant Center would have to re-mint and re-paste it everywhere.
 *
 *  ONE token per project: minting replaces, which is also how a leaked URL is revoked —
 *  the old row is gone before the new one exists, so there is never a window where two
 *  addresses serve the same catalog. */
import "server-only";
import { randomBytes } from "node:crypto";
import { LOCAL_DB } from "@/lib/local-mode";

export interface FeedToken {
  /** 32 lowercase hex characters — the primary key / document id. */
  token: string;
  userId: string;
  projectId: string;
  createdAt: string;
}

/** 16 bytes = 128 bits, the same width `mintWebhookSecret` uses
 *  (outbound/secret-crypto.ts:73-74) — unguessable by any practical margin. */
export const FEED_TOKEN_BYTES = 16;

/** The only shape a stored token can have. Checked BEFORE the store is touched, so a
 *  scan of junk paths costs no read and cannot smuggle a wildcard into a query. */
const FEED_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isFeedTokenShape(token: string | null | undefined): boolean {
  return typeof token === "string" && FEED_TOKEN_PATTERN.test(token);
}

function backend() {
  return LOCAL_DB ? import("./feed-token-store.local") : import("./feed-token-store.firestore");
}

/** The row a token addresses, or null when the token is unknown, revoked or malformed.
 *  The public route's ONLY input — everything it then reads is keyed off this row. */
export async function getFeedToken(token: string): Promise<FeedToken | null> {
  if (!isFeedTokenShape(token)) return null;
  return (await backend()).getByToken(token);
}

/** The project's current token, or null when the owner has never minted one. */
export async function getProjectFeedToken(userId: string, projectId: string): Promise<FeedToken | null> {
  return (await backend()).getByProject(userId, projectId);
}

/** Mint a fresh token for the project, REVOKING any prior one first. Delete-then-insert
 *  rather than insert-then-delete: a crash between the two steps must leave the project
 *  with no feed URL (recoverable by minting again), never with a stale one the owner
 *  believes they revoked. */
export async function mintFeedToken(
  userId: string,
  projectId: string,
  now: Date = new Date()
): Promise<FeedToken> {
  const b = await backend();
  await b.deleteForProject(userId, projectId);
  const row: FeedToken = {
    token: randomBytes(FEED_TOKEN_BYTES).toString("hex"),
    userId,
    projectId,
    createdAt: now.toISOString(),
  };
  await b.insert(row);
  return row;
}

/** Revoke the project's token. Returns whether there was one to revoke, so the route
 *  can answer honestly instead of reporting a revocation that never happened. */
export async function revokeFeedToken(userId: string, projectId: string): Promise<boolean> {
  const removed = await (await backend()).deleteForProject(userId, projectId);
  return removed > 0;
}

/** Drop every token the project owns — the delete-cascade's hook. A deleted project
 *  must not leave a live public feed URL behind (the same orphan class the microsite
 *  registry is cascaded for). */
export async function clearFeedTokens(userId: string, projectId: string): Promise<void> {
  await (await backend()).deleteForProject(userId, projectId);
}
