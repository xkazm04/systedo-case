/** Dependent-side orphan walk — FIRESTORE enumerator, session-scoped by the same
 *  doctrine as the orphans route: it acts as exactly one user and physically cannot
 *  reach another tenant's data. Enumerates the user-attributable namespaces:
 *
 *   • users/{uid}/projectState — doc ids are `{projectId}__{key}`;
 *   • tenants — doc ids with the `u_{safeUid}_proj_` prefix (listDocuments, which
 *     also returns MISSING ancestor docs that still have subcollections — the shape
 *     a half-failed recursiveDelete leaves behind);
 *   • microsites — the indexed `tenant` field, same prefix, via a range query.
 *
 *  DOCUMENTED LIMITATION (spec: docs/specs/2026-08-30-orphan-dependent-walk.md):
 *  Family-A root collections (docs keyed only by projectId, e.g. twinArchives) are
 *  not enumerable per-user without a cross-tenant scan, so the cloud walk covers
 *  the attributable namespaces only; the LOCAL walk has no such gap.
 *
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so
 *  the LOCAL_DB path never pulls firebase-admin in. Read-only. */
import { firestore } from "@/lib/firebase";
import { safeKeyComponent } from "@/lib/campaigns/store-keys";
import type { RawSighting } from "./orphan-walk";

/** `u_{safeUid}_proj_{pid}[_{suffix}]` — pid stops at `_` (ids are hex / `demo-…`). */
const TENANT_KEY = /^u_(.+)_proj_([^_]+)(?:_.+)?$/;

/** Every (projectId, namespace) sighting attributable to this user. */
export async function enumerateSightings(userId: string): Promise<RawSighting[]> {
  const sightings: RawSighting[] = [];
  const prefix = `u_${safeKeyComponent(userId)}_proj_`;

  // users/{uid}/projectState — `select()` fetches no field data, ids are enough.
  const stateSnap = await firestore
    .collection("users")
    .doc(userId)
    .collection("projectState")
    .select()
    .get();
  for (const doc of stateSnap.docs) {
    const sep = doc.id.indexOf("__");
    const projectId = sep >= 0 ? doc.id.slice(0, sep) : doc.id;
    sightings.push({ projectId, seenIn: "projectState", userId });
  }

  // tenants — listDocuments returns refs (no reads) including missing ancestors.
  const tenantRefs = await firestore.collection("tenants").listDocuments();
  for (const ref of tenantRefs) {
    if (!ref.id.startsWith(prefix)) continue;
    const m = TENANT_KEY.exec(ref.id);
    if (m) sightings.push({ projectId: m[2]!, seenIn: "tenants", userId });
  }

  // microsites — tenant is an indexed field; prefix range over this user's keys.
  const msSnap = await firestore
    .collection("microsites")
    .where("tenant", ">=", prefix)
    .where("tenant", "<", `${prefix}`)
    .select("tenant")
    .get();
  for (const doc of msSnap.docs) {
    const m = TENANT_KEY.exec((doc.data().tenant as string) ?? "");
    if (m) sightings.push({ projectId: m[2]!, seenIn: "microsites", userId });
  }

  return sightings;
}
