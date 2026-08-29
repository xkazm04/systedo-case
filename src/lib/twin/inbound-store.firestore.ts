/** Twin intake endpoints — FIRESTORE backend (cloud / production, WP W3-D). One doc per
 *  token at `twinInboundTokens/{token}`: a GLOBAL, token-keyed registry (the `feedTokens`
 *  shape), NOT a per-tenant subcollection — see the dispatcher's header for why the
 *  public intake route needs a single addressable read.
 *
 *  The by-project lookup goes through ONE derived field, `tenant` (the repo's standard
 *  `u_{userId}_proj_{projectId}` key), rather than a two-field conjunction: a
 *  single-field equality query runs on Firestore's automatic index, while
 *  `where(userId).where(projectId)` would need a composite index deployed before the
 *  first mint could be read back. `userId`/`projectId` are still stored as their own
 *  fields — they are what the route actually reads, and a human debugging a document
 *  should not have to parse a key to see who owns it.
 *
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import { buildTenantKey } from "@/lib/campaigns/store-keys";
import { isTwinChannel, type TwinChannel } from "./types";
import { MAX_INBOUND_ENDPOINTS, type TwinInboundToken } from "./inbound-store";

/** Firestore's hard limit is 500 writes per batch; stay under it with headroom. */
const BATCH_SIZE = 400;

interface TokenDoc {
  userId: string;
  projectId: string;
  channel: string;
  secretEnc: string;
  createdAt: string;
  tenant: string;
}

function tokens() {
  return firestore.collection("twinInboundTokens");
}

/** Same degradation as the local backend: an unrecognised stored channel reads as the
 *  generic `email` dialect rather than widening the closed union. */
const toChannel = (v: string): TwinChannel => (isTwinChannel(v) ? v : "email");

const toToken = (token: string, doc: TokenDoc): TwinInboundToken => ({
  token,
  userId: doc.userId,
  projectId: doc.projectId,
  channel: toChannel(doc.channel),
  secretEnc: doc.secretEnc,
  createdAt: doc.createdAt,
});

export async function getByToken(token: string): Promise<TwinInboundToken | null> {
  const snap = await tokens().doc(token).get();
  return snap.exists ? toToken(snap.id, snap.data() as TokenDoc) : null;
}

export async function listByProject(userId: string, projectId: string): Promise<TwinInboundToken[]> {
  const snap = await tokens()
    .where("tenant", "==", buildTenantKey(userId, projectId))
    .limit(MAX_INBOUND_ENDPOINTS)
    .get();
  return snap.docs
    .map((d) => toToken(d.id, d.data() as TokenDoc))
    .sort((a, b) => a.token.localeCompare(b.token));
}

export async function insert(row: TwinInboundToken): Promise<void> {
  const doc: TokenDoc = {
    userId: row.userId,
    projectId: row.projectId,
    channel: row.channel,
    secretEnc: row.secretEnc,
    createdAt: row.createdAt,
    tenant: buildTenantKey(row.userId, row.projectId),
  };
  await tokens().doc(row.token).set(doc);
}

/** The channel is filtered IN MEMORY rather than as a second `where`: a two-equality
 *  conjunction is the one shape that can need a composite index deployed before the
 *  first read works, and the tenant's endpoint list is bounded by the closed channel
 *  union (≤ 7 docs), so the filter costs nothing. Same reasoning as the dispatcher's
 *  single-field `tenant` key. */
export async function deleteForChannel(
  userId: string,
  projectId: string,
  channel: TwinChannel
): Promise<number> {
  const snap = await tokens().where("tenant", "==", buildTenantKey(userId, projectId)).get();
  return deleteRefs(snap.docs.filter((d) => (d.data() as TokenDoc).channel === channel).map((d) => d.ref));
}

export async function deleteForProject(userId: string, projectId: string): Promise<number> {
  const snap = await tokens().where("tenant", "==", buildTenantKey(userId, projectId)).get();
  return deleteRefs(snap.docs.map((d) => d.ref));
}

type DocRef = ReturnType<ReturnType<typeof tokens>["doc"]>;

async function deleteRefs(refs: DocRef[]): Promise<number> {
  if (refs.length === 0) return 0;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const ref of refs.slice(i, i + BATCH_SIZE)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}
