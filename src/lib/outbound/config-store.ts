/** Per-project webhook endpoint configuration — backend DISPATCHER (ADR-0001: local
 *  node:sqlite when LOCAL_DB, else Firestore; the backend is imported LAZILY so the
 *  LOCAL_DB path never evaluates the firebase-admin module).
 *
 *  Shape: ONE JSON blob per `(userId, projectId)`, the connection-store.ts pattern —
 *  correct here because the config is BOUNDED (≤ MAX_ENDPOINTS endpoints, each a
 *  handful of fields). The delivery LOG is unbounded and append-heavy, so it is
 *  row-based instead; see ./delivery-store.ts.
 *
 *  ADR-0002: the key is `(userId, projectId)` and both components come from
 *  `requireOwnedProject`, never from the wire — so a config is addressable only by
 *  its owner and there is no cross-user read by construction. Server-only. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { WebhookConfig } from "./types";

/** A stored config plus its owner keys — the retry step's work list needs both to
 *  resolve an endpoint from a pending delivery. */
export interface OwnedWebhookConfig {
  userId: string;
  projectId: string;
  config: WebhookConfig;
}

/** The empty config a project with no endpoints reads as. A separate constant (not
 *  `null`) so every caller handles "no endpoints" the same way. */
export const EMPTY_WEBHOOK_CONFIG: WebhookConfig = { endpoints: [] };

function backend() {
  return LOCAL_DB ? import("./config-store.local") : import("./config-store.firestore");
}

/** This project's endpoints, or the empty config when none were ever saved. */
export async function getWebhookConfig(userId: string, projectId: string): Promise<WebhookConfig> {
  return (await backend()).getWebhookConfig(userId, projectId);
}

export async function saveWebhookConfig(
  userId: string,
  projectId: string,
  config: WebhookConfig
): Promise<void> {
  return (await backend()).saveWebhookConfig(userId, projectId, config);
}

/** Drop a project's whole webhook configuration — the settings "delete all" path and
 *  the project-delete cascade's entry point. */
export async function clearWebhookConfig(userId: string, projectId: string): Promise<void> {
  return (await backend()).clearWebhookConfig(userId, projectId);
}

/** Every project of ONE user that has a stored config. Cheap by design: the common
 *  case is zero rows, and it is what lets a tenant-keyed emit point (which knows a
 *  `tenant` string but not a projectId) resolve its project without a projects read
 *  — see ./emit.ts `emitOutboundForTenant`. */
export async function listUserWebhookConfigs(userId: string): Promise<OwnedWebhookConfig[]> {
  return (await backend()).listUserWebhookConfigs(userId);
}
