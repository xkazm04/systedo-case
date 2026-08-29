/** Outbound-feed tokens — FIRESTORE backend (cloud / production, WP W2-D). One doc per
 *  token at `feedTokens/{token}`: a GLOBAL, token-keyed registry (the microsite
 *  registry's shape), NOT a per-tenant subcollection — see the dispatcher's header for
 *  why the public route needs a single addressable read.
 *
 *  The by-project lookup goes through ONE derived field, `tenant` (the repo's standard
 *  `u_{userId}_proj_{projectId}` key), rather than a two-field
 *  `where(userId).where(projectId)` query: a single-field equality query runs on
 *  Firestore's automatic index, while the two-field conjunction would need a composite
 *  index deployed before the first mint could be read back. `userId`/`projectId` are
 *  still stored as their own fields — they are what the route actually reads, and a
 *  human debugging a document should not have to parse a key to see who owns it.
 *
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import { buildTenantKey } from "@/lib/campaigns/store-keys";
import type { FeedToken } from "./feed-token-store";

/** Firestore's hard limit is 500 writes per batch; stay under it with headroom. */
const BATCH_SIZE = 400;

interface TokenDoc {
  userId: string;
  projectId: string;
  createdAt: string;
  tenant: string;
}

function tokens() {
  return firestore.collection("feedTokens");
}

const toToken = (token: string, doc: TokenDoc): FeedToken => ({
  token,
  userId: doc.userId,
  projectId: doc.projectId,
  createdAt: doc.createdAt,
});

export async function getByToken(token: string): Promise<FeedToken | null> {
  const snap = await tokens().doc(token).get();
  return snap.exists ? toToken(snap.id, snap.data() as TokenDoc) : null;
}

export async function getByProject(userId: string, projectId: string): Promise<FeedToken | null> {
  const snap = await tokens().where("tenant", "==", buildTenantKey(userId, projectId)).limit(1).get();
  return snap.empty ? null : toToken(snap.docs[0]!.id, snap.docs[0]!.data() as TokenDoc);
}

export async function insert(row: FeedToken): Promise<void> {
  const doc: TokenDoc = {
    userId: row.userId,
    projectId: row.projectId,
    createdAt: row.createdAt,
    tenant: buildTenantKey(row.userId, row.projectId),
  };
  await tokens().doc(row.token).set(doc);
}

/** Delete every token the project owns; returns how many docs went. */
export async function deleteForProject(userId: string, projectId: string): Promise<number> {
  const snap = await tokens().where("tenant", "==", buildTenantKey(userId, projectId)).get();
  if (snap.empty) return 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.size;
}
