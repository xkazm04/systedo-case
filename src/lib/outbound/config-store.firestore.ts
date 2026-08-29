/** Webhook endpoint config — FIRESTORE backend (`users/{uid}/webhookConfigs/
 *  {projectId}`). Server-only; the dispatcher imports it lazily so the LOCAL_DB path
 *  never pulls firebase-admin in. Mirrors the local backend's interface exactly.
 *
 *  The doc lives UNDER the owner (`users/{uid}/…`), not under the project, so the
 *  encrypted signing secrets inherit the same per-user containment the BYOM keys and
 *  warehouse tokens already have — and `listUserWebhookConfigs` is one bounded
 *  sub-collection read, no collection-group query and no composite index. */
import { firestore } from "@/lib/firebase";
import { EMPTY_WEBHOOK_CONFIG, type OwnedWebhookConfig } from "./config-store";
import type { WebhookConfig, WebhookEndpoint } from "./types";

function configDoc(userId: string, projectId: string) {
  return firestore.collection("users").doc(userId).collection("webhookConfigs").doc(projectId);
}

/** Coerce a stored doc into the config shape. A doc whose `endpoints` is missing or
 *  not an array reads as empty rather than throwing (the local twin's posture). */
function toConfig(d: FirebaseFirestore.DocumentData | undefined): WebhookConfig {
  const endpoints = d?.endpoints;
  if (!Array.isArray(endpoints)) return EMPTY_WEBHOOK_CONFIG;
  return { endpoints: endpoints as WebhookEndpoint[] };
}

export async function getWebhookConfig(userId: string, projectId: string): Promise<WebhookConfig> {
  const doc = await configDoc(userId, projectId).get();
  return doc.exists ? toConfig(doc.data()) : EMPTY_WEBHOOK_CONFIG;
}

export async function saveWebhookConfig(
  userId: string,
  projectId: string,
  config: WebhookConfig
): Promise<void> {
  // Drop undefined fields so Firestore never stores an explicit `undefined`
  // (the connection-store.firestore.ts rule, applied per endpoint).
  const endpoints = config.endpoints.map((e) =>
    Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined))
  );
  await configDoc(userId, projectId).set({ endpoints, updatedAt: new Date().toISOString() });
}

export async function clearWebhookConfig(userId: string, projectId: string): Promise<void> {
  await configDoc(userId, projectId).delete();
}

export async function listUserWebhookConfigs(userId: string): Promise<OwnedWebhookConfig[]> {
  const snap = await firestore.collection("users").doc(userId).collection("webhookConfigs").get();
  return snap.docs.map((doc) => ({
    userId,
    projectId: doc.id,
    config: toConfig(doc.data()),
  }));
}
