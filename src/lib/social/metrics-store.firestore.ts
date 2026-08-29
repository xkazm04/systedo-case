/** Social read-back counters — FIRESTORE backend (cloud / production, WP W3-D).
 *  `socialPostMetrics/{postId}/days/{day}`: one document per (post, UTC day), the day
 *  key as the document id so the write is an addressable `set()` — an overwrite, which
 *  is exactly the snapshot semantics the model requires (see ./metrics.ts).
 *
 *  `day` and `tenant` are ALSO stored as fields, and every query filters on those rather
 *  than on `__name__`. That is not redundancy: a COLLECTION GROUP query's `__name__`
 *  order is the full document PATH (`socialPostMetrics/<post>/days/<day>`), so a
 *  cross-post prune ordered by `__name__` would order by post first and silently prune
 *  the wrong rows. Filtering on the field is correct in both the per-post and the
 *  cross-post case, and each is a single-field equality/range query that runs on
 *  Firestore's automatic index — no composite index has to be deployed before the first
 *  read works.
 *
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { SocialMetricDay } from "./metrics";

/** Firestore's hard limit is 500 writes per batch; stay under it with headroom. */
const BATCH_SIZE = 400;

/** Rows touched by one prune / one tenant scrub. Bounded so a single call can never run
 *  unboundedly long inside a cron invocation's shared budget; the next run continues
 *  where this one stopped (both operations are idempotent). */
const SWEEP_LIMIT = 2000;

interface MetricDoc {
  day: string;
  tenant: string;
  reach: number;
  likes: number;
  comments: number;
}

const posts = () => firestore.collection("socialPostMetrics");
const days = (postId: string) => posts().doc(postId).collection("days");

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const toRow = (postId: string, id: string, doc: MetricDoc): SocialMetricDay => ({
  postId,
  day: typeof doc.day === "string" && doc.day ? doc.day : id,
  tenant: typeof doc.tenant === "string" ? doc.tenant : "",
  reach: num(doc.reach),
  likes: num(doc.likes),
  comments: num(doc.comments),
});

export async function upsertSocialMetricDay(row: SocialMetricDay): Promise<void> {
  const doc: MetricDoc = {
    day: row.day,
    tenant: row.tenant,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
  };
  // set() without merge: the row IS the snapshot, so a re-read replaces it wholesale.
  await days(row.postId).doc(row.day).set(doc);
}

export async function listPostMetricDays(
  postIds: readonly string[],
  sinceDay: string
): Promise<SocialMetricDay[]> {
  if (postIds.length === 0) return [];
  const out: SocialMetricDay[] = [];
  for (const postId of postIds) {
    const snap = await days(postId).where("day", ">=", sinceDay).get();
    for (const d of snap.docs) out.push(toRow(postId, d.id, d.data() as MetricDoc));
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.postId.localeCompare(b.postId));
}

export async function pruneSocialMetrics(beforeDay: string): Promise<number> {
  const snap = await firestore
    .collectionGroup("days")
    .where("day", "<", beforeDay)
    .limit(SWEEP_LIMIT)
    .get();
  return deleteRefs(snap.docs.map((d) => d.ref));
}

export async function clearSocialMetricsForTenant(tenant: string): Promise<void> {
  const snap = await firestore
    .collectionGroup("days")
    .where("tenant", "==", tenant)
    .limit(SWEEP_LIMIT)
    .get();
  await deleteRefs(snap.docs.map((d) => d.ref));
}

type DocRef = ReturnType<ReturnType<typeof days>["doc"]>;

async function deleteRefs(refs: DocRef[]): Promise<number> {
  if (refs.length === 0) return 0;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const ref of refs.slice(i, i + BATCH_SIZE)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}
