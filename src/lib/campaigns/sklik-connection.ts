/** Per-user Sklik API connection store — backend dispatcher (local node:sqlite when
 *  LOCAL_DB, else Firestore). Persists a user's ENCRYPTED Sklik API token so live
 *  Sklik sync (data-in) needs no re-entry and no global env token. Keyed by userId
 *  (a Seznam login is a per-user credential, unlike a Google Ads MCC which fans out
 *  to many customer accounts), so one row per user. The token blob never leaves the
 *  server decrypted except in the connector's sync path; the client only ever learns
 *  whether one is stored. Server-only.
 *
 *  Reuses the round-7 token-crypto (AES-256-GCM, per-token v2 salt) from the
 *  inventory context — the same at-rest posture the warehouse connection uses, so
 *  there is exactly ONE token-encryption implementation in the codebase. */
import { LOCAL_DB } from "@/lib/local-mode";
import { decryptToken } from "@/lib/inventory/token-crypto";

/** Direction 3 — the per-connection money-unit verdict a live sync recorded. */
export type SklikMoneyVerdict = "czk-plausible" | "halere-suspected" | "insufficient-data";

/** The stored record. `tokenEnc` is the AES-GCM blob from token-crypto.ts. The
 *  haléře fields (Direction 3) are the per-connection money-unit setting: absent /
 *  false = native CZK (current, default); true = the owner confirmed Sklik reports
 *  haléře, so the connector divides money by 100 GOING FORWARD. */
export interface SklikConnection {
  tokenEnc: string;
  connectedAt: string;
  /** Direction 3: the last live sync's money-unit verdict (diagnostic, surfaced in
   *  the provenance popover). Never itself changes the conversion. */
  moneyVerdict?: SklikMoneyVerdict;
  moneyVerdictAt?: string;
  /** Direction 3: the owner confirmed the haléře conversion. Drives moneyToCzk's
   *  divide-by-100 mode from the NEXT sync on; never rewrites already-synced data. */
  halereConfirmed?: boolean;
  halereConfirmedAt?: string;
}

/** Client-safe view — never any token bytes, just whether one is stored (+ the
 *  Direction-3 money-unit status the connect card / provenance popover surface). */
export interface PublicSklikConnection {
  connected: boolean;
  connectedAt?: string;
  moneyVerdict?: SklikMoneyVerdict;
  halereConfirmed?: boolean;
}

/** A stored connection with its owner id — for the cron re-sync fan-out. */
export interface OwnedSklikConnection {
  userId: string;
  connection: SklikConnection;
}

/** Strip the token; keep the client-safe status. */
export function publicSklikConnection(c: SklikConnection | null): PublicSklikConnection {
  if (!c) return { connected: false };
  return {
    connected: true,
    connectedAt: c.connectedAt,
    ...(c.moneyVerdict ? { moneyVerdict: c.moneyVerdict } : {}),
    ...(c.halereConfirmed ? { halereConfirmed: true } : {}),
  };
}

function backend() {
  return LOCAL_DB ? import("./sklik-connection.local") : import("./sklik-connection.firestore");
}

export async function getSklikConnection(userId: string): Promise<SklikConnection | null> {
  return (await backend()).getSklikConnection(userId);
}

export async function saveSklikConnection(userId: string, conn: SklikConnection): Promise<void> {
  return (await backend()).saveSklikConnection(userId, conn);
}

export async function deleteSklikConnection(userId: string): Promise<void> {
  return (await backend()).deleteSklikConnection(userId);
}

/** Every user with a stored per-user Sklik token — the extra source the scheduled
 *  sync unions onto the Google-connected set so Sklik-only users cron-sync daily. */
export async function listSklikConnectedUserIds(): Promise<string[]> {
  return (await backend()).listSklikConnectedUserIds();
}

/** The decrypted Sklik token for a user, or null when none is stored / the crypto
 *  secret is missing or the blob fails its auth tag. Server-only (the connector's
 *  sync path is the ONLY caller). */
export async function getSklikToken(userId: string): Promise<string | null> {
  const c = await getSklikConnection(userId);
  if (!c?.tokenEnc) return null;
  return decryptToken(c.tokenEnc);
}
